import { FIVE_HOURS_MS, USAGE_STALE_MINUTES } from './config';
import type { SchedTask, SeatMember, UsageEstimate } from './types';

type UsageMember = Pick<
  SeatMember,
  'usedPct5h' | 'resets5hAt' | 'usedPctWeek' | 'resetsWeekAt' | 'usageUpdatedAt' | 'reservePct'
>;

const clampPct = (n: number) => Math.max(0, Math.min(100, n));

/**
 * Relay's optimistic accounting: cost of runs dispatched on this seat since the
 * last usage report (the beacon may be offline at night). Runs dispatched in a
 * 5-hour window that has since rolled over are not counted.
 */
export function inFlightCostPct(
  member: Pick<SeatMember, 'id' | 'usageUpdatedAt' | 'resets5hAt'>,
  tasks: Pick<SchedTask, 'assigneeMemberId' | 'dispatchedAt' | 'costPct'>[],
  now: Date,
): number {
  let since = now.getTime() - FIVE_HOURS_MS;
  if (member.usageUpdatedAt) since = Math.max(since, member.usageUpdatedAt.getTime());
  if (member.resets5hAt && member.resets5hAt.getTime() <= now.getTime()) {
    since = Math.max(since, member.resets5hAt.getTime());
  }
  let sum = 0;
  for (const t of tasks) {
    if (t.assigneeMemberId !== member.id || !t.dispatchedAt) continue;
    const at = t.dispatchedAt.getTime();
    if (at > since && at <= now.getTime()) sum += t.costPct;
  }
  return sum;
}

export function estimateUsage(member: UsageMember, now: Date, inFlightPct: number): UsageEstimate {
  const t = now.getTime();
  let confidence: UsageEstimate['confidence'];
  let base: number;
  if (member.usedPct5h == null) {
    base = 0;
    confidence = 'unknown';
  } else {
    const rolledOver = !!member.resets5hAt && member.resets5hAt.getTime() <= t;
    base = rolledOver ? 0 : member.usedPct5h;
    const fresh =
      !!member.usageUpdatedAt && t - member.usageUpdatedAt.getTime() <= USAGE_STALE_MINUTES * 60_000;
    confidence = fresh ? 'live' : 'estimated';
  }
  let usedPctWeek: number | null = null;
  if (member.usedPctWeek != null) {
    const weekRolled = !!member.resetsWeekAt && member.resetsWeekAt.getTime() <= t;
    usedPctWeek = weekRolled ? 0 : clampPct(member.usedPctWeek);
  }
  return { usedPct5h: clampPct(base + inFlightPct), usedPctWeek, confidence };
}

/** 100 − used − cost ≥ reserve (5-hour), and the same for the weekly limit when known. */
export function hasHeadroom(member: Pick<SeatMember, 'reservePct'>, estimate: UsageEstimate, costPct: number): boolean {
  if (100 - estimate.usedPct5h - costPct < member.reservePct) return false;
  if (estimate.usedPctWeek != null && 100 - estimate.usedPctWeek - costPct < member.reservePct) return false;
  return true;
}

/** Headroom left above the reserve after `costPct` (can be negative). */
export function spareAfter(member: Pick<SeatMember, 'reservePct'>, estimate: UsageEstimate, costPct: number): number {
  return 100 - estimate.usedPct5h - member.reservePct - costPct;
}
