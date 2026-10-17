import { isValidHHmm, isValidTimeZone } from '@relay/core';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { encrypt, sha256 } from '../crypto';
import { db, schema } from '../db';
import type { Member, Workspace } from '../db/schema';
import { recordEvent } from '../engine/events';
import { badRequest, forbidden, notFound } from '../http';
import { newId, randomToken } from '../ids';
import { rateLimit } from '../rate-limit';
import { fire, routineCredentialsSchema, routineHint } from '../routine';

export const MAX_USAGE_TOKENS = 10;
export const TEST_WINDOW_MIN = 15;
export const TEST_WINDOW_MAX = 60;

const hhmm = z.string().refine(isValidHHmm, 'Use HH:MM');
export const seatPatchSchema = z
  .object({
    timezone: z.string().refine(isValidTimeZone, 'Unknown time zone'),
    offHoursStart: hhmm,
    offHoursEnd: hhmm,
    beforeResetMinutes: z.number().int().min(0).max(300),
    reservePct: z.number().int().min(0).max(90),
    sharingEnabled: z.boolean(),
    paused: z.boolean(),
    maxConcurrent: z.number().int().min(1).max(5),
  })
  .partial()
  .strict();

export async function updateSeat(member: Member, patch: z.infer<typeof seatPatchSchema>) {
  const set: Partial<typeof schema.members.$inferInsert> = { ...patch };
  const windowKeys = ['timezone', 'offHoursStart', 'offHoursEnd', 'beforeResetMinutes', 'reservePct'] as const;
  if (windowKeys.some((k) => patch[k] !== undefined)) set.windowsSavedAt = new Date();
  if (!Object.keys(set).length) return member;
  const [m] = await db().update(schema.members).set(set).where(eq(schema.members.id, member.id)).returning();
  if (patch.sharingEnabled !== undefined && patch.sharingEnabled !== member.sharingEnabled) {
    await recordEvent({
      workspaceId: member.workspaceId,
      memberId: member.id,
      kind: patch.sharingEnabled ? 'sharing_on' : 'sharing_off',
      message: `${member.displayName} turned sharing ${patch.sharingEnabled ? 'on' : 'off'}`,
    });
  }
  if (patch.paused !== undefined && patch.paused !== member.paused) {
    await recordEvent({ workspaceId: member.workspaceId, memberId: member.id, kind: patch.paused ? 'seat_paused' : 'seat_resumed', message: `${member.displayName} ${patch.paused ? 'paused' : 'resumed'} their seat` });
  }
  return m as Member;
}

export async function saveRoutine(member: Member, raw: unknown) {
  if (member.simulated) throw badRequest('Simulated members cannot have a routine');
  const parsed = routineCredentialsSchema.safeParse(raw);
  if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message ?? 'Invalid routine credentials', 'validation');
  const { fireUrl, token } = parsed.data;
  const [m] = await db()
    .update(schema.members)
    .set({
      routineFireUrlEnc: encrypt(fireUrl),
      routineTokenEnc: encrypt(token),
      routineHint: routineHint(fireUrl),
      routineConfiguredAt: new Date(),
      routineTestAt: null,
    })
    .where(eq(schema.members.id, member.id))
    .returning();
  await recordEvent({ workspaceId: member.workspaceId, memberId: member.id, kind: 'routine_saved', message: `${member.displayName} saved their routine (${routineHint(fireUrl)})` });
  return m as Member;
}

export async function clearRoutine(member: Member) {
  const [m] = await db()
    .update(schema.members)
    .set({ routineFireUrlEnc: null, routineTokenEnc: null, routineHint: null, routineConfiguredAt: null, routineTestAt: null })
    .where(eq(schema.members.id, member.id))
    .returning();
  return m as Member;
}

/** Optional real test fire with a no-op triage payload (uses one routine run; no-op in dry run). */
export async function testRoutine(ws: Workspace, member: Member, now = new Date()) {
  if (!member.routineFireUrlEnc || !member.routineTokenEnc) throw badRequest('Save your routine first', 'no_routine');
  await rateLimit(`routine-test:${member.id}`, 1, 60, 'Wait a minute before testing the routine again.', now);
  const text = JSON.stringify({ relay: 1, kind: 'test', note: 'Relay connection test. Do nothing: reply "ok" and stop. Do not modify any repository.' });
  const r = await fire({ fireUrlEnc: member.routineFireUrlEnc, tokenEnc: member.routineTokenEnc, text, dryRun: ws.dryRun });
  await db().update(schema.members).set({ routineTestAt: now }).where(eq(schema.members.id, member.id));
  return r;
}

export function publicMember(m: Member) {
  const {
    routineFireUrlEnc, routineTokenEnc, ...rest
  } = m;
  return { ...rest, routineConfigured: Boolean(routineFireUrlEnc && routineTokenEnc) };
}

// ---------------------------------------------------------------------------
// Usage tokens + usage data
// ---------------------------------------------------------------------------
export async function createUsageToken(member: Member, name: string) {
  if (member.simulated) throw badRequest('Simulated members cannot have usage tokens');
  const existing = await db().select({ id: schema.usageTokens.id }).from(schema.usageTokens).where(eq(schema.usageTokens.memberId, member.id));
  if (existing.length >= MAX_USAGE_TOKENS) throw badRequest(`You can have up to ${MAX_USAGE_TOKENS} usage tokens. Revoke one first.`);
  const token = `rut_${randomToken(32)}`;
  const id = newId();
  await db().insert(schema.usageTokens).values({ id, memberId: member.id, name: name.trim().slice(0, 60) || 'statusLine', tokenHash: sha256(token) });
  return { id, token };
}

export async function listUsageTokens(member: Member) {
  return db()
    .select({ id: schema.usageTokens.id, name: schema.usageTokens.name, lastUsedAt: schema.usageTokens.lastUsedAt, createdAt: schema.usageTokens.createdAt })
    .from(schema.usageTokens)
    .where(eq(schema.usageTokens.memberId, member.id));
}

export async function revokeUsageToken(member: Member, tokenId: string) {
  const gone = await db()
    .delete(schema.usageTokens)
    .where(and(eq(schema.usageTokens.id, tokenId), eq(schema.usageTokens.memberId, member.id)))
    .returning({ id: schema.usageTokens.id });
  if (!gone.length) throw notFound('Token not found');
}

export const beaconSchema = z.object({
  usedPct5h: z.number().min(0).max(100),
  resets5hAt: z.iso.datetime({ offset: true }).nullish(),
  usedPctWeek: z.number().min(0).max(100).nullish(),
  resetsWeekAt: z.iso.datetime({ offset: true }).nullish(),
  raw: z.unknown().optional(),
});

/** Authenticate a usage token (Bearer). Returns the member, or null for any invalid token. */
export async function memberForUsageToken(authHeader: string | null) {
  const m = /^Bearer\s+(rut_[A-Za-z0-9_-]{20,})$/.exec(authHeader ?? '');
  if (!m) return null;
  const [row] = await db()
    .select({ token: schema.usageTokens, member: schema.members })
    .from(schema.usageTokens)
    .innerJoin(schema.members, eq(schema.usageTokens.memberId, schema.members.id))
    .where(eq(schema.usageTokens.tokenHash, sha256(m[1]!)));
  return row ?? null;
}

export async function applyBeacon(memberId: string, tokenId: string, b: z.infer<typeof beaconSchema>, now = new Date()) {
  const [m] = await db()
    .update(schema.members)
    .set({
      usedPct5h: b.usedPct5h,
      resets5hAt: b.resets5hAt ? new Date(b.resets5hAt) : null,
      usedPctWeek: b.usedPctWeek ?? null,
      resetsWeekAt: b.resetsWeekAt ? new Date(b.resetsWeekAt) : null,
      usageSource: 'beacon',
      usageUpdatedAt: now,
    })
    .where(eq(schema.members.id, memberId))
    .returning();
  await db().update(schema.usageTokens).set({ lastUsedAt: now }).where(eq(schema.usageTokens.id, tokenId));
  return m as Member;
}

export const manualUsageSchema = z.object({
  usedPct5h: z.number().min(0).max(100),
  resets5hAt: z.iso.datetime({ offset: true }).nullish(),
  usedPctWeek: z.number().min(0).max(100).nullish(),
});

/** Manual slider: self for real members; owner for simulated members (demo). */
export async function setManualUsage(ws: Workspace, actor: Member, targetId: string, input: z.infer<typeof manualUsageSchema>, now = new Date()) {
  const [target] = await db()
    .select()
    .from(schema.members)
    .where(and(eq(schema.members.id, targetId), eq(schema.members.workspaceId, ws.id)));
  if (!target) throw notFound('Member not found');
  const allowed = target.id === actor.id || (target.simulated && actor.role === 'owner');
  if (!allowed) throw forbidden('You can only set your own usage');
  const [m] = await db()
    .update(schema.members)
    .set({
      usedPct5h: input.usedPct5h,
      resets5hAt: input.resets5hAt ? new Date(input.resets5hAt) : (target.resets5hAt ?? null),
      usedPctWeek: input.usedPctWeek ?? target.usedPctWeek,
      usageSource: target.simulated ? 'simulated' : 'manual',
      usageUpdatedAt: now,
    })
    .where(eq(schema.members.id, target.id))
    .returning();
  return m as Member;
}

// ---------------------------------------------------------------------------
// Test window + workspace settings
// ---------------------------------------------------------------------------
export const testWindowSchema = z.object({ minutes: z.number().int().min(TEST_WINDOW_MIN).max(TEST_WINDOW_MAX) });

export async function setTestWindow(member: Member, minutes: number | null, now = new Date()) {
  const until = minutes === null ? null : new Date(now.getTime() + minutes * 60_000);
  const [m] = await db().update(schema.members).set({ testWindowUntil: until }).where(eq(schema.members.id, member.id)).returning();
  await recordEvent({
    workspaceId: member.workspaceId,
    memberId: member.id,
    kind: until ? 'test_window_open' : 'test_window_close',
    message: until ? `${member.displayName} opened a ${minutes}-minute run window` : `${member.displayName} closed their test window`,
  });
  return m as Member;
}

export const workspaceSettingsSchema = z
  .object({
    demoMode: z.boolean(),
    dryRun: z.boolean(),
    clockOffsetMinutes: z.number().int().min(-60 * 24 * 14).max(60 * 24 * 14),
  })
  .partial()
  .strict();

export async function updateWorkspaceSettings(ws: Workspace, patch: z.infer<typeof workspaceSettingsSchema>) {
  const set: Partial<typeof schema.workspaces.$inferInsert> = { ...patch };
  // The demo clock exists only in demo mode.
  if (patch.demoMode === false) set.clockOffsetMinutes = 0;
  if (patch.clockOffsetMinutes !== undefined && !(patch.demoMode ?? ws.demoMode)) throw badRequest('The demo clock is only available in demo mode');
  if (!Object.keys(set).length) return ws;
  const [w] = await db().update(schema.workspaces).set(set).where(eq(schema.workspaces.id, ws.id)).returning();
  return w as Workspace;
}
