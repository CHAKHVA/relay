import {
  MAX_ATTEMPTS,
  STALE_AFTER_MINUTES,
  metadataIssues,
  parseIssueBody,
  parseResult,
  replaceMetadataBlock,
  resultPath,
  typeLabel,
  type RelayResult,
} from '@relay/core';
import { and, eq, inArray } from 'drizzle-orm';
import { db, schema } from '../db';
import type { Member, Task, Workspace } from '../db/schema';
import { DRY_RUN_COMPLETE_AFTER_MS } from '@relay/core';
import type { GH } from '../github/app';
import { repoOf, workspaceOctokit } from '../github/repo';
import { log } from '../http';
import { synthesizeResult } from './dry-run';
import { recordEvent } from './events';
import { withWorkspaceLock } from './lock';
import { loadMembers } from './load';
import { ghName } from './names';
import { notify } from './notify';
import { syncStatusComment, taskUrl } from './status-comment';

const RUNNING = ['dispatched', 'triaging'] as const;

async function patchTask(id: string, patch: Partial<typeof schema.tasks.$inferInsert>): Promise<Task> {
  const [t] = await db()
    .update(schema.tasks)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(schema.tasks.id, id))
    .returning();
  return t as Task;
}

/** Read and validate `.relay/results/<taskId>.json` on a branch; null when the file isn't there yet. */
export async function readResultFile(gh: GH, ws: Workspace, taskId: string, ref: string): Promise<{ ok: true; result: RelayResult } | { ok: false; error: string } | null> {
  try {
    const { data } = await gh.rest.repos.getContent({ ...repoOf(ws), path: resultPath(taskId), ref });
    if (Array.isArray(data) || data.type !== 'file' || !('content' in data)) return null;
    return parseResult(Buffer.from(data.content, 'base64').toString('utf8'));
  } catch (e) {
    if ((e as { status?: number }).status === 404) return null;
    throw e;
  }
}

/** `push` webhook entry: apply the result for a task branch (SPEC §11.2). */
export async function handleResultForTask(ws: Workspace, taskId: string, push: { ref: string; sha: string }): Promise<void> {
  await withWorkspaceLock(
    ws.id,
    async () => {
      const [task] = await db()
        .select()
        .from(schema.tasks)
        .where(and(eq(schema.tasks.workspaceId, ws.id), eq(schema.tasks.id, taskId)));
      if (!task || !RUNNING.includes(task.status as (typeof RUNNING)[number])) return;
      if (task.branch && task.branch !== push.ref) return; // push to another branch of the same task
      const gh = await workspaceOctokit(ws);
      const out = await readResultFile(gh, ws, task.id, push.sha);
      if (!out) return;
      const members = await loadMembers(ws.id);
      if (!out.ok) return void (await failTask(ws, task, members, out.error));
      await applyResult(ws, task, out.result, members, gh);
    },
    { wait: true },
  );
}

export async function failTask(ws: Workspace, task: Task, members: Member[], reason: string, extra: { notes?: string } = {}) {
  const t = await patchTask(task.id, { status: 'failed', statusReason: reason.slice(0, 500), completedAt: new Date(), runNow: false, triageNow: false });
  await recordEvent({ workspaceId: ws.id, taskId: t.id, memberId: t.assigneeMemberId, kind: 'task_failed', message: `${t.id} failed: ${reason}`.slice(0, 500) });
  await notify({
    memberId: t.requesterMemberId,
    kind: 'task_failed',
    title: `Task ${t.id} failed`,
    body: reason.slice(0, 300),
    url: taskUrl(ws.id, t.id),
    dedupeKey: `failed:${t.id}:${t.attempts}:${t.dispatchedAt?.getTime() ?? 0}`,
  });
  if (!ws.githubInstallationId) return t;
  await syncStatusComment(ws, t, members, { note: extra.notes ? `${reason}\n> ${extra.notes}` : undefined });
  return t;
}

/** Apply a validated result to its task. Caller holds the workspace lock. */
export async function applyResult(ws: Workspace, task: Task, result: RelayResult, members: Member[], gh: GH): Promise<Task> {
  const assignee = members.find((m) => m.id === task.assigneeMemberId);
  const requester = members.find((m) => m.id === task.requesterMemberId);
  if (task.status === 'triaging' || result.jobKind === 'triage') {
    if (task.status !== 'triaging') return task;
    return applyTriage(ws, task, result, members, gh, assignee);
  }
  if (task.status !== 'dispatched') return task;
  const ref = repoOf(ws);
  const attribution = `Requested by ${ghName(requester) ?? 'unknown'} · Run on ${ghName(assignee) ?? 'unknown'}'s seat via Relay`;

  if (result.checkPassed === false) {
    return failTask(ws, { ...task, result }, members, `The done check failed${result.checkCommand ? ` (\`${result.checkCommand}\`)` : ''}. ${result.summary}`.trim(), { notes: result.notes });
  }

  let prUrl: string | null = null;
  let prNumber: number | null = null;
  let commentUrl: string | null = null;
  let note: string | null = null;

  if (result.outputMode === 'pr') {
    if (ws.dryRun) {
      note = `Dry run: PR would be opened from branch \`${task.branch}\`.`;
    } else {
      const head = task.branch!;
      const existing = await gh.rest.pulls.list({ ...ref, head: `${ref.owner}:${head}`, state: 'open', per_page: 5 });
      let pr: { html_url: string; number: number } | undefined = existing.data[0];
      if (!pr) {
        const body = [
          result.summary,
          result.filesChanged.length ? `\n**Files changed**\n${result.filesChanged.map((f) => `- \`${f}\``).join('\n')}` : '',
          result.checkCommand ? `\n**Check:** \`${result.checkCommand}\` — ${result.checkPassed === true ? 'passed' : 'not reported'}` : '',
          result.notes ? `\n**Notes:** ${result.notes}` : '',
          task.type === 'code' ? `\nCloses #${task.issueNumber}` : `\nRelated to #${task.issueNumber}`,
          `\n${attribution}`,
          task.sessionUrl ? `\n[Claude session](${task.sessionUrl})` : '',
        ]
          .filter(Boolean)
          .join('\n');
        const created = await gh.rest.pulls.create({ ...ref, head, base: ws.defaultBranch ?? 'main', title: `[Relay ${task.id}] ${task.title}`, body, draft: true });
        pr = created.data;
      }
      prUrl = pr.html_url;
      prNumber = pr.number;
    }
  } else if (result.outputMode === 'comment' && task.type === 'review') {
    const header = `### Relay review · requested by ${ghName(requester)} · run on ${ghName(assignee)}'s seat\n\n`;
    const text = header + (result.commentMarkdown || result.summary);
    let posted = false;
    if (task.targetPrNumber) {
      try {
        const { data } = await gh.rest.issues.createComment({ ...ref, issue_number: task.targetPrNumber, body: text });
        commentUrl = data.html_url;
        posted = true;
        await gh.rest.issues.createComment({ ...ref, issue_number: task.issueNumber, body: `Relay posted the review on #${task.targetPrNumber}: ${data.html_url}` });
      } catch (e) {
        if ((e as { status?: number }).status !== 404) throw e;
      }
    }
    if (!posted) {
      const { data } = await gh.rest.issues.createComment({ ...ref, issue_number: task.issueNumber, body: `${text}\n\n_Target PR #${task.targetPrNumber ?? '?'} was not found, so the review is posted here._` });
      commentUrl = data.html_url;
    }
  } else {
    const text = result.commentMarkdown || result.summary || '_No output._';
    const header = `### Relay result · requested by ${ghName(requester)} · run on ${ghName(assignee)}'s seat\n\n`;
    const { data } = await gh.rest.issues.createComment({ ...ref, issue_number: task.issueNumber, body: header + text });
    commentUrl = data.html_url;
  }

  const done = await patchTask(task.id, {
    status: 'done',
    statusReason: null,
    result,
    resultPrUrl: prUrl,
    resultPrNumber: prNumber,
    resultCommentUrl: commentUrl,
    completedAt: new Date(),
    runNow: false,
    blockedByTaskId: null,
    blockedOnFiles: null,
  });
  await recordEvent({
    workspaceId: ws.id,
    taskId: task.id,
    memberId: task.assigneeMemberId,
    kind: 'task_done',
    message: `${task.id} done${prNumber ? ` (draft PR #${prNumber})` : commentUrl ? ' (comment posted)' : ''}${ws.dryRun ? ' [dry run]' : ''}`,
  });
  await notify({
    memberId: task.requesterMemberId,
    kind: 'my_task_ready',
    title: `Your task ${task.id} is ready`,
    body: task.title,
    url: taskUrl(ws.id, task.id),
    dedupeKey: `ready:${task.id}:${task.dispatchedAt?.getTime() ?? 0}`,
  });
  if (task.shared && task.assigneeMemberId) {
    await notify({
      memberId: task.assigneeMemberId,
      kind: 'task_done_on_my_seat',
      title: `Ran ${task.id} for ${requester?.displayName ?? 'a teammate'}`,
      body: task.title,
      url: taskUrl(ws.id, task.id),
      dedupeKey: `shared-done:${task.id}:${task.dispatchedAt?.getTime() ?? 0}`,
    });
  }
  await syncStatusComment(ws, done, members, { gh, note: [note, result.summary].filter(Boolean).join('\n> ') || null });
  return done;
}

async function applyTriage(ws: Workspace, task: Task, result: RelayResult, members: Member[], gh: GH, assignee: Member | undefined): Promise<Task> {
  const ref = repoOf(ws);
  const tri = result.triage;
  if (!tri) return retryOrFail(ws, task, members, 'Triage result had no triage data');
  const { data: issue } = await gh.rest.issues.get({ ...ref, issue_number: task.issueNumber });
  const current = parseIssueBody(issue.body);
  const meta = {
    type: tri.type,
    likelyFiles: tri.likelyFiles,
    doneCheck: tri.doneCheck,
    size: tri.size ?? current.meta.size ?? null,
    targetPr: current.meta.targetPr ?? task.targetPrNumber ?? null,
    requester: current.meta.requester ?? null,
  };
  const problems = metadataIssues({ type: tri.type, likelyFiles: meta.likelyFiles, doneCheck: meta.doneCheck ?? undefined, targetPr: meta.targetPr ?? undefined });
  if (problems.length) return retryOrFail(ws, task, members, `Triage did not produce ${problems.join(', ')}`);
  const title = tri.title && tri.title !== issue.title ? tri.title.slice(0, 200) : issue.title;
  await gh.rest.issues.update({ ...ref, issue_number: task.issueNumber, title, body: replaceMetadataBlock(issue.body, meta) });
  await gh.rest.issues.addLabels({ ...ref, issue_number: task.issueNumber, labels: [typeLabel(tri.type)] });
  await gh.rest.issues.createComment({ ...ref, issue_number: task.issueNumber, body: `Triaged by ${ghName(assignee) ?? 'a'}'s seat: ${result.summary || `${tri.type}, size ${meta.size ?? 'M'}.`}` });
  const t = await patchTask(task.id, {
    status: 'queued',
    statusReason: null,
    type: tri.type,
    title,
    likelyFiles: tri.likelyFiles,
    doneCheck: tri.doneCheck,
    size: meta.size,
    targetPrNumber: meta.targetPr,
    triagedAt: new Date(),
    triageNow: false,
    attempts: 0,
    result,
  });
  await recordEvent({ workspaceId: ws.id, taskId: task.id, memberId: task.assigneeMemberId, kind: 'task_triaged', message: `${task.id} triaged: ${tri.type}, ${tri.likelyFiles.length} file(s)${ws.dryRun ? ' [dry run]' : ''}` });
  await syncStatusComment(ws, t, members, { gh });
  return t;
}

async function retryOrFail(ws: Workspace, task: Task, members: Member[], reason: string): Promise<Task> {
  const attempts = task.attempts + 1;
  if (attempts >= MAX_ATTEMPTS) return failTask(ws, { ...task, attempts }, members, reason);
  const t = await patchTask(task.id, { status: 'needs_triage', statusReason: `${reason}; will retry`, attempts });
  await syncStatusComment(ws, t, members);
  return t;
}

/**
 * Reconcile running tasks (SPEC §11.1 step 2): the fallback for missed webhooks, DRY RUN completion,
 * and stale detection. `realNow` is the wall clock (dispatch times are real, even under the demo clock).
 */
export async function reconcileWorkspace(ws: Workspace, realNow: Date): Promise<number> {
  const running = await db()
    .select()
    .from(schema.tasks)
    .where(and(eq(schema.tasks.workspaceId, ws.id), inArray(schema.tasks.status, [...RUNNING])));
  if (!running.length) return 0;
  const members = await loadMembers(ws.id);
  let gh: GH | null = null;
  let changed = 0;
  for (const task of running) {
    try {
      const dispatched = task.dispatchedAt?.getTime() ?? realNow.getTime();
      if (ws.dryRun && task.sessionUrl?.includes('session_dryrun_')) {
        if (realNow.getTime() - dispatched < DRY_RUN_COMPLETE_AFTER_MS) continue;
        gh ??= await workspaceOctokit(ws);
        await applyResult(ws, task, synthesizeResult(task), members, gh);
        changed++;
        continue;
      }
      if (task.branch && ws.githubInstallationId) {
        gh ??= await workspaceOctokit(ws);
        const out = await readResultFile(gh, ws, task.id, task.branch);
        if (out) {
          if (out.ok) await applyResult(ws, task, out.result, members, gh);
          else await failTask(ws, task, members, out.error);
          changed++;
          continue;
        }
      }
      if (realNow.getTime() - dispatched > STALE_AFTER_MINUTES * 60_000) {
        const t = await patchTask(task.id, { status: 'stale', statusReason: `No result after ${STALE_AFTER_MINUTES} minutes. Open the session to see what happened.` });
        await recordEvent({ workspaceId: ws.id, taskId: task.id, kind: 'task_stale', message: `${task.id} marked stale` });
        await syncStatusComment(ws, t, members);
        changed++;
      }
    } catch (e) {
      log('warn', 'reconcile failed', { workspaceId: ws.id, taskId: task.id, error: (e as Error).message });
    }
  }
  return changed;
}
