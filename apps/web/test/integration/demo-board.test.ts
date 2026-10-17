import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { GET as getState } from '@/app/api/w/[id]/state/route';
import { POST as loadTeam } from '@/app/api/w/[id]/demo/load-team/route';
import { POST as resetDemo } from '@/app/api/w/[id]/demo/reset/route';
import { POST as jumpWindow } from '@/app/api/w/[id]/demo/jump-window/route';
import { GET as getOnboarding } from '@/app/api/w/[id]/onboarding/route';
import { PATCH as patchMe } from '@/app/api/w/[id]/me/route';
import { PATCH as settings } from '@/app/api/workspaces/[id]/settings/route';
import { POST as createWorkspace } from '@/app/api/workspaces/route';
import { db, schema } from '@/lib/db';
import { newId } from '@/lib/ids';
import { truncateAll } from '../helpers/db';
import { call, login, type TestUser } from '../helpers/http';

let owner: TestUser;
let wsId: string;
beforeEach(async () => {
  await truncateAll();
  owner = await login('giorgi', 'Giorgi');
  wsId = (await call(createWorkspace, { as: owner, body: { name: 'Demo', timezone: 'Asia/Tbilisi' } })).data.workspace.id;
});
const p = () => ({ id: wsId });

describe('demo mode', () => {
  it('requires demo mode; loads the demo team idempotently; labels simulated members', async () => {
    expect((await call(loadTeam, { as: owner, method: 'POST', params: p() })).status).toBe(400);
    await call(settings, { as: owner, method: 'PATCH', params: p(), body: { demoMode: true } });
    expect((await call(loadTeam, { as: owner, method: 'POST', params: p() })).data.added).toEqual(['Ana', 'Luka']);
    expect((await call(loadTeam, { as: owner, method: 'POST', params: p() })).data.added).toEqual([]);
    const s = (await call(getState, { as: owner, params: p() })).data;
    const ana = s.members.find((m: { displayName: string }) => m.displayName === 'Ana');
    const luka = s.members.find((m: { displayName: string }) => m.displayName === 'Luka');
    expect(ana).toMatchObject({ simulated: true, usedPct5h: 96, sharingEnabled: false, timezone: 'Asia/Tbilisi', routineConfigured: false });
    expect(luka).toMatchObject({ simulated: true, usedPct5h: 40, sharingEnabled: true, timezone: 'Europe/Berlin' });
    expect(s.members.find((m: { role: string; simulated: boolean }) => m.role === 'owner' && !m.simulated).sharingEnabled).toBe(true);
    expect(JSON.stringify(s)).not.toMatch(/routineTokenEnc|routineFireUrlEnc/);
  });

  it('"Jump to next window" moves the demo clock into the owner’s next off-hours window', async () => {
    await call(settings, { as: owner, method: 'PATCH', params: p(), body: { demoMode: true } });
    await call(patchMe, { as: owner, method: 'PATCH', params: p(), body: { timezone: 'UTC', offHoursStart: '03:00', offHoursEnd: '04:00' } });
    const r = await call(jumpWindow, { as: owner, method: 'POST', params: p() });
    expect(r.status).toBe(200);
    const s = (await call(getState, { as: owner, params: p() })).data;
    expect(s.workspace.clockOffsetMinutes).toBe(r.data.clockOffsetMinutes);
    const owned = s.members.find((m: { role: string }) => m.role === 'owner');
    expect(owned.activeWindow).toBe('off_hours');
    expect(new Date(s.now).toISOString().slice(11, 16)).toBe('03:01');
  });

  it('reset clears tasks, events, stats and the clock', async () => {
    await call(settings, { as: owner, method: 'PATCH', params: p(), body: { demoMode: true, clockOffsetMinutes: 90 } });
    const [m] = await db().select().from(schema.members).where(eq(schema.members.workspaceId, wsId));
    await db().insert(schema.tasks).values({ id: 'r0001', workspaceId: wsId, issueNumber: 1, title: 't', type: 'docs', requesterMemberId: m!.id, status: 'done', runKind: 'work', windowKind: 'off_hours', costPct: 5 });
    expect((await call(getState, { as: owner, params: p() })).data.stats.tasksOffHours).toBe(1);
    expect((await call(resetDemo, { as: owner, method: 'POST', params: p() })).status).toBe(200);
    const s = (await call(getState, { as: owner, params: p() })).data;
    expect(s.tasks).toHaveLength(0);
    expect(s.stats.tasksOffHours).toBe(0);
    expect(s.workspace.clockOffsetMinutes).toBe(0);
  });
});

describe('stats strip against fixture data', () => {
  it('counts windows, shared runs, est. quota and credits avoided from completed work runs', async () => {
    const [me] = await db().select().from(schema.members).where(eq(schema.members.workspaceId, wsId));
    const base = { workspaceId: wsId, type: 'code' as const, title: 't', requesterMemberId: me!.id, runKind: 'work' as const };
    const rows = [
      { id: 'r0001', issueNumber: 1, status: 'done' as const, windowKind: 'off_hours' as const, costPct: 5, estTokens: 150_000 },
      { id: 'r0002', issueNumber: 2, status: 'merged' as const, windowKind: 'before_reset' as const, costPct: 12, estTokens: 400_000 },
      { id: 'r0003', issueNumber: 3, status: 'done' as const, windowKind: 'manual' as const, costPct: 5, estTokens: 150_000 },
      { id: 'r0004', issueNumber: 4, status: 'done' as const, windowKind: 'off_hours' as const, costPct: 12, estTokens: 400_000, shared: true, requesterUsedPctAtDispatch: 96 },
      { id: 'r0005', issueNumber: 5, status: 'done' as const, windowKind: 'off_hours' as const, costPct: 5, estTokens: 150_000, shared: true, requesterUsedPctAtDispatch: 20 },
      { id: 'r0006', issueNumber: 6, status: 'failed' as const, windowKind: 'off_hours' as const, costPct: 99, estTokens: 1 },
    ];
    for (const r of rows) await db().insert(schema.tasks).values({ ...base, ...r, id: r.id });
    const st = (await call(getState, { as: owner, params: p() })).data.stats;
    expect(st).toMatchObject({ tasksOffHours: 3, tasksBeforeReset: 1, tasksManual: 1, tasksShared: 2, estQuotaUsedPct: 39, estTokensShared: 550_000 });
    expect(st.estCreditsAvoidedUsd).toBeCloseTo((400_000 * 6) / 1e6, 2); // only the run whose requester was ≥ 90% used
    void newId;
  });
});

describe('onboarding checklist', () => {
  it('reflects progress', async () => {
    let r = (await call(getOnboarding, { as: owner, params: p() })).data;
    expect(r.complete).toBe(false);
    const by = (k: string) => r.steps.find((s: { key: string }) => s.key === k);
    expect(by('signin').status).toBe('done');
    expect(by('repo').status).toBe('todo');
    expect(by('windows').status).toBe('todo');
    await call(patchMe, { as: owner, method: 'PATCH', params: p(), body: { offHoursStart: '18:00' } });
    r = (await call(getOnboarding, { as: owner, params: p() })).data;
    expect(r.steps.find((s: { key: string }) => s.key === 'windows').status).toBe('done');
    const stranger = await login('stranger');
    expect((await call(getOnboarding, { as: stranger, params: p() })).status).toBe(404);
  });
});
