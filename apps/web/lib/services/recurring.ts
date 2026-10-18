import { SIZES, TASK_TYPES, PRIORITIES, computeNextRun, isValidCron, isValidTimeZone } from '@relay/core';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '../db';
import type { Member, RecurringTask, Workspace } from '../db/schema';
import { clockFor } from '../engine/tick';
import { badRequest, forbidden, notFound } from '../http';
import { newId } from '../ids';

export const recurringSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(20_000).default(''),
  type: z.enum(TASK_TYPES),
  likelyFiles: z.array(z.string().trim().min(1).max(300)).max(50).default([]),
  doneCheck: z.string().trim().max(300).nullish(),
  size: z.enum(SIZES).nullish(),
  priority: z.enum(PRIORITIES).default('normal'),
  targetPr: z.number().int().positive().nullish(),
  cron: z.string().trim().min(1).max(100),
  timezone: z.string().default('UTC'),
  enabled: z.boolean().default(true),
});
export const recurringPatchSchema = recurringSchema.partial().strict();

export const MAX_RECURRING_PER_WORKSPACE = 25;

function checkSchedule(cron: string, timezone: string) {
  if (!isValidTimeZone(timezone)) throw badRequest('Unknown time zone');
  if (!isValidCron(cron, timezone)) throw badRequest('Invalid schedule: use five cron fields, e.g. 0 9 * * 1-5', 'bad_cron');
}

export async function listRecurring(ws: Workspace) {
  return db().select().from(schema.recurringTasks).where(eq(schema.recurringTasks.workspaceId, ws.id)).orderBy(schema.recurringTasks.createdAt);
}

export async function createRecurring(ws: Workspace, me: Member, input: z.infer<typeof recurringSchema>, realNow = new Date()) {
  checkSchedule(input.cron, input.timezone);
  const existing = await listRecurring(ws);
  if (existing.length >= MAX_RECURRING_PER_WORKSPACE) throw badRequest(`A workspace can have up to ${MAX_RECURRING_PER_WORKSPACE} recurring templates.`);
  const [row] = await db()
    .insert(schema.recurringTasks)
    .values({
      id: newId(),
      workspaceId: ws.id,
      creatorMemberId: me.id,
      title: input.title,
      body: input.description,
      type: input.type,
      likelyFiles: input.likelyFiles,
      doneCheck: input.doneCheck ?? null,
      size: input.size ?? null,
      priority: input.priority,
      targetPrNumber: input.targetPr ?? null,
      cron: input.cron,
      timezone: input.timezone,
      enabled: input.enabled,
      nextRunAt: computeNextRun(input.cron, input.timezone, clockFor(ws, realNow)),
    })
    .returning();
  return row as RecurringTask;
}

async function editable(ws: Workspace, me: Member, rid: string) {
  const [t] = await db()
    .select()
    .from(schema.recurringTasks)
    .where(and(eq(schema.recurringTasks.workspaceId, ws.id), eq(schema.recurringTasks.id, rid)));
  if (!t) throw notFound('Recurring task not found');
  if (t.creatorMemberId !== me.id && me.role !== 'owner') throw forbidden('Only the creator or the workspace owner can change this');
  return t;
}

export async function updateRecurring(ws: Workspace, me: Member, rid: string, patch: z.infer<typeof recurringPatchSchema>, realNow = new Date()) {
  const cur = await editable(ws, me, rid);
  const cron = patch.cron ?? cur.cron;
  const timezone = patch.timezone ?? cur.timezone;
  const scheduleChanged = patch.cron !== undefined || patch.timezone !== undefined || (patch.enabled === true && !cur.enabled);
  if (scheduleChanged) checkSchedule(cron, timezone);
  const { description, targetPr, ...rest } = patch;
  const [row] = await db()
    .update(schema.recurringTasks)
    .set({
      ...rest,
      ...(description !== undefined ? { body: description } : {}),
      ...(targetPr !== undefined ? { targetPrNumber: targetPr } : {}),
      ...(scheduleChanged ? { nextRunAt: computeNextRun(cron, timezone, clockFor(ws, realNow)) } : {}),
    })
    .where(eq(schema.recurringTasks.id, rid))
    .returning();
  return row as RecurringTask;
}

export async function deleteRecurring(ws: Workspace, me: Member, rid: string) {
  await editable(ws, me, rid);
  await db().delete(schema.recurringTasks).where(eq(schema.recurringTasks.id, rid));
}
