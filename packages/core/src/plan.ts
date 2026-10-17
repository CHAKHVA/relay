import { DEFAULT_SIZE, SIZE_COST, TRIAGE_COST } from './config';
import { estimateUsage, hasHeadroom, inFlightCostPct, spareAfter } from './headroom';
import { findConflict, isActiveClaim } from './ledger';
import type { Priority, RunKind, SchedTask, SeatMember, TaskStatus, UsageEstimate, WindowKind } from './types';
import { activeWindowKind, formatLocalTime, localDate, nextWindowStart } from './windows';

export type IneligibleReason =
  | 'simulated'
  | 'paused'
  | 'no_routine'
  | 'no_window'
  | 'busy'
  | 'no_headroom'
  | 'sharing_off';

export interface SeatState {
  member: SeatMember;
  estimate: UsageEstimate;
  running: number;
  dispatchedToday: number;
}

export interface JobCost {
  pct: number;
  tokens: number;
}

export function jobCost(task: Pick<SchedTask, 'size'>, runKind: RunKind): JobCost {
  if (runKind === 'triage') return { ...TRIAGE_COST };
  return { ...SIZE_COST[task.size ?? DEFAULT_SIZE] };
}

/** Why a seat can't take a job right now, or null if it is eligible (SPEC §10.3). */
export function seatIneligibility(
  seat: SeatState,
  opts: { now: Date; costPct: number; ownJob: boolean; ignoreWindow: boolean },
): IneligibleReason | null {
  const m = seat.member;
  if (m.simulated) return 'simulated';
  if (m.paused) return 'paused';
  if (!m.routineConfigured) return 'no_routine';
  if (!opts.ownJob && !m.sharingEnabled) return 'sharing_off';
  if (!opts.ignoreWindow && !activeWindowKind(m, opts.now, m)) return 'no_window';
  if (seat.running >= m.maxConcurrent) return 'busy';
  if (!hasHeadroom(m, seat.estimate, opts.costPct)) return 'no_headroom';
  return null;
}

export type PlanAction =
  | {
      kind: 'dispatch';
      taskId: string;
      memberId: string;
      runKind: RunKind;
      windowKind: WindowKind;
      costPct: number;
      estTokens: number;
      shared: boolean;
      requesterUsedPct: number | null;
    }
  | { kind: 'wait'; taskId: string; status: TaskStatus; statusReason: string }
  | { kind: 'block'; taskId: string; blockedByTaskId: string; blockedOnFiles: string[]; statusReason: string };

export interface PlanInput {
  now: Date;
  members: SeatMember[];
  tasks: SchedTask[];
}

const PRIORITY_RANK: Record<Priority, number> = { high: 0, normal: 1, low: 2 };
const RUNNING: TaskStatus[] = ['dispatched', 'triaging'];
const WORK_CANDIDATES: TaskStatus[] = ['queued', 'waiting_window', 'blocked'];

/** Candidate jobs in scheduling order: manual (Run now / Triage now) first, then priority, then oldest. */
export function orderJobs(tasks: SchedTask[]): { task: SchedTask; runKind: RunKind }[] {
  const jobs: { task: SchedTask; runKind: RunKind }[] = [];
  for (const t of tasks) {
    if (t.status === 'needs_triage') jobs.push({ task: t, runKind: 'triage' });
    else if (WORK_CANDIDATES.includes(t.status)) jobs.push({ task: t, runKind: 'work' });
  }
  const manual = (j: { task: SchedTask; runKind: RunKind }) =>
    j.task.runNow || (j.runKind === 'triage' && j.task.triageNow) ? 0 : 1;
  return jobs.sort(
    (a, b) =>
      manual(a) - manual(b) ||
      PRIORITY_RANK[a.task.priority] - PRIORITY_RANK[b.task.priority] ||
      a.task.createdAt.getTime() - b.task.createdAt.getTime() ||
      a.task.id.localeCompare(b.task.id),
  );
}

export function buildSeatStates(members: SeatMember[], tasks: SchedTask[], now: Date): Map<string, SeatState> {
  const seats = new Map<string, SeatState>();
  for (const m of members) {
    const today = localDate(now, m.timezone);
    let running = 0;
    let dispatchedToday = 0;
    for (const t of tasks) {
      if (t.assigneeMemberId !== m.id) continue;
      if (RUNNING.includes(t.status)) running++;
      if (t.dispatchedAt && localDate(t.dispatchedAt, m.timezone) === today) dispatchedToday++;
    }
    seats.set(m.id, {
      member: m,
      estimate: estimateUsage(m, now, inFlightCostPct(m, tasks, now)),
      running,
      dispatchedToday,
    });
  }
  return seats;
}

function nextWindowText(seats: SeatState[], now: Date): string | null {
  let best: { at: Date; m: SeatMember } | null = null;
  for (const s of seats) {
    const at = nextWindowStart(s.member, now, s.member);
    if (at && (!best || at.getTime() < best.at.getTime())) best = { at, m: s.member };
  }
  if (!best) return null;
  return `Next window: ${best.m.displayName} at ${formatLocalTime(best.at, best.m.timezone)} ${best.m.timezone}`;
}

const REASON_TEXT: Record<IneligibleReason, (m: SeatMember, s: SeatState) => string> = {
  simulated: () => 'simulated seats never run tasks',
  paused: (m) => `${m.displayName}'s seat is paused`,
  no_routine: (m) => `${m.displayName} has no routine configured`,
  sharing_off: (m) => `${m.displayName} isn't sharing`,
  no_window: (m) => `${m.displayName} is outside a run window`,
  busy: (m) => `${m.displayName}'s seat is busy`,
  no_headroom: (m, s) => `${m.displayName} is at ${Math.round(s.estimate.usedPct5h)}% (reserve ${m.reservePct}%)`,
};

function waitReason(requester: SeatState | undefined, candidates: SeatState[], now: Date, cost: JobCost, manual: boolean): string {
  if (manual && requester) {
    const r = seatIneligibility(requester, { now, costPct: cost.pct, ownJob: true, ignoreWindow: true });
    if (r) return `Run now waiting: ${REASON_TEXT[r](requester.member, requester)}`;
  }
  // A seat that is in a window but lacks headroom or is busy is the most useful thing to say.
  for (const s of candidates) {
    const r = seatIneligibility(s, { now, costPct: cost.pct, ownJob: s === requester, ignoreWindow: false });
    if (r === 'no_headroom' || r === 'busy') return `Waiting for headroom: ${REASON_TEXT[r](s.member, s)}`;
  }
  const next = nextWindowText(candidates, now);
  if (next) return next;
  if (requester?.member.simulated) return 'No seat available: requester is simulated and no teammate is sharing';
  if (requester && !requester.member.routineConfigured) return 'No seat available: connect your Claude routine';
  if (requester?.member.paused) return 'No seat available: your seat is paused';
  return 'No seat available';
}

/**
 * Pure scheduler (SPEC §10.4). Returns actions; applies the cost of each dispatch to
 * the in-memory estimate so later jobs in the same tick see reduced headroom.
 */
export function planTick(input: PlanInput): PlanAction[] {
  const { now, members, tasks } = input;
  const seats = buildSeatStates(members, tasks, now);
  const claims = tasks.filter(isActiveClaim).map((t) => ({ id: t.id, likelyFiles: t.likelyFiles }));
  const actions: PlanAction[] = [];

  for (const { task, runKind } of orderJobs(tasks)) {
    const cost = jobCost(task, runKind);
    const requester = seats.get(task.requesterMemberId);
    const manual = task.runNow || (runKind === 'triage' && task.triageNow);
    let chosen: { seat: SeatState; windowKind: WindowKind } | null = null;

    // Manual (Run now / Triage now): requester's own seat only, windows ignored.
    if (manual && requester && !seatIneligibility(requester, { now, costPct: cost.pct, ownJob: true, ignoreWindow: true })) {
      chosen = { seat: requester, windowKind: 'manual' };
    }
    // Own seat first.
    if (!chosen && requester && !seatIneligibility(requester, { now, costPct: cost.pct, ownJob: true, ignoreWindow: false })) {
      chosen = { seat: requester, windowKind: windowKindOf(requester, now) };
    }
    // Then opted-in teammates with the most spare headroom; tie-break fewest dispatched today.
    if (!chosen) {
      const teammates = [...seats.values()]
        .filter((s) => s.member.id !== task.requesterMemberId)
        .filter((s) => !seatIneligibility(s, { now, costPct: cost.pct, ownJob: false, ignoreWindow: false }))
        .sort(
          (a, b) =>
            spareAfter(b.member, b.estimate, cost.pct) - spareAfter(a.member, a.estimate, cost.pct) ||
            a.dispatchedToday - b.dispatchedToday ||
            a.member.id.localeCompare(b.member.id),
        );
      if (teammates[0]) chosen = { seat: teammates[0], windowKind: windowKindOf(teammates[0], now) };
    }

    if (!chosen) {
      const candidates = [...seats.values()].filter(
        (s) => !s.member.simulated && !s.member.paused && s.member.routineConfigured &&
          (s.member.id === task.requesterMemberId || s.member.sharingEnabled),
      );
      const statusReason = waitReason(requester, candidates, now, cost, manual);
      actions.push({ kind: 'wait', taskId: task.id, status: runKind === 'triage' ? 'needs_triage' : 'waiting_window', statusReason });
      continue;
    }

    if (runKind === 'work' && (task.type === 'code' || task.type === 'docs')) {
      const conflict = findConflict(task, claims);
      if (conflict) {
        actions.push({
          kind: 'block',
          taskId: task.id,
          ...conflict,
          statusReason: `Blocked on ${conflict.blockedOnFiles.join(', ')} by ${conflict.blockedByTaskId}`,
        });
        continue;
      }
      claims.push({ id: task.id, likelyFiles: task.likelyFiles });
    }

    const seat = chosen.seat;
    actions.push({
      kind: 'dispatch',
      taskId: task.id,
      memberId: seat.member.id,
      runKind,
      windowKind: chosen.windowKind,
      costPct: cost.pct,
      estTokens: cost.tokens,
      shared: seat.member.id !== task.requesterMemberId,
      requesterUsedPct: requester ? requester.estimate.usedPct5h : null,
    });
    seat.estimate = { ...seat.estimate, usedPct5h: Math.min(100, seat.estimate.usedPct5h + cost.pct) };
    seat.running++;
    seat.dispatchedToday++;
  }
  return actions;
}

function windowKindOf(seat: SeatState, now: Date): WindowKind {
  const k = activeWindowKind(seat.member, now, seat.member);
  return k === 'off_hours' || k === 'before_reset' ? k : 'manual';
}
