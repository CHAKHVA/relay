import { buildStatusComment } from '@relay/core';
import { and, eq, isNull } from 'drizzle-orm';
import { sha256 } from '../crypto';
import { db, schema } from '../db';
import type { Member, Task, Workspace } from '../db/schema';
import { appUrl } from '../env';
import type { GH } from '../github/app';
import { repoOf, workspaceOctokit } from '../github/repo';
import { log } from '../http';
import { ghName } from './names';

export const taskUrl = (workspaceId: string, taskId: string) => `${appUrl()}/w/${workspaceId}/tasks/${taskId}`;

/**
 * Create or edit Relay's single status comment on the task issue (SPEC §8.4).
 * Skips the GitHub call when the rendered body hasn't changed (idempotent).
 */
export async function syncStatusComment(
  ws: Workspace,
  task: Task,
  members: Pick<Member, 'id' | 'githubLogin' | 'displayName' | 'simulated'>[],
  opts: { note?: string | null; gh?: GH } = {},
): Promise<void> {
  const byId = new Map(members.map((m) => [m.id, m]));
  const body = buildStatusComment({
    status: task.status,
    statusReason: task.statusReason,
    taskUrl: taskUrl(ws.id, task.id),
    requester: ghName(byId.get(task.requesterMemberId)),
    assignee: task.assigneeMemberId ? ghName(byId.get(task.assigneeMemberId)) : null,
    sessionUrl: task.sessionUrl,
    prUrl: task.resultPrUrl,
    commentUrl: task.resultCommentUrl,
    dryRun: ws.dryRun,
    note: opts.note ?? null,
  });
  const hash = sha256(body);
  if (hash === task.statusCommentHash && task.statusCommentId && task.statusCommentId > 0) return;
  try {
    const gh = opts.gh ?? (await workspaceOctokit(ws));
    const ref = repoOf(ws);
    if (task.statusCommentId && task.statusCommentId > 0) {
      try {
        await gh.rest.issues.updateComment({ ...ref, comment_id: task.statusCommentId, body });
        await db().update(schema.tasks).set({ statusCommentHash: hash }).where(eq(schema.tasks.id, task.id));
        return;
      } catch (e) {
        if ((e as { status?: number }).status !== 404) throw e;
        // Comment was deleted on GitHub: fall through and create a new one.
        await db().update(schema.tasks).set({ statusCommentId: null }).where(eq(schema.tasks.id, task.id));
      }
    }
    // Claim creation so concurrent ticks/webhooks don't post two comments.
    const claimed = await db()
      .update(schema.tasks)
      .set({ statusCommentId: -1 })
      .where(and(eq(schema.tasks.id, task.id), isNull(schema.tasks.statusCommentId)))
      .returning({ id: schema.tasks.id });
    if (!claimed.length) return;
    try {
      const { data } = await gh.rest.issues.createComment({ ...ref, issue_number: task.issueNumber, body });
      await db().update(schema.tasks).set({ statusCommentId: data.id, statusCommentHash: hash }).where(eq(schema.tasks.id, task.id));
    } catch (e) {
      await db().update(schema.tasks).set({ statusCommentId: null }).where(eq(schema.tasks.id, task.id));
      throw e;
    }
  } catch (e) {
    log('warn', 'status comment sync failed', { taskId: task.id, error: (e as Error).message });
  }
}
