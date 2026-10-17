import {
  isRelayTaskIssue,
  metadataIssues,
  parseIssueBody,
  priorityFromLabels,
  typeFromLabels,
  type TaskStatus,
} from '@relay/core';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '../db';
import type { Member, Task, Workspace } from '../db/schema';
import { newTaskId } from '../ids';
import { recordEvent } from './events';

export interface IssueLike {
  number: number;
  title: string;
  body?: string | null;
  state: string; // 'open' | 'closed'
  html_url?: string;
  user?: { login: string } | null;
  labels: (string | { name?: string | null })[];
}

export function labelNames(issue: Pick<IssueLike, 'labels'>): string[] {
  return issue.labels.map((l) => (typeof l === 'string' ? l : (l.name ?? ''))).filter(Boolean);
}

const ACTIVE_EDITABLE: TaskStatus[] = ['needs_triage', 'queued', 'waiting_window', 'blocked'];
const FINAL: TaskStatus[] = ['done', 'merged'];

/** Requester resolution (SPEC §8.3). */
export function resolveRequester(
  members: Member[],
  metaRequester: string | undefined,
  authorLogin: string | undefined,
): { member: Member | undefined; note: string | null } {
  const find = (login: string | undefined) =>
    login ? members.find((m) => m.githubLogin && m.githubLogin.toLowerCase() === login.toLowerCase()) : undefined;
  // Simulated members (demo mode) are referenced as "sim:<memberId>" and never as GitHub logins.
  if (metaRequester?.startsWith('sim:')) {
    const sim = members.find((m) => m.simulated && m.id === metaRequester.slice(4));
    if (sim) return { member: sim, note: null };
  }
  const byMeta = find(metaRequester);
  if (byMeta) return { member: byMeta, note: null };
  const byAuthor = find(authorLogin);
  if (byAuthor) return { member: byAuthor, note: null };
  const owner = members.find((m) => m.role === 'owner' && !m.simulated);
  return { member: owner, note: 'Requester is the workspace owner (author not a Relay member)' };
}

export type SyncOutcome = { action: 'created' | 'updated' | 'cancelled' | 'ignored' | 'reactivated'; task: Task | null; changed: boolean };

/**
 * Upsert a task from a GitHub issue (webhook, board creation, or initial import).
 * Idempotent: replaying the same issue yields the same task with no duplicate side effects.
 */
export async function syncIssue(ws: Workspace, issue: IssueLike, opts: { members?: Member[] } = {}): Promise<SyncOutcome> {
  const labels = labelNames(issue);
  const [existing] = await db()
    .select()
    .from(schema.tasks)
    .where(and(eq(schema.tasks.workspaceId, ws.id), eq(schema.tasks.issueNumber, issue.number)));

  const isTask = isRelayTaskIssue(labels) && issue.state === 'open';
  if (!isTask) {
    if (!existing || existing.status === 'cancelled' || FINAL.includes(existing.status)) return { action: 'ignored', task: existing ?? null, changed: false };
    const reason = issue.state !== 'open' ? 'Issue closed' : 'relay label removed';
    const [task] = await db()
      .update(schema.tasks)
      .set({ status: 'cancelled', statusReason: reason, runNow: false, triageNow: false, updatedAt: new Date() })
      .where(eq(schema.tasks.id, existing.id))
      .returning();
    await recordEvent({ workspaceId: ws.id, taskId: existing.id, kind: 'task_cancelled', message: `${existing.id} cancelled: ${reason}` });
    return { action: 'cancelled', task: task ?? null, changed: true };
  }

  const members = opts.members ?? (await db().select().from(schema.members).where(eq(schema.members.workspaceId, ws.id)));
  const parsed = parseIssueBody(issue.body);
  const type = parsed.meta.type ?? typeFromLabels(labels) ?? undefined;
  const meta = { ...parsed.meta, type };
  const valid = !parsed.malformed && metadataIssues(meta).length === 0;
  const fields = {
    title: issue.title.slice(0, 300),
    body: parsed.text,
    issueUrl: issue.html_url ?? null,
    type: type ?? 'docs',
    likelyFiles: meta.likelyFiles ?? [],
    doneCheck: meta.doneCheck ?? null,
    size: meta.size ?? null,
    targetPrNumber: meta.targetPr ?? null,
    priority: priorityFromLabels(labels),
  };
  const req = resolveRequester(members, meta.requester, issue.user?.login);
  if (!req.member) return { action: 'ignored', task: existing ?? null, changed: false };

  if (!existing) {
    const status: TaskStatus = valid ? 'queued' : 'needs_triage';
    const statusReason = [valid ? null : parsed.malformed ? 'Metadata block could not be parsed' : `Missing ${metadataIssues(meta).join(', ')}`, req.note]
      .filter(Boolean)
      .join(' · ') || null;
    for (let attempt = 0; attempt < 5; attempt++) {
      const inserted = await db()
        .insert(schema.tasks)
        .values({ id: newTaskId(), workspaceId: ws.id, issueNumber: issue.number, ...fields, requesterMemberId: req.member.id, status, statusReason })
        .onConflictDoNothing()
        .returning();
      if (inserted[0]) {
        await recordEvent({
          workspaceId: ws.id,
          taskId: inserted[0].id,
          memberId: req.member.id,
          kind: 'task_imported',
          message: `${inserted[0].id} #${issue.number} imported as ${status === 'queued' ? 'queued' : 'needs triage'}`,
          data: req.note ? { note: req.note } : null,
        });
        return { action: 'created', task: inserted[0], changed: true };
      }
      // Conflict: either the issue was inserted concurrently or the random id collided.
      const [race] = await db()
        .select()
        .from(schema.tasks)
        .where(and(eq(schema.tasks.workspaceId, ws.id), eq(schema.tasks.issueNumber, issue.number)));
      if (race) return syncIssue(ws, issue, { members });
    }
    throw new Error('Could not allocate a task id');
  }

  // Existing task: update metadata; adjust status only while the task isn't running/finished.
  let status = existing.status;
  let statusReason = existing.statusReason;
  let action: SyncOutcome['action'] = 'updated';
  if (existing.status === 'cancelled') {
    status = valid ? 'queued' : 'needs_triage';
    statusReason = valid ? null : 'Needs triage';
    action = 'reactivated';
  } else if (ACTIVE_EDITABLE.includes(existing.status)) {
    if (!valid && existing.status !== 'needs_triage') {
      status = 'needs_triage';
      statusReason = `Missing ${metadataIssues(meta).join(', ') || 'metadata'}`;
    } else if (valid && existing.status === 'needs_triage') {
      status = 'queued';
      statusReason = null;
    }
  }
  const changed =
    status !== existing.status ||
    fields.title !== existing.title ||
    fields.body !== existing.body ||
    fields.type !== existing.type ||
    JSON.stringify(fields.likelyFiles) !== JSON.stringify(existing.likelyFiles) ||
    fields.doneCheck !== existing.doneCheck ||
    fields.size !== existing.size ||
    fields.targetPrNumber !== existing.targetPrNumber ||
    fields.priority !== existing.priority ||
    req.member.id !== existing.requesterMemberId;
  if (!changed) return { action: 'ignored', task: existing, changed: false };
  const [task] = await db()
    .update(schema.tasks)
    .set({ ...fields, requesterMemberId: req.member.id, status, statusReason, updatedAt: new Date() })
    .where(eq(schema.tasks.id, existing.id))
    .returning();
  if (status !== existing.status) {
    await recordEvent({ workspaceId: ws.id, taskId: existing.id, kind: `task_${action}`, message: `${existing.id} ${existing.status} → ${status}` });
  }
  return { action, task: task ?? null, changed: true };
}
