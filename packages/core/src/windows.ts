import { Temporal } from 'temporal-polyfill';
import type { ActiveWindow, SeatMember, WorkspaceClock } from './types';

type WindowMember = Pick<
  SeatMember,
  'timezone' | 'offHoursStart' | 'offHoursEnd' | 'beforeResetMinutes' | 'testWindowUntil'
>;
type UsageReset = { resets5hAt: Date | null };

/** Workspace "now": real time plus the demo clock offset, honored only in demo mode. */
export function workspaceNow(ws: WorkspaceClock, realNow: Date): Date {
  if (!ws.demoMode || !ws.clockOffsetMinutes) return realNow;
  return new Date(realNow.getTime() + ws.clockOffsetMinutes * 60_000);
}

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isValidHHmm(value: string): boolean {
  return HHMM.test(value);
}

/** Parse "HH:mm" into minutes since midnight. Throws on invalid input. */
export function parseHHmm(value: string): number {
  const m = HHMM.exec(value);
  if (!m) throw new Error(`Invalid time "${value}" (expected HH:mm)`);
  return Number(m[1]) * 60 + Number(m[2]);
}

export function isValidTimeZone(tz: string): boolean {
  try {
    Temporal.Now.instant().toZonedDateTimeISO(tz);
    return true;
  } catch {
    return false;
  }
}

export function toZoned(now: Date, timezone: string): Temporal.ZonedDateTime {
  return Temporal.Instant.fromEpochMilliseconds(now.getTime()).toZonedDateTimeISO(timezone);
}

function minutesOfDay(z: Temporal.ZonedDateTime): number {
  return z.hour * 60 + z.minute;
}

/** True when `m` lies in the local window [start, end); wraps past midnight when start > end. start === end is an empty window. */
export function inLocalWindow(m: number, start: number, end: number): boolean {
  if (start === end) return false;
  if (start < end) return m >= start && m < end;
  return m >= start || m < end;
}

/** Off-hours window [offHoursStart, offHoursEnd) evaluated in the member's own time zone. */
export function isInOffHours(member: WindowMember, now: Date): boolean {
  const z = toZoned(now, member.timezone);
  return inLocalWindow(minutesOfDay(z), parseHHmm(member.offHoursStart), parseHHmm(member.offHoursEnd));
}

/** Before-reset window: reset time known and 0 < resets5hAt − now ≤ beforeResetMinutes. */
export function isInBeforeReset(member: WindowMember, now: Date, usage: UsageReset): boolean {
  if (!usage.resets5hAt) return false;
  const diff = usage.resets5hAt.getTime() - now.getTime();
  return diff > 0 && diff <= member.beforeResetMinutes * 60_000;
}

export function isInTestWindow(member: WindowMember, now: Date): boolean {
  return !!member.testWindowUntil && now.getTime() < member.testWindowUntil.getTime();
}

/**
 * Which run window the seat is in. Off-hours wins over before-reset; a temporary
 * test window applies when neither real window does (so stats keep real window kinds).
 */
export function activeWindowKind(member: WindowMember, now: Date, usage: UsageReset): ActiveWindow {
  if (isInOffHours(member, now)) return 'off_hours';
  if (isInBeforeReset(member, now, usage)) return 'before_reset';
  if (isInTestWindow(member, now)) return 'test';
  return null;
}

/** The next instant strictly after `now` at local time `hhmm` in `timezone` (DST-aware). */
export function nextLocalTime(now: Date, timezone: string, hhmm: string): Date {
  const minutes = parseHHmm(hhmm);
  const z = toZoned(now, timezone);
  const at = (d: Temporal.PlainDate) =>
    d
      .toPlainDateTime({ hour: Math.floor(minutes / 60), minute: minutes % 60 })
      .toZonedDateTime(timezone, { disambiguation: 'compatible' });
  let candidate = at(z.toPlainDate());
  if (candidate.epochMilliseconds <= now.getTime()) candidate = at(z.toPlainDate().add({ days: 1 }));
  return new Date(candidate.epochMilliseconds);
}

/** Earliest upcoming start of either window (off-hours start or resets5hAt − beforeResetMinutes). */
export function nextWindowStart(member: WindowMember, now: Date, usage: UsageReset): Date | null {
  const candidates: Date[] = [];
  if (parseHHmm(member.offHoursStart) !== parseHHmm(member.offHoursEnd)) {
    candidates.push(nextLocalTime(now, member.timezone, member.offHoursStart));
  }
  if (usage.resets5hAt) {
    const start = usage.resets5hAt.getTime() - member.beforeResetMinutes * 60_000;
    if (start > now.getTime()) candidates.push(new Date(start));
  }
  if (!candidates.length) return null;
  return candidates.reduce((a, b) => (a.getTime() <= b.getTime() ? a : b));
}

/** When the currently active window ends (null if not in a window). */
export function activeWindowEnd(member: WindowMember, now: Date, usage: UsageReset): Date | null {
  const kind = activeWindowKind(member, now, usage);
  if (kind === 'off_hours') return nextLocalTime(now, member.timezone, member.offHoursEnd);
  if (kind === 'before_reset') return usage.resets5hAt;
  if (kind === 'test') return member.testWindowUntil;
  return null;
}

/** "19:00" in the member's zone. */
export function formatLocalTime(at: Date, timezone: string): string {
  const z = toZoned(at, timezone);
  return `${String(z.hour).padStart(2, '0')}:${String(z.minute).padStart(2, '0')}`;
}

/** YYYY-MM-DD in the given zone. */
export function localDate(at: Date, timezone: string): string {
  return toZoned(at, timezone).toPlainDate().toString();
}
