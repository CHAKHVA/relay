import { buildJobPayload, fireText, planTick, recentTeamChanges, workspaceNow, type PlanAction } from '@relay/core';
import { and, count, eq, inArray } from 'drizzle-orm';
import { db, schema } from '../db';
import type { Member, Task, Workspace } from '../db/schema';
import { log } from '../http';
import { fire } from '../routine';
import { recordEvent } from './events';
import { loadMembers, loadTasks, toSched, toSeat } from './load';
import { withWorkspaceLock } from './lock';
import { ghName } from './names';
import { reconcileWorkspace } from './results';
import { syncStatusComment } from './status-comment';
import { MAX_ATTEMPTS } from '@relay/core';

export interface TickSummary {
  dispatched: number;
  waiting: number;
  blocked: number;
  reconciled: number;
}

/** The workspace clock: real now, plus the demo offset only in demo mode (SPEC §10.1). */
export function clockFor(ws: Pick<Workspace, 'demoMode' | 'clockOffsetMinutes'>, real = new Date()): Date {
  return workspaceNow(ws, real);
}

async function loadWorkspace(id: string): Promise<Workspace | null> {
  const [ws] = await db().select().from(schema.workspaces).where(eq(schema.workspaces.id, id));
  return ws ?? null;
}

/** One scheduler tick for a workspace, serialized by a Postgres advisory lock. Returns null if another tick holds the lock. */
export async function runTick(workspaceId: string, opts: { realNow?: Date } = {}): Promise<TickSummary | null> {
  return withWorkspaceLock(workspaceId, () => tickLocked(workspaceId, opts.realNow ?? new Date()), { wait: false });
}

async function tickLocked(workspaceId: string, realNow: Date): Promise<TickSummary> {
  const summary: TickSummary = { dispatched: 0, waiting: 0, blocked: 0, reconciled: 0 };
  const ws = await loadWorkspace(workspaceId);
  if (!ws || !ws.githubInstallationId || !ws.repoOwner) return summary;

  summary.reconciled = await reconcileWorkspace(ws, realNow);

  const now = clockFor(ws, realNow);
  const members = await loadMembers(ws.id);
  const tasks = await loadTasks(ws.id);
  const actions = planTick({ now, members: members.map(toSeat), tasks: tasks.map(toSched) });
  const touched = new Set<string>();

  for (const a of actions) {
    const task = tasks.find((t) => t.id === a.taskId);
    if (!task) continue;
    try {
      if (a.kind === 'dispatch') {
        if (await dispatch(ws, task, a, members, tasks, realNow)) {
          summary.dispatched++;
          touched.add(task.id);
        }
      } else if (a.kind === 'wait') {
        if (task.status !== a.status || task.statusReason !== a.statusReason || task.blockedByTaskId) {
          await db()
            .update(schema.tasks)
            .set({ status: a.status, statusReason: a.statusReason, blockedByTaskId: null, blockedOnFiles: null, updatedAt: new Date() })
            .where(and(eq(schema.tasks.id, task.id), inArray(schema.tasks.status, ['needs_triage', 'queued', 'waiting_window', 'blocked'])));
          touched.add(task.id);
        }
        summary.waiting++;
      } else {
        if (task.status !== 'blocked' || task.blockedByTaskId !== a.blockedByTaskId || task.statusReason !== a.statusReason) {
          await db()
            .update(schema.tasks)
            .set({ status: 'blocked', statusReason: a.statusReason, blockedByTaskId: a.blockedByTaskId, blockedOnFiles: a.blockedOnFiles, updatedAt: new Date() })
            .where(and(eq(schema.tasks.id, task.id), inArray(schema.tasks.status, ['queued', 'waiting_window', 'blocked'])));
          await recordEvent({ workspaceId: ws.id, taskId: task.id, kind: 'task_blocked', message: `${task.id} ${a.statusReason}` });
          touched.add(task.id);
        }
        summary.blocked++;
      }
    } catch (e) {
      log('error', 'tick action failed', { workspaceId: ws.id, taskId: task.id, error: (e as Error).message });
    }
  }

  if (touched.size) {
    const fresh = await loadTasks(ws.id);
    for (const t of fresh.filter((x) => touched.has(x.id))) await syncStatusComment(ws, t, members);
  }
  return summary;
}

async function dispatch(
  ws: Workspace,
  task: Task,
  a: Extract<PlanAction, { kind: 'dispatch' }>,
  members: Member[],
  tasks: Task[],
  realNow: Date,
): Promise<boolean> {
  const seat = members.find((m) => m.id === a.memberId);
  const requester = members.find((m) => m.id === task.requesterMemberId);
  if (!seat?.routineFireUrlEnc || !seat.routineTokenEnc) return false;
  const triage = a.runKind === 'triage';
  const [{ n } = { n: 0 }] = await db()
    .select({ n: count() })
    .from(schema.events)
    .where(and(eq(schema.events.taskId, task.id), eq(schema.events.kind, 'dispatch_triage')));
  const attempt = n + 1;
  const payload = buildJobPayload(
    { id: task.id, type: task.type, title: task.title, body: task.body, likelyFiles: task.likelyFiles, doneCheck: task.doneCheck, targetPrNumber: task.targetPrNumber },
    a.runKind,
    triage ? [] : recentTeamChanges(tasks.map(toSched), task.id),
    requester?.githubLogin ?? requester?.displayName ?? null,
    attempt,
  );
  const from = ['needs_triage', 'queued', 'waiting_window', 'blocked'] as const;
  // Claim first so a concurrent writer can't dispatch the same task twice.
  const [claimed] = await db()
    .update(schema.tasks)
    .set({
      status: triage ? 'triaging' : 'dispatched',
      statusReason: null,
      runKind: a.runKind,
      assigneeMemberId: seat.id,
      windowKind: a.windowKind,
      shared: a.shared,
      requesterUsedPctAtDispatch: a.requesterUsedPct,
      costPct: a.costPct,
      estTokens: a.estTokens,
      branch: payload.branch,
      sessionUrl: null,
      dispatchedAt: realNow,
      blockedByTaskId: null,
      blockedOnFiles: null,
      triageNow: triage ? false : task.triageNow,
      runNow: triage ? task.runNow : false,
      updatedAt: new Date(),
    })
    .where(and(eq(schema.tasks.id, task.id), inArray(schema.tasks.status, [...from])))
    .returning();
  if (!claimed) return false;
  try {
    const r = await fire({ fireUrlEnc: seat.routineFireUrlEnc, tokenEnc: seat.routineTokenEnc, text: fireText(payload), dryRun: ws.dryRun });
    await db().update(schema.tasks).set({ sessionUrl: r.sessionUrl }).where(eq(schema.tasks.id, task.id));
    await recordEvent({
      workspaceId: ws.id,
      taskId: task.id,
      memberId: seat.id,
      kind: triage ? 'dispatch_triage' : 'task_dispatched',
      message: `${task.id} ${triage ? 'triage' : 'work'} dispatched to ${ghName(seat)}'s seat (${a.windowKind.replace('_', '-')}${a.shared ? ', shared' : ''})${ws.dryRun ? ' [dry run]' : ''}`,
      data: { windowKind: a.windowKind, shared: a.shared, costPct: a.costPct, sessionUrl: r.sessionUrl },
    });
    return true;
  } catch (e) {
    const attempts = task.attempts + 1;
    const failed = attempts >= MAX_ATTEMPTS;
    const reason = `Could not start the routine: ${(e as Error).message}`;
    await db()
      .update(schema.tasks)
      .set({
        attempts,
        status: failed ? 'failed' : task.status,
        statusReason: reason,
        assigneeMemberId: task.assigneeMemberId,
        dispatchedAt: task.dispatchedAt,
        costPct: task.costPct,
        shared: task.shared,
        runKind: task.runKind,
        branch: task.branch,
        runNow: task.runNow,
        triageNow: task.triageNow,
        updatedAt: new Date(),
      })
      .where(eq(schema.tasks.id, task.id));
    await recordEvent({ workspaceId: ws.id, taskId: task.id, memberId: seat.id, kind: 'dispatch_error', message: `${task.id}: ${reason}` });
    log('warn', 'fire failed', { workspaceId: ws.id, taskId: task.id, attempts });
    return false;
  }
}

/** Run a tick, never throwing (used after webhooks and task creation). */
export async function runTickSafe(workspaceId: string): Promise<void> {
  try {
    await runTick(workspaceId);
  } catch (e) {
    log('error', 'tick failed', { workspaceId, error: (e as Error).message });
  }
}

/** Tick every connected workspace (cron). */
export async function runTickAll(): Promise<{ workspaces: number; skipped: number }> {
  const rows = await db().select({ id: schema.workspaces.id, repo: schema.workspaces.repoName, inst: schema.workspaces.githubInstallationId }).from(schema.workspaces);
  let skipped = 0;
  let n = 0;
  for (const w of rows) {
    if (!w.repo || !w.inst) continue;
    try {
      const s = await runTick(w.id);
      if (s === null) skipped++;
      else n++;
    } catch (e) {
      log('error', 'tick failed', { workspaceId: w.id, error: (e as Error).message });
    }
  }
  return { workspaces: n, skipped };
}
