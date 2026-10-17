import { composeIssueBody, priorityLabels, SIZES, TASK_TYPES, PRIORITIES, typeLabel, RELAY_LABEL } from '@relay/core';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '../db';
import type { Member, Workspace } from '../db/schema';
import { repoOf, workspaceOctokit } from '../github/repo';
import { badRequest } from '../http';
import { rateLimit } from '../rate-limit';
import { recordEvent } from '../engine/events';
import { syncStatusComment } from '../engine/status-comment';
import { syncIssue } from '../engine/sync';

export const createTaskSchema = z.object({
  type: z.enum(TASK_TYPES),
  title: z.string().trim().min(1).max(200),
  description: z.string().max(20_000).default(''),
  likelyFiles: z.array(z.string().trim().min(1).max(300)).max(50).default([]),
  doneCheck: z.string().trim().max(300).nullish(),
  targetPr: z.number().int().positive().nullish(),
  size: z.enum(SIZES).nullish(),
  priority: z.enum(PRIORITIES).default('normal'),
  requesterMemberId: z.string().nullish(),
  extraLabels: z.array(z.string()).max(5).optional(),
});
export type CreateTaskInput = z.input<typeof createTaskSchema>;

export const TASKS_PER_MINUTE = 10;
export const TASKS_PER_DAY = 200;

export function requesterRef(m: Pick<Member, 'simulated' | 'id' | 'githubLogin' | 'displayName'>): string {
  return m.simulated ? `sim:${m.id}` : (m.githubLogin ?? m.displayName);
}

/** Board-created task (SPEC §11.4): create the GitHub issue, upsert the task right away. */
export async function createTask(ws: Workspace, me: Member, raw: CreateTaskInput, opts: { skipRateLimit?: boolean; recurringId?: string } = {}) {
  const input = createTaskSchema.parse(raw);
  if (!opts.skipRateLimit) {
    await rateLimit(`task:${me.id}`, TASKS_PER_MINUTE, 60, 'You can create up to 10 tasks per minute. Wait a moment and try again.');
    await rateLimit(`task-day:${ws.id}`, TASKS_PER_DAY, 86_400, 'This workspace reached 200 new tasks today. Try again tomorrow.');
  }
  const members = await db().select().from(schema.members).where(eq(schema.members.workspaceId, ws.id));
  let requester = me;
  if (input.requesterMemberId && input.requesterMemberId !== me.id) {
    const other = members.find((m) => m.id === input.requesterMemberId);
    if (!other) throw badRequest('Unknown requester');
    if (!ws.demoMode) throw badRequest('Choosing another requester is only available in demo mode');
    requester = other;
  }
  const ref = repoOf(ws);
  const gh = await workspaceOctokit(ws);
  const labels = [RELAY_LABEL, typeLabel(input.type), ...priorityLabels(input.priority), ...(input.extraLabels ?? [])];
  const body = composeIssueBody(input.description, {
    type: input.type,
    likelyFiles: input.likelyFiles,
    doneCheck: input.type === 'code' ? (input.doneCheck ?? null) : (input.doneCheck ?? null),
    size: input.size ?? null,
    targetPr: input.type === 'review' ? (input.targetPr ?? null) : null,
    requester: requesterRef(requester),
  });
  const { data: issue } = await gh.rest.issues.create({ ...ref, title: input.title, body, labels });
  const r = await syncIssue(ws, issue, { members });
  if (!r.task) throw new Error('Task upsert failed');
  let task = r.task;
  if (opts.recurringId) {
    const [t] = await db().update(schema.tasks).set({ recurringId: opts.recurringId }).where(eq(schema.tasks.id, task.id)).returning();
    if (t) task = t;
  }
  await recordEvent({
    workspaceId: ws.id,
    taskId: task.id,
    memberId: me.id,
    kind: 'task_created',
    message: `${task.id} created from ${opts.recurringId ? 'a recurring template' : 'the board'} by ${me.displayName}`,
  });
  await syncStatusComment(ws, task, members, { gh });
  return task;
}

export async function getTask(workspaceId: string, taskId: string) {
  const [t] = await db().select().from(schema.tasks).where(and(eq(schema.tasks.workspaceId, workspaceId), eq(schema.tasks.id, taskId)));
  return t ?? null;
}
