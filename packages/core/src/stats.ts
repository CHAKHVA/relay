import { BLENDED_USD_PER_MTOK } from './config';
import type { SchedTask, SeatMember } from './types';

export interface RelayStats {
  tasksOffHours: number;
  tasksBeforeReset: number;
  tasksManual: number;
  tasksShared: number;
  /** est. share of 5-hour windows used by completed runs that would otherwise have expired. */
  estQuotaUsedPct: number;
  estTokensShared: number;
  estCreditsAvoidedUsd: number;
}

/** SPEC §10.10. Completed = done|merged work runs. All figures are estimates ("est."). */
export function computeStats(tasks: SchedTask[], members: Pick<SeatMember, 'id' | 'reservePct'>[]): RelayStats {
  const reserve = new Map(members.map((m) => [m.id, m.reservePct]));
  const completed = tasks.filter((t) => (t.status === 'done' || t.status === 'merged') && t.runKind === 'work');
  const shared = completed.filter((t) => t.shared);
  let tokensAvoided = 0;
  for (const t of shared) {
    const r = reserve.get(t.requesterMemberId) ?? 10;
    if (t.requesterUsedPctAtDispatch != null && t.requesterUsedPctAtDispatch >= 100 - r) tokensAvoided += t.estTokens ?? 0;
  }
  return {
    tasksOffHours: completed.filter((t) => t.windowKind === 'off_hours').length,
    tasksBeforeReset: completed.filter((t) => t.windowKind === 'before_reset').length,
    tasksManual: completed.filter((t) => t.windowKind === 'manual').length,
    tasksShared: shared.length,
    estQuotaUsedPct: completed.reduce((s, t) => s + t.costPct, 0),
    estTokensShared: shared.reduce((s, t) => s + (t.estTokens ?? 0), 0),
    estCreditsAvoidedUsd: Math.round(((tokensAvoided * BLENDED_USD_PER_MTOK) / 1e6) * 100) / 100,
  };
}
