import { describe, expect, it } from 'vitest';
import { buildSeatStates, jobCost, orderJobs, planTick, seatIneligibility, type PlanAction } from '../src/plan';
import { at, member, task } from './fixtures';

const night = at('2026-10-17T21:00:00Z'); // in UTC off-hours 19–08
const noon = at('2026-10-17T12:00:00Z');

const me = (over = {}) => member({ id: 'm_me', displayName: 'Me', ...over });
const ana = (over = {}) => member({ id: 'm_ana', displayName: 'Ana', githubLogin: 'ana', usedPct5h: 96, ...over });
const giorgi = (over = {}) =>
  member({ id: 'm_gio', displayName: 'Giorgi', githubLogin: 'giorgi', timezone: 'Asia/Tbilisi', sharingEnabled: true, usedPct5h: 10, ...over });

const dispatches = (a: PlanAction[]) => a.filter((x) => x.kind === 'dispatch');
const find = (a: PlanAction[], id: string) => a.find((x) => x.taskId === id);

describe('jobCost', () => {
  it('uses size or default and triage cost', () => {
    expect(jobCost({ size: 'L' }, 'work').pct).toBe(25);
    expect(jobCost({ size: null }, 'work').pct).toBe(12);
    expect(jobCost({ size: 'L' }, 'triage').pct).toBe(3);
  });
});

describe('seat eligibility', () => {
  const seat = (m = me()) => buildSeatStates([m], [], night).get(m.id)!;
  const opts = { now: night, costPct: 5, ownJob: true, ignoreWindow: false };
  it('eligible baseline', () => expect(seatIneligibility(seat(), opts)).toBeNull());
  it('simulated', () => expect(seatIneligibility(seat(me({ simulated: true })), opts)).toBe('simulated'));
  it('paused', () => expect(seatIneligibility(seat(me({ paused: true })), opts)).toBe('paused'));
  it('no routine', () => expect(seatIneligibility(seat(me({ routineConfigured: false })), opts)).toBe('no_routine'));
  it('sharing off for teammate job', () => expect(seatIneligibility(seat(), { ...opts, ownJob: false })).toBe('sharing_off'));
  it('no window', () => expect(seatIneligibility(seat(), { ...opts, now: noon })).toBe('no_window'));
  it('ignoreWindow bypasses window', () => expect(seatIneligibility(seat(), { ...opts, now: noon, ignoreWindow: true })).toBeNull());
  it('no headroom', () => expect(seatIneligibility(seat(me({ usedPct5h: 90 })), opts)).toBe('no_headroom'));
  it('maxConcurrent', () => {
    const t = task({ status: 'dispatched', assigneeMemberId: 'm_me' });
    const s = buildSeatStates([me()], [t], night).get('m_me')!;
    expect(seatIneligibility(s, opts)).toBe('busy');
    const s2 = buildSeatStates([me({ maxConcurrent: 2 })], [t], night).get('m_me')!;
    expect(seatIneligibility(s2, opts)).toBeNull();
  });
});

describe('orderJobs', () => {
  it('priority then oldest, manual first, ignores non-candidates', () => {
    const a = task({ id: 'a', priority: 'low', createdAt: at('2026-10-01T00:00:00Z') });
    const b = task({ id: 'b', priority: 'high', createdAt: at('2026-10-03T00:00:00Z') });
    const c = task({ id: 'c', priority: 'normal', createdAt: at('2026-10-02T00:00:00Z'), status: 'needs_triage' });
    const d = task({ id: 'd', priority: 'normal', createdAt: at('2026-10-01T00:00:00Z'), status: 'waiting_window' });
    const e = task({ id: 'e', status: 'done' });
    const f = task({ id: 'f', priority: 'low', runNow: true });
    const g = task({ id: 'g', priority: 'normal', createdAt: at('2026-10-01T00:00:00Z'), status: 'blocked' });
    const order = orderJobs([a, b, c, d, e, f, g]).map((j) => j.task.id);
    expect(order).toEqual(['f', 'b', 'd', 'g', 'c', 'a']);
  });
});

describe('planTick', () => {
  it('own seat first even when a teammate has more headroom', () => {
    const t = task({ id: 'own', requesterMemberId: 'm_me' });
    const a = planTick({ now: night, members: [me({ usedPct5h: 50 }), giorgi({ usedPct5h: 0 })], tasks: [t] });
    expect(find(a, 'own')).toMatchObject({ kind: 'dispatch', memberId: 'm_me', shared: false, windowKind: 'off_hours', runKind: 'work' });
  });

  it("routes a maxed-out simulated teammate's job to an opted-in seat", () => {
    const t = task({ id: 'ana1', requesterMemberId: 'm_ana', priority: 'high' });
    const a = planTick({ now: night, members: [ana({ simulated: true }), me({ sharingEnabled: true, usedPct5h: 20 })], tasks: [t] });
    expect(find(a, 'ana1')).toMatchObject({ kind: 'dispatch', memberId: 'm_me', shared: true, requesterUsedPct: 96 });
  });

  it('does not use teammates who are not sharing', () => {
    const t = task({ id: 'x', requesterMemberId: 'm_ana' });
    const a = planTick({ now: night, members: [ana({ simulated: true }), me({ sharingEnabled: false })], tasks: [t] });
    expect(find(a, 'x')).toMatchObject({ kind: 'wait', status: 'waiting_window' });
  });

  it('picks the teammate with the most spare headroom, tie-break fewest dispatched today', () => {
    const t = task({ id: 'x', requesterMemberId: 'm_ana' });
    const members = [
      ana({ simulated: true }),
      member({ id: 'm_b', displayName: 'B', sharingEnabled: true, usedPct5h: 30 }),
      member({ id: 'm_c', displayName: 'C', sharingEnabled: true, usedPct5h: 10 }),
    ];
    expect(find(planTick({ now: night, members, tasks: [t] }), 'x')).toMatchObject({ memberId: 'm_c' });

    const tie = [
      ana({ simulated: true }),
      member({ id: 'm_b', displayName: 'B', sharingEnabled: true, usedPct5h: 10 }),
      member({ id: 'm_c', displayName: 'C', sharingEnabled: true, usedPct5h: 10 }),
    ];
    // m_b already ran one job today (completed, so not running and not in-flight cost-wise beyond... use 0 cost)
    const earlier = task({ id: 'old', status: 'done', assigneeMemberId: 'm_b', dispatchedAt: at('2026-10-17T20:00:00Z'), costPct: 0 });
    expect(find(planTick({ now: night, members: tie, tasks: [t, earlier] }), 'x')).toMatchObject({ memberId: 'm_c' });
  });

  it('applies cost within a tick so later jobs see reduced headroom', () => {
    const t1 = task({ id: 'a1', size: 'L', createdAt: at('2026-10-01T00:00:00Z') });
    const t2 = task({ id: 'a2', size: 'L', createdAt: at('2026-10-02T00:00:00Z') });
    const t3 = task({ id: 'a3', size: 'L', createdAt: at('2026-10-03T00:00:00Z') });
    const a = planTick({ now: night, members: [me({ usedPct5h: 30, maxConcurrent: 5 })], tasks: [t1, t2, t3] });
    // 30 + 25 = 55; +25 = 80 → 100-80-25 < 10 for the third
    expect(dispatches(a).map((x) => x.taskId)).toEqual(['a1', 'a2']);
    expect(find(a, 'a3')).toMatchObject({ kind: 'wait', statusReason: expect.stringContaining('Waiting for headroom') });
  });

  it('respects maxConcurrent within a tick', () => {
    const a = planTick({ now: night, members: [me()], tasks: [task({ id: 'p' }), task({ id: 'q' })] });
    expect(dispatches(a).map((x) => x.taskId)).toEqual(['p']);
    expect(find(a, 'q')).toMatchObject({ kind: 'wait', statusReason: expect.stringContaining('busy') });
  });

  it('waits with next-window text outside windows', () => {
    const t = task({ id: 'w', requesterMemberId: 'm_gio' });
    const a = planTick({ now: noon, members: [giorgi()], tasks: [t] }); // 16:00 Tbilisi
    expect(find(a, 'w')).toMatchObject({ kind: 'wait', statusReason: 'Next window: Giorgi at 19:00 Asia/Tbilisi' });
  });

  it('wait reasons when nothing can ever run', () => {
    const sim = planTick({ now: noon, members: [ana({ simulated: true })], tasks: [task({ id: 's', requesterMemberId: 'm_ana' })] });
    expect(find(sim, 's')).toMatchObject({ statusReason: expect.stringContaining('simulated') });
    const noRoutine = planTick({ now: noon, members: [me({ routineConfigured: false })], tasks: [task({ id: 'n' })] });
    expect(find(noRoutine, 'n')).toMatchObject({ statusReason: expect.stringContaining('routine') });
    const paused = planTick({ now: noon, members: [me({ paused: true })], tasks: [task({ id: 'p' })] });
    expect(find(paused, 'p')).toMatchObject({ statusReason: expect.stringContaining('paused') });
    const ghost = planTick({ now: noon, members: [], tasks: [task({ id: 'g', requesterMemberId: 'nobody' })] });
    expect(find(ghost, 'g')).toMatchObject({ statusReason: 'No seat available' });
  });

  it('triage jobs use triage cost and keep needs_triage while waiting', () => {
    const t = task({ id: 'tr', status: 'needs_triage', size: null });
    const a = planTick({ now: night, members: [me()], tasks: [t] });
    expect(find(a, 'tr')).toMatchObject({ kind: 'dispatch', runKind: 'triage', costPct: 3 });
    const w = planTick({ now: noon, members: [me()], tasks: [t] });
    expect(find(w, 'tr')).toMatchObject({ kind: 'wait', status: 'needs_triage' });
  });

  it('Triage now ignores windows on own seat only, still needs headroom', () => {
    const t = task({ id: 'tn', status: 'needs_triage', triageNow: true });
    expect(find(planTick({ now: noon, members: [me()], tasks: [t] }), 'tn')).toMatchObject({ kind: 'dispatch', windowKind: 'manual' });
    expect(find(planTick({ now: noon, members: [me({ usedPct5h: 89 })], tasks: [t] }), 'tn')).toMatchObject({
      kind: 'wait',
      statusReason: expect.stringContaining('Run now waiting'),
    });
  });

  it('Run now dispatches on the requester seat ignoring windows', () => {
    const t = task({ id: 'rn', runNow: true });
    expect(find(planTick({ now: noon, members: [me()], tasks: [t] }), 'rn')).toMatchObject({ kind: 'dispatch', memberId: 'm_me', windowKind: 'manual' });
    expect(find(planTick({ now: noon, members: [me({ paused: true })], tasks: [t] }), 'rn')).toMatchObject({ kind: 'wait' });
  });

  it('test window counts as a run window recorded as manual', () => {
    const t = task({ id: 'tw' });
    const a = planTick({ now: noon, members: [me({ testWindowUntil: at('2026-10-17T12:30:00Z') })], tasks: [t] });
    expect(find(a, 'tw')).toMatchObject({ kind: 'dispatch', windowKind: 'manual' });
  });

  it('before-reset window dispatch', () => {
    const t = task({ id: 'br' });
    const a = planTick({ now: noon, members: [me({ resets5hAt: at('2026-10-17T13:00:00Z') })], tasks: [t] });
    expect(find(a, 'br')).toMatchObject({ kind: 'dispatch', windowKind: 'before_reset' });
  });

  it('ledger blocks overlapping code tasks and unblocks when the claim ends', () => {
    const running = task({ id: 'r2', status: 'dispatched', runKind: 'work', type: 'code', likelyFiles: ['src/auth.ts'], assigneeMemberId: 'm_x' });
    const t3 = task({ id: 'r3', likelyFiles: ['./src/auth.ts', 'tests/auth.test.ts'] });
    const a = planTick({ now: night, members: [me()], tasks: [running, t3] });
    expect(find(a, 'r3')).toMatchObject({ kind: 'block', blockedByTaskId: 'r2', blockedOnFiles: ['src/auth.ts'], statusReason: 'Blocked on src/auth.ts by r2' });

    const doneNow = { ...running, status: 'done' as const };
    const b = planTick({ now: night, members: [me()], tasks: [doneNow, { ...t3, status: 'blocked' }] });
    expect(find(b, 'r3')).toMatchObject({ kind: 'dispatch' });
  });

  it('ledger blocks a second overlapping job dispatched in the same tick', () => {
    const x = task({ id: 'x1', likelyFiles: ['src'], createdAt: at('2026-10-01T00:00:00Z') });
    const y = task({ id: 'y1', likelyFiles: ['src/a.ts'], createdAt: at('2026-10-02T00:00:00Z') });
    const a = planTick({ now: night, members: [me({ maxConcurrent: 3 })], tasks: [x, y] });
    expect(find(a, 'x1')).toMatchObject({ kind: 'dispatch' });
    expect(find(a, 'y1')).toMatchObject({ kind: 'block', blockedByTaskId: 'x1' });
  });

  it('review and business jobs skip the ledger', () => {
    const running = task({ id: 'c1', status: 'dispatched', runKind: 'work', likelyFiles: ['src/a.ts'], assigneeMemberId: 'm_x' });
    const rev = task({ id: 'rv', type: 'review', likelyFiles: ['src/a.ts'] });
    expect(find(planTick({ now: night, members: [me()], tasks: [running, rev] }), 'rv')).toMatchObject({ kind: 'dispatch' });
  });
});
