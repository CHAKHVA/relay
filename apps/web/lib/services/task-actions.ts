import type { TaskStatus } from '@relay/core';
import { RELAY_LABEL } from '@relay/core';
import { and, eq, inArray } from 'drizzle-orm';
import { db, schema } from '../db';
import type { Member, Task, Workspace } from '../db/schema';
import { recordEvent } from '../engine/events';
import { loadMembers } from '../engine/load';
import { syncStatusComment } from '../engine/status-comment';
import { repoOf, workspaceOctokit } from '../github/repo';
import { badRequest, conflict, forbidden, notFound } from '../http';

export async function requireTask(ws: Workspace, taskId: string): Promise<Task> {
  const [t] = await db()
    .select()
    .from(schema.tasks)
    .where(and(eq(schema.tasks.workspaceId, ws.id), eq(schema.tasks.id, taskId)));
  if (!t) throw notFound('Task not found');
  return t;
}

async function set(taskId: string, patch: Partial<typeof schema.tasks.$inferInsert>, from: TaskStatus[], err: string) {
  const [t] = await db()
    .update(schema.tasks)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(schema.tasks.id, taskId), inArray(schema.tasks.status, from)))
    .returning();
  if (!t) throw conflict(err);
  return t;
}

/** "Triage now": skip the window requirement for the triage pass (own seat). */
export async function triageNow(ws: Workspace, _me: Member, taskId: string) {
  await requireTask(ws, taskId);
  return set(taskId, { triageNow: true }, ['needs_triage'], 'Only tasks waiting for triage can be triaged now');
}

/** "Run now": requester only; own seat, ignores windows, still respects reserve (SPEC §10.4). */
export async function runNow(ws: Workspace, me: Member, taskId: string) {
  const task = await requireTask(ws, taskId);
  if (task.requesterMemberId !== me.id) throw forbidden('Only the requester can run this task now');
  return set(taskId, { runNow: true }, ['needs_triage', 'queued', 'waiting_window', 'blocked'], 'This task is not waiting to run');
}

/** Failed/stale → back in the queue with attempts reset. */
export async function retryTask(ws: Workspace, _me: Member, taskId: string) {
  const task = await requireTask(ws, taskId);
  if (task.status !== 'failed' && task.status !== 'stale') throw badRequest('Only failed or stale tasks can be retried');
  const needsTriage = task.runKind === 'triage' || !task.likelyFiles.length && task.type === 'code';
  const t = await set(
    taskId,
    { status: needsTriage ? 'needs_triage' : 'queued', statusReason: null, attempts: 0, completedAt: null, blockedByTaskId: null, blockedOnFiles: null },
    ['failed', 'stale'],
    'This task changed; refresh and try again',
  );
  await recordEvent({ workspaceId: ws.id, taskId, kind: 'task_retried', message: `${taskId} re-queued` });
  await syncStatusComment(ws, t, await loadMembers(ws.id));
  return t;
}

/** Cancel: remove the `relay` label on GitHub; the task is cancelled right away. */
export async function cancelTask(ws: Workspace, _me: Member, taskId: string) {
  const task = await requireTask(ws, taskId);
  if (task.status === 'done' || task.status === 'merged' || task.status === 'cancelled') throw badRequest('This task is already finished');
  try {
    const gh = await workspaceOctokit(ws);
    await gh.rest.issues.removeLabel({ ...repoOf(ws), issue_number: task.issueNumber, name: RELAY_LABEL });
  } catch (e) {
    if ((e as { status?: number }).status !== 404) throw e;
  }
  const [t] = await db()
    .update(schema.tasks)
    .set({ status: 'cancelled', statusReason: 'Cancelled in Relay', runNow: false, triageNow: false, updatedAt: new Date() })
    .where(eq(schema.tasks.id, taskId))
    .returning();
  await recordEvent({ workspaceId: ws.id, taskId, kind: 'task_cancelled', message: `${taskId} cancelled in Relay` });
  await syncStatusComment(ws, t as Task, await loadMembers(ws.id));
  return t as Task;
}
