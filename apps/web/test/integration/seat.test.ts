import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { POST as beacon } from '@/app/api/usage/beacon/route';
import { GET as getMe, PATCH as patchMe } from '@/app/api/w/[id]/me/route';
import { PUT as putRoutine, DELETE as delRoutine } from '@/app/api/w/[id]/me/routine/route';
import { POST as testRoutine } from '@/app/api/w/[id]/me/routine/test/route';
import { POST as makeToken, GET as listTokens } from '@/app/api/w/[id]/me/usage-tokens/route';
import { DELETE as revokeToken } from '@/app/api/w/[id]/me/usage-tokens/[tid]/route';
import { POST as openWindow, DELETE as closeWindow } from '@/app/api/w/[id]/me/test-window/route';
import { PATCH as manualUsage } from '@/app/api/w/[id]/members/[mid]/usage/route';
import { PATCH as settings } from '@/app/api/workspaces/[id]/settings/route';
import { POST as acceptInvite } from '@/app/api/invites/[code]/accept/route';
import { POST as createInvite } from '@/app/api/workspaces/[id]/invites/route';
import { POST as createWorkspace } from '@/app/api/workspaces/route';
import { decrypt } from '@/lib/crypto';
import { db, schema } from '@/lib/db';
import { fire, routineHint } from '@/lib/routine';
import { truncateAll } from '../helpers/db';
import { call, login, type TestUser } from '../helpers/http';

const URL1 = 'https://api.anthropic.com/v1/claude_code/routines/trig_01ABCdefXYZ/fire';
const TOKEN = 'fake-routine-token-abcdef123456';

let owner: TestUser, ana: TestUser, wsId: string, anaMemberId: string, ownerMemberId: string;

beforeEach(async () => {
  await truncateAll();
  owner = await login('giorgi', 'Giorgi');
  wsId = (await call(createWorkspace, { as: owner, body: { name: 'T' } })).data.workspace.id;
  ownerMemberId = (await call(getMe, { as: owner, params: { id: wsId } })).data.member.id;
  const code = (await call(createInvite, { as: owner, method: 'POST', params: { id: wsId } })).data.code;
  ana = await login('ana', 'Ana');
  await call(acceptInvite, { as: ana, body: {}, params: { code } });
  anaMemberId = (await call(getMe, { as: ana, params: { id: wsId } })).data.member.id;
});

const p = () => ({ id: wsId });

describe('my seat', () => {
  it('persists settings and validates them', async () => {
    const r = await call(patchMe, { as: ana, method: 'PATCH', params: p(), body: { timezone: 'Europe/Berlin', offHoursStart: '18:30', offHoursEnd: '07:00', reservePct: 15, beforeResetMinutes: 90, sharingEnabled: true, maxConcurrent: 2 } });
    expect(r.status).toBe(200);
    const again = await call(getMe, { as: ana, params: p() });
    expect(again.data.member).toMatchObject({ timezone: 'Europe/Berlin', offHoursStart: '18:30', reservePct: 15, sharingEnabled: true, maxConcurrent: 2 });
    expect(again.data.member.windowsSavedAt).toBeTruthy();
    for (const bad of [{ timezone: 'Mars/Base' }, { offHoursStart: '25:00' }, { reservePct: 99 }, { maxConcurrent: 0 }, { unknown: 1 }]) {
      expect((await call(patchMe, { as: ana, method: 'PATCH', params: p(), body: bad })).status).toBe(400);
    }
  });

  it('requires membership', async () => {
    const stranger = await login('stranger');
    expect((await call(getMe, { as: stranger, params: p() })).status).toBe(404);
    expect((await call(getMe, { params: p() })).status).toBe(401);
  });

  it('pause toggles and records events', async () => {
    await call(patchMe, { as: ana, method: 'PATCH', params: p(), body: { paused: true } });
    const evs = await db().select().from(schema.events).where(eq(schema.events.workspaceId, wsId));
    expect(evs.map((e) => e.kind)).toContain('seat_paused');
  });

  it('opens and closes a test window (15–60 min only)', async () => {
    expect((await call(openWindow, { as: ana, params: p(), body: { minutes: 5 } })).status).toBe(400);
    const r = await call(openWindow, { as: ana, params: p(), body: { minutes: 60 } });
    expect(r.status).toBe(200);
    expect(new Date(r.data.member.testWindowUntil).getTime()).toBeGreaterThan(Date.now() + 59 * 60_000);
    const c = await call(closeWindow, { as: ana, method: 'DELETE', params: p() });
    expect(c.data.member.testWindowUntil).toBeNull();
  });
});

describe('routine credentials', () => {
  it('encrypts, masks, and never returns the secret', async () => {
    expect((await call(putRoutine, { as: ana, method: 'PUT', params: p(), body: { fireUrl: 'https://evil.example/fire', token: TOKEN } })).status).toBe(400);
    expect((await call(putRoutine, { as: ana, method: 'PUT', params: p(), body: { fireUrl: URL1, token: 'short' } })).status).toBe(400);
    const r = await call(putRoutine, { as: ana, method: 'PUT', params: p(), body: { fireUrl: URL1, token: TOKEN } });
    expect(r.status).toBe(200);
    const body = JSON.stringify(r.data);
    expect(body).not.toContain(TOKEN);
    expect(body).not.toContain('trig_01ABCdefXYZ/fire');
    expect(r.data.member).toMatchObject({ routineConfigured: true, routineHint: 'trig_…XYZ' });
    expect(JSON.stringify((await call(getMe, { as: ana, params: p() })).data)).not.toContain(TOKEN);

    const [row] = await db().select().from(schema.members).where(eq(schema.members.id, anaMemberId));
    expect(row!.routineTokenEnc).not.toContain(TOKEN);
    expect(decrypt(row!.routineTokenEnc!)).toBe(TOKEN);
    expect(decrypt(row!.routineFireUrlEnc!)).toBe(URL1);
    expect(routineHint(URL1)).toBe('trig_…XYZ');

    const d = await call(delRoutine, { as: ana, method: 'DELETE', params: p() });
    expect(d.data.member.routineConfigured).toBe(false);
  });

  it('test fire: needs a routine; no network in dry run', async () => {
    expect((await call(testRoutine, { as: ana, method: 'POST', params: p() })).status).toBe(400);
    await call(putRoutine, { as: ana, method: 'PUT', params: p(), body: { fireUrl: URL1, token: TOKEN } });
    await call(settings, { as: owner, method: 'PATCH', params: p(), body: { dryRun: true } });
    const r = await call(testRoutine, { as: ana, method: 'POST', params: p() });
    expect(r.status).toBe(200);
    expect(r.data).toMatchObject({ ok: true, dryRun: true });
    expect(r.data.sessionUrl).toMatch(/session_dryrun_/);
    expect((await call(testRoutine, { as: ana, method: 'POST', params: p() })).status).toBe(429); // 1/min
  });

  it('fire() in dry run never touches the network', async () => {
    const r = await fire({ fireUrlEnc: 'x', tokenEnc: 'y', text: 't', dryRun: true });
    expect(r.sessionUrl).toMatch(/^https:\/\/claude\.ai\/code\/session_dryrun_/);
  });
});

describe('usage tokens + beacon', () => {
  it('create (shown once, stored hashed), beacon updates own usage, revoke stops it', async () => {
    const t = await call(makeToken, { as: ana, params: p(), body: { name: 'laptop' } });
    expect(t.status).toBe(201);
    const token = t.data.token as string;
    const list = await call(listTokens, { as: ana, params: p() });
    expect(JSON.stringify(list.data)).not.toContain(token);
    const [row] = await db().select().from(schema.usageTokens);
    expect(row!.tokenHash).not.toContain(token);

    const ok = await call(beacon, { headers: { authorization: `Bearer ${token}` }, body: { usedPct5h: 42, resets5hAt: '2026-10-17T20:00:00Z', usedPctWeek: 10 } });
    expect(ok.status).toBe(200);
    const me = (await call(getMe, { as: ana, params: p() })).data.member;
    expect(me).toMatchObject({ usedPct5h: 42, usedPctWeek: 10, usageSource: 'beacon' });
    expect(me.resets5hAt).toBe('2026-10-17T20:00:00.000Z');
    // it only affects the token's owner
    const owner0 = (await call(getMe, { as: owner, params: p() })).data.member;
    expect(owner0.usedPct5h).toBeNull();

    expect((await call(beacon, { headers: { authorization: `Bearer ${token}` }, body: { usedPct5h: 150 } })).status).toBe(400);

    const lastList = await call(listTokens, { as: ana, params: p() });
    expect(lastList.data.tokens[0].lastUsedAt).toBeTruthy();
    expect((await call(revokeToken, { as: owner, method: 'DELETE', params: { id: wsId, tid: t.data.id } })).status).toBe(404); // not owner's token
    expect((await call(revokeToken, { as: ana, method: 'DELETE', params: { id: wsId, tid: t.data.id } })).status).toBe(200);
    expect((await call(beacon, { headers: { authorization: `Bearer ${token}` }, body: { usedPct5h: 50 } })).status).toBe(401);
  });

  it('rejects missing, malformed, and session-cookie auth on the beacon', async () => {
    expect((await call(beacon, { body: { usedPct5h: 5 } })).status).toBe(401);
    expect((await call(beacon, { headers: { authorization: 'Bearer nope' }, body: { usedPct5h: 5 } })).status).toBe(401);
    expect((await call(beacon, { as: ana, body: { usedPct5h: 5 } })).status).toBe(401);
  });

  it('manual usage: self only; owner may set simulated members', async () => {
    expect((await call(manualUsage, { as: ana, method: 'PATCH', params: { id: wsId, mid: anaMemberId }, body: { usedPct5h: 70 } })).data.member).toMatchObject({ usedPct5h: 70, usageSource: 'manual' });
    expect((await call(manualUsage, { as: ana, method: 'PATCH', params: { id: wsId, mid: ownerMemberId }, body: { usedPct5h: 70 } })).status).toBe(403);
    const sim = await db().insert(schema.members).values({ id: 'sim1', workspaceId: wsId, displayName: 'Nino', simulated: true }).returning();
    expect((await call(manualUsage, { as: owner, method: 'PATCH', params: { id: wsId, mid: sim[0]!.id }, body: { usedPct5h: 90 } })).data.member.usageSource).toBe('simulated');
    expect((await call(manualUsage, { as: ana, method: 'PATCH', params: { id: wsId, mid: sim[0]!.id }, body: { usedPct5h: 90 } })).status).toBe(403);
  });
});

describe('workspace settings', () => {
  it('owner only; demo clock only in demo mode', async () => {
    expect((await call(settings, { as: ana, method: 'PATCH', params: p(), body: { dryRun: true } })).status).toBe(403);
    expect((await call(settings, { as: owner, method: 'PATCH', params: p(), body: { clockOffsetMinutes: 60 } })).status).toBe(400);
    const r = await call(settings, { as: owner, method: 'PATCH', params: p(), body: { demoMode: true, clockOffsetMinutes: 600 } });
    expect(r.data.workspace).toMatchObject({ demoMode: true, clockOffsetMinutes: 600 });
    const off = await call(settings, { as: owner, method: 'PATCH', params: p(), body: { demoMode: false } });
    expect(off.data.workspace.clockOffsetMinutes).toBe(0);
  });
});
