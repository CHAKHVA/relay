import { describe, expect, it } from 'vitest';
import { estimateUsage, hasHeadroom, inFlightCostPct, spareAfter } from '../src/headroom';
import { at, member, task } from './fixtures';

const now = at('2026-10-17T12:00:00Z');

describe('estimateUsage', () => {
  it('unknown when never reported', () => {
    const e = estimateUsage(member({ usedPct5h: null }), now, 5);
    expect(e).toEqual({ usedPct5h: 5, usedPctWeek: null, confidence: 'unknown' });
  });
  it('live when fresh', () => {
    const e = estimateUsage(member({ usedPct5h: 40, usageUpdatedAt: at('2026-10-17T11:45:00Z') }), now, 0);
    expect(e.confidence).toBe('live');
    expect(e.usedPct5h).toBe(40);
  });
  it('estimated when stale', () => {
    const e = estimateUsage(member({ usedPct5h: 40, usageUpdatedAt: at('2026-10-17T11:00:00Z') }), now, 12);
    expect(e.confidence).toBe('estimated');
    expect(e.usedPct5h).toBe(52);
  });
  it('rollover resets base to 0', () => {
    const e = estimateUsage(member({ usedPct5h: 96, resets5hAt: at('2026-10-17T11:00:00Z'), usageUpdatedAt: at('2026-10-17T11:55:00Z') }), now, 0);
    expect(e.usedPct5h).toBe(0);
  });
  it('clamps to 100 and handles weekly', () => {
    const e = estimateUsage(member({ usedPct5h: 95, usedPctWeek: 70 }), now, 20);
    expect(e.usedPct5h).toBe(100);
    expect(e.usedPctWeek).toBe(70);
    const rolled = estimateUsage(member({ usedPctWeek: 70, resetsWeekAt: at('2026-10-16T00:00:00Z') }), now, 0);
    expect(rolled.usedPctWeek).toBe(0);
  });
});

describe('inFlightCostPct', () => {
  it('sums dispatches on this seat since the last report', () => {
    const m = member({ usageUpdatedAt: at('2026-10-17T10:00:00Z') });
    const tasks = [
      task({ assigneeMemberId: 'm_me', dispatchedAt: at('2026-10-17T11:00:00Z'), costPct: 5 }),
      task({ assigneeMemberId: 'm_me', dispatchedAt: at('2026-10-17T09:00:00Z'), costPct: 12 }), // before report
      task({ assigneeMemberId: 'other', dispatchedAt: at('2026-10-17T11:00:00Z'), costPct: 25 }),
      task({ assigneeMemberId: 'm_me', dispatchedAt: null, costPct: 25 }),
    ];
    expect(inFlightCostPct(m, tasks, now)).toBe(5);
  });
  it('ignores runs older than 5h or before a rollover', () => {
    const m = member({ usageUpdatedAt: null, resets5hAt: at('2026-10-17T11:30:00Z') });
    const tasks = [
      task({ assigneeMemberId: 'm_me', dispatchedAt: at('2026-10-17T06:00:00Z'), costPct: 5 }),
      task({ assigneeMemberId: 'm_me', dispatchedAt: at('2026-10-17T11:00:00Z'), costPct: 12 }),
      task({ assigneeMemberId: 'm_me', dispatchedAt: at('2026-10-17T11:45:00Z'), costPct: 3 }),
    ];
    expect(inFlightCostPct(m, tasks, now)).toBe(3);
  });
});

describe('hasHeadroom', () => {
  const m = member({ reservePct: 10 });
  it('5-hour check with reserve', () => {
    expect(hasHeadroom(m, { usedPct5h: 85, usedPctWeek: null, confidence: 'live' }, 5)).toBe(true); // exactly 10 left
    expect(hasHeadroom(m, { usedPct5h: 86, usedPctWeek: null, confidence: 'live' }, 5)).toBe(false);
  });
  it('weekly check when known', () => {
    expect(hasHeadroom(m, { usedPct5h: 10, usedPctWeek: 88, confidence: 'live' }, 5)).toBe(false);
    expect(hasHeadroom(m, { usedPct5h: 10, usedPctWeek: 50, confidence: 'live' }, 5)).toBe(true);
  });
  it('spareAfter', () => {
    expect(spareAfter(m, { usedPct5h: 40, usedPctWeek: null, confidence: 'live' }, 12)).toBe(38);
  });
});
