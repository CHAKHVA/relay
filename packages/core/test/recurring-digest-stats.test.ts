import { describe, expect, it } from 'vitest';
import { buildDigest, digestDue } from '../src/digest';
import { computeNextRun, CRON_PRESETS, dueRecurring, isValidCron } from '../src/recurring';
import { computeStats } from '../src/stats';
import { buildStatusComment, STATUS_COMMENT_MARKER, STATUS_META } from '../src/status';
import { TASK_STATUSES } from '../src/types';
import { at, member, task } from './fixtures';

describe('recurring', () => {
  it('dueRecurring', () => {
    const now = at('2026-10-17T12:00:00Z');
    const ts = [
      { id: 'a', enabled: true, nextRunAt: at('2026-10-17T11:59:00Z') },
      { id: 'b', enabled: true, nextRunAt: now },
      { id: 'c', enabled: false, nextRunAt: at('2026-10-17T11:00:00Z') },
      { id: 'd', enabled: true, nextRunAt: at('2026-10-17T12:01:00Z') },
    ];
    expect(dueRecurring(ts, now).map((t) => t.id)).toEqual(['a', 'b']);
  });
  it('computeNextRun in tz', () => {
    expect(computeNextRun('0 9 * * 1', 'Asia/Tbilisi', at('2026-10-17T12:00:00Z')).toISOString()).toBe('2026-10-19T05:00:00.000Z');
    expect(computeNextRun('* * * * *', 'UTC', at('2026-10-17T12:00:30Z')).toISOString()).toBe('2026-10-17T12:01:00.000Z');
    // strictly after
    expect(computeNextRun('0 12 * * *', 'UTC', at('2026-10-17T12:00:00Z')).toISOString()).toBe('2026-10-18T12:00:00.000Z');
  });
  it('isValidCron', () => {
    expect(isValidCron('0 9 * * 1-5')).toBe(true);
    expect(isValidCron('0 9 * *')).toBe(false);
    expect(isValidCron('61 9 * * *')).toBe(false);
    for (const p of CRON_PRESETS) expect(isValidCron(p.cron)).toBe(true);
  });
});

describe('digestDue', () => {
  const m = member({ timezone: 'Asia/Tbilisi', offHoursEnd: '08:00' });
  it('within 30 min after off-hours end, once per day', () => {
    expect(digestDue(m, at('2026-10-17T04:00:00Z'))).toBe(true); // 08:00
    expect(digestDue(m, at('2026-10-17T04:29:00Z'))).toBe(true);
    expect(digestDue(m, at('2026-10-17T04:30:00Z'))).toBe(false);
    expect(digestDue(m, at('2026-10-17T03:59:00Z'))).toBe(false);
    expect(digestDue({ ...m, lastDigestDate: '2026-10-17' }, at('2026-10-17T04:10:00Z'))).toBe(false);
    expect(digestDue({ ...m, lastDigestDate: '2026-10-16' }, at('2026-10-17T04:10:00Z'))).toBe(true);
  });
  it('grace window wrapping midnight', () => {
    const late = member({ offHoursEnd: '23:45' });
    expect(digestDue(late, at('2026-10-17T00:05:00Z'))).toBe(true);
    expect(digestDue(late, at('2026-10-17T00:16:00Z'))).toBe(false);
  });
});

describe('buildDigest', () => {
  const since = at('2026-10-16T19:00:00Z');
  const ctx = { names: { m_me: '@me', m_ana: 'Ana (Simulated)' }, taskUrl: (id: string) => `https://relay/t/${id}` };
  const me = member({ id: 'm_me', sharingEnabled: true });
  it('builds all sections', () => {
    const tasks = [
      task({ id: 'shared1', requesterMemberId: 'm_ana', assigneeMemberId: 'm_me', status: 'done', completedAt: at('2026-10-17T01:00:00Z'), resultPrUrl: 'https://pr/1' }),
      task({ id: 'own1', requesterMemberId: 'm_me', assigneeMemberId: 'm_me', status: 'merged', completedAt: at('2026-10-17T02:00:00Z'), resultCommentUrl: 'https://c/1' }),
      task({ id: 'byana', requesterMemberId: 'm_me', assigneeMemberId: 'm_ana', status: 'done', completedAt: at('2026-10-17T02:00:00Z') }),
      task({ id: 'fail1', requesterMemberId: 'm_me', status: 'failed' }),
      task({ id: 'q1', requesterMemberId: 'm_me', status: 'queued' }),
      task({ id: 'q2', requesterMemberId: 'm_ana', status: 'waiting_window' }),
      task({ id: 'old', requesterMemberId: 'm_me', assigneeMemberId: 'm_me', status: 'done', completedAt: at('2026-10-15T00:00:00Z') }),
    ];
    const md = buildDigest(me, tasks, since, ctx)!;
    expect(md).toContain('### Ran on your seat');
    expect(md).toContain('**shared1** #');
    expect(md).toContain('shared · requested by Ana (Simulated)');
    expect(md).toContain('[PR](https://pr/1)');
    expect(md).toContain('### Ready for you');
    expect(md).toContain("run on Ana (Simulated)'s seat");
    expect(md).toContain('### Needs attention');
    expect(md).toContain("### Tonight's plan");
    expect(md).toContain("teammate's task");
    expect(md).not.toContain('**old**');
  });
  it('omits empty sections and returns null when empty', () => {
    expect(buildDigest(me, [], since, ctx)).toBeNull();
    const md = buildDigest(member({ id: 'm_me' }), [task({ requesterMemberId: 'm_ana', status: 'queued' }), task({ id: 'f', requesterMemberId: 'm_me', status: 'stale' })], since, ctx)!;
    expect(md).toBe(md.trim());
    expect(md).not.toContain("Tonight's plan");
    expect(md).toContain('Needs attention');
    expect(buildDigest(member({ id: 'zz' }), [task({ assigneeMemberId: 'zz', requesterMemberId: 'unknown', status: 'done', completedAt: at('2026-10-17T00:00:00Z') })], since, ctx)).toContain('requested by someone');
  });
});

describe('computeStats', () => {
  it('counts by window kind and estimates credits', () => {
    const members = [member({ id: 'm_ana', reservePct: 10 }), member({ id: 'm_me' })];
    const tasks = [
      task({ status: 'done', runKind: 'work', windowKind: 'off_hours', costPct: 5, shared: true, requesterMemberId: 'm_ana', requesterUsedPctAtDispatch: 96, estTokens: 150_000 }),
      task({ status: 'merged', runKind: 'work', windowKind: 'before_reset', costPct: 12, shared: true, requesterMemberId: 'm_ana', requesterUsedPctAtDispatch: 50, estTokens: 400_000 }),
      task({ status: 'done', runKind: 'work', windowKind: 'manual', costPct: 5 }),
      task({ status: 'failed', runKind: 'work', windowKind: 'off_hours', costPct: 25 }),
      task({ status: 'done', runKind: 'triage', windowKind: 'off_hours', costPct: 3 }),
      task({ status: 'done', runKind: 'work', windowKind: 'off_hours', shared: true, requesterMemberId: 'ghost', requesterUsedPctAtDispatch: 95, estTokens: 1_000_000 }),
    ];
    expect(computeStats(tasks, members)).toEqual({
      tasksOffHours: 2,
      tasksBeforeReset: 1,
      tasksManual: 1,
      tasksShared: 3,
      estQuotaUsedPct: 22,
      estTokensShared: 1_550_000,
      estCreditsAvoidedUsd: 6.9, // (150k + 1M) * 6 / 1e6
    });
  });
});

describe('status comment', () => {
  it('every status has a label and emoji', () => {
    for (const s of TASK_STATUSES) expect(STATUS_META[s].label.length).toBeGreaterThan(0);
  });
  it('renders attribution, links, dry run, note', () => {
    const c = buildStatusComment({
      status: 'waiting_window',
      statusReason: 'Next window: Giorgi at 19:00 Asia/Tbilisi',
      taskUrl: 'https://relay/t/1',
      requester: '@ana',
      assignee: '@giorgi',
      sessionUrl: 'https://claude.ai/code/s',
      prUrl: 'https://pr',
      commentUrl: 'https://c',
      dryRun: true,
      note: 'Dry run: PR would be opened',
    });
    expect(c.startsWith(STATUS_COMMENT_MARKER)).toBe(true);
    expect(c).toContain('**Relay** · 🟡 Waiting for a run window · Next window: Giorgi at 19:00 Asia/Tbilisi · [Session](https://claude.ai/code/s) · [Pull request](https://pr) · [Result](https://c) · [Open in Relay](https://relay/t/1)');
    expect(c).toContain("Requested by @ana · Run on @giorgi's seat · **DRY RUN**");
    expect(c).toContain('> Dry run: PR would be opened');
    const plain = buildStatusComment({ status: 'queued', statusReason: null, taskUrl: 'u', requester: null, assignee: null, sessionUrl: null, prUrl: null, commentUrl: null, dryRun: true });
    expect(plain).toContain('<sub>**DRY RUN**</sub>');
    const none = buildStatusComment({ status: 'queued', statusReason: null, taskUrl: 'u', requester: null, assignee: null, sessionUrl: null, prUrl: null, commentUrl: null, dryRun: false });
    expect(none.split('\n')).toHaveLength(2);
  });
});
