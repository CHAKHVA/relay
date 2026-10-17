import { nextWindowStart } from '@relay/core';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { isValidHHmm, isValidTimeZone } from '@relay/core';
import { db, schema } from '../db';
import type { Member, Workspace } from '../db/schema';
import { clockFor } from '../engine/tick';
import { toSeat } from '../engine/load';
import { recordEvent } from '../engine/events';
import { badRequest } from '../http';
import { newId } from '../ids';

export function requireDemo(ws: Workspace) {
  if (!ws.demoMode) throw badRequest('Turn on demo mode in Settings first', 'demo_off');
}

export const simulatedMemberSchema = z.object({
  displayName: z.string().trim().min(1).max(40),
  usedPct5h: z.number().min(0).max(100).default(30),
  timezone: z.string().refine(isValidTimeZone, 'Unknown time zone').default('UTC'),
  offHoursStart: z.string().refine(isValidHHmm).default('19:00'),
  offHoursEnd: z.string().refine(isValidHHmm).default('08:00'),
  sharingEnabled: z.boolean().default(false),
});

/** Add a simulated teammate: always labeled Simulated, never an executing seat (SPEC §16.1). */
export async function addSimulatedMember(ws: Workspace, input: z.infer<typeof simulatedMemberSchema>, now = new Date()) {
  requireDemo(ws);
  const [m] = await db()
    .insert(schema.members)
    .values({
      id: newId(),
      workspaceId: ws.id,
      displayName: input.displayName,
      simulated: true,
      timezone: input.timezone,
      offHoursStart: input.offHoursStart,
      offHoursEnd: input.offHoursEnd,
      sharingEnabled: input.sharingEnabled,
      usedPct5h: input.usedPct5h,
      resets5hAt: new Date(now.getTime() + 150 * 60_000),
      usageSource: 'simulated',
      usageUpdatedAt: now,
    })
    .returning();
  return m as Member;
}

/** "Load demo team" (SPEC §16.2): Ana 96% (not sharing), Luka 40% (sharing); the owner shares. Idempotent. */
export async function loadDemoTeam(ws: Workspace, owner: Member, now = new Date()) {
  requireDemo(ws);
  const existing = await db().select().from(schema.members).where(and(eq(schema.members.workspaceId, ws.id), eq(schema.members.simulated, true)));
  const have = new Set(existing.map((m) => m.displayName));
  const created: Member[] = [];
  if (!have.has('Ana')) created.push(await addSimulatedMember(ws, { displayName: 'Ana', usedPct5h: 96, timezone: 'Asia/Tbilisi', offHoursStart: '19:00', offHoursEnd: '08:00', sharingEnabled: false }, now));
  if (!have.has('Luka')) created.push(await addSimulatedMember(ws, { displayName: 'Luka', usedPct5h: 40, timezone: 'Europe/Berlin', offHoursStart: '20:00', offHoursEnd: '09:00', sharingEnabled: true }, now));
  await db().update(schema.members).set({ sharingEnabled: true }).where(eq(schema.members.id, owner.id));
  await recordEvent({ workspaceId: ws.id, kind: 'demo_team_loaded', message: `Demo team loaded (${created.length} simulated member(s) added)` });
  return created;
}

/** Return the workspace to a clean state (SPEC §16.1). GitHub history is never touched. */
export async function resetDemoData(ws: Workspace) {
  requireDemo(ws);
  const members = await db().select({ id: schema.members.id }).from(schema.members).where(eq(schema.members.workspaceId, ws.id));
  await db().transaction(async (tx) => {
    await tx.delete(schema.tasks).where(eq(schema.tasks.workspaceId, ws.id));
    await tx.delete(schema.events).where(eq(schema.events.workspaceId, ws.id));
    await tx.delete(schema.recurringTasks).where(eq(schema.recurringTasks.workspaceId, ws.id));
    for (const m of members) {
      await tx.delete(schema.notifications).where(eq(schema.notifications.memberId, m.id));
      await tx.delete(schema.digests).where(eq(schema.digests.memberId, m.id));
    }
    await tx.update(schema.workspaces).set({ clockOffsetMinutes: 0 }).where(eq(schema.workspaces.id, ws.id));
  });
  await recordEvent({ workspaceId: ws.id, kind: 'demo_reset', message: 'Demo data reset' });
}

/** Move the demo clock to one minute after the next window start of `member` (SPEC §16.4 step 5). */
export async function jumpToNextWindow(ws: Workspace, member: Member, realNow = new Date()) {
  requireDemo(ws);
  const now = clockFor(ws, realNow);
  const seat = toSeat(member);
  const at = nextWindowStart(seat, now, seat);
  if (!at) throw badRequest('No upcoming window: check your off-hours settings');
  const target = at.getTime() + 60_000;
  const offset = Math.ceil((target - realNow.getTime()) / 60_000);
  const [w] = await db().update(schema.workspaces).set({ clockOffsetMinutes: offset }).where(eq(schema.workspaces.id, ws.id)).returning();
  await recordEvent({ workspaceId: ws.id, memberId: member.id, kind: 'clock_jump', message: `Demo clock moved to ${new Date(realNow.getTime() + offset * 60_000).toISOString()}` });
  return { workspace: w as Workspace, target: new Date(realNow.getTime() + offset * 60_000) };
}
