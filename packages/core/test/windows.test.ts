import { describe, expect, it } from 'vitest';
import {
  activeWindowEnd,
  activeWindowKind,
  formatLocalTime,
  inLocalWindow,
  isInBeforeReset,
  isInOffHours,
  isInTestWindow,
  isValidHHmm,
  isValidTimeZone,
  localDate,
  nextLocalTime,
  nextWindowStart,
  parseHHmm,
  workspaceNow,
} from '../src/windows';
import { at, member } from './fixtures';

describe('workspaceNow', () => {
  const real = at('2026-10-17T12:00:00Z');
  it('applies offset only in demo mode', () => {
    expect(workspaceNow({ demoMode: true, clockOffsetMinutes: 90 }, real).toISOString()).toBe('2026-10-17T13:30:00.000Z');
    expect(workspaceNow({ demoMode: false, clockOffsetMinutes: 90 }, real)).toBe(real);
    expect(workspaceNow({ demoMode: true, clockOffsetMinutes: 0 }, real)).toBe(real);
  });
});

describe('parseHHmm / validators', () => {
  it('parses and rejects', () => {
    expect(parseHHmm('19:30')).toBe(1170);
    expect(parseHHmm('00:00')).toBe(0);
    expect(() => parseHHmm('24:00')).toThrow();
    expect(() => parseHHmm('7:00')).toThrow();
    expect(isValidHHmm('23:59')).toBe(true);
    expect(isValidHHmm('23:60')).toBe(false);
  });
  it('validates time zones', () => {
    expect(isValidTimeZone('Asia/Tbilisi')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
  });
});

describe('inLocalWindow', () => {
  it('same-day window', () => {
    expect(inLocalWindow(600, 540, 1020)).toBe(true);
    expect(inLocalWindow(1020, 540, 1020)).toBe(false); // end exclusive
    expect(inLocalWindow(540, 540, 1020)).toBe(true); // start inclusive
  });
  it('wrapping window', () => {
    expect(inLocalWindow(1200, 1140, 480)).toBe(true);
    expect(inLocalWindow(60, 1140, 480)).toBe(true);
    expect(inLocalWindow(600, 1140, 480)).toBe(false);
  });
  it('empty window', () => {
    expect(inLocalWindow(600, 600, 600)).toBe(false);
  });
});

describe('isInOffHours', () => {
  const tbilisi = member({ timezone: 'Asia/Tbilisi', offHoursStart: '19:00', offHoursEnd: '08:00' }); // UTC+4
  it('wraps past midnight in member tz', () => {
    expect(isInOffHours(tbilisi, at('2026-10-17T15:00:00Z'))).toBe(true); // 19:00 local
    expect(isInOffHours(tbilisi, at('2026-10-17T14:59:00Z'))).toBe(false); // 18:59
    expect(isInOffHours(tbilisi, at('2026-10-17T22:00:00Z'))).toBe(true); // 02:00
    expect(isInOffHours(tbilisi, at('2026-10-18T03:59:00Z'))).toBe(true); // 07:59
    expect(isInOffHours(tbilisi, at('2026-10-18T04:00:00Z'))).toBe(false); // 08:00
  });
  it('same-day window', () => {
    const m = member({ offHoursStart: '12:00', offHoursEnd: '14:00' });
    expect(isInOffHours(m, at('2026-10-17T13:00:00Z'))).toBe(true);
    expect(isInOffHours(m, at('2026-10-17T14:00:00Z'))).toBe(false);
    expect(isInOffHours(m, at('2026-10-17T11:59:00Z'))).toBe(false);
  });
  it('handles DST change (Europe/Berlin spring forward 2026-03-29)', () => {
    const berlin = member({ timezone: 'Europe/Berlin', offHoursStart: '19:00', offHoursEnd: '08:00' });
    // 06:30Z = 08:30 CEST (after the change) → outside; a fixed +1 offset would say 07:30 → inside.
    expect(isInOffHours(berlin, at('2026-03-29T06:30:00Z'))).toBe(false);
    // 06:30Z the day before = 07:30 CET → inside.
    expect(isInOffHours(berlin, at('2026-03-28T06:30:00Z'))).toBe(true);
  });
  it('handles DST fall back (America/New_York 2026-11-01)', () => {
    const ny = member({ timezone: 'America/New_York', offHoursStart: '19:00', offHoursEnd: '08:00' });
    // 12:30Z = 07:30 EST after fall back → inside; with EDT it would be 08:30 → outside.
    expect(isInOffHours(ny, at('2026-11-01T12:30:00Z'))).toBe(true);
    expect(isInOffHours(ny, at('2026-10-31T12:30:00Z'))).toBe(false); // 08:30 EDT
  });
});

describe('isInBeforeReset', () => {
  const m = member({ beforeResetMinutes: 120 });
  const now = at('2026-10-17T12:00:00Z');
  it('true only when 0 < reset - now ≤ window', () => {
    expect(isInBeforeReset(m, now, { resets5hAt: at('2026-10-17T13:00:00Z') })).toBe(true);
    expect(isInBeforeReset(m, now, { resets5hAt: at('2026-10-17T14:00:00Z') })).toBe(true); // exactly 120
    expect(isInBeforeReset(m, now, { resets5hAt: at('2026-10-17T14:01:00Z') })).toBe(false);
    expect(isInBeforeReset(m, now, { resets5hAt: now })).toBe(false);
    expect(isInBeforeReset(m, now, { resets5hAt: at('2026-10-17T11:00:00Z') })).toBe(false);
    expect(isInBeforeReset(m, now, { resets5hAt: null })).toBe(false);
  });
});

describe('activeWindowKind', () => {
  const now = at('2026-10-17T20:00:00Z');
  it('off_hours wins over before_reset', () => {
    const m = member();
    expect(activeWindowKind(m, now, { resets5hAt: at('2026-10-17T21:00:00Z') })).toBe('off_hours');
  });
  it('before_reset during the day', () => {
    const m = member();
    const noon = at('2026-10-17T12:00:00Z');
    expect(activeWindowKind(m, noon, { resets5hAt: at('2026-10-17T13:00:00Z') })).toBe('before_reset');
    expect(activeWindowKind(m, noon, { resets5hAt: null })).toBeNull();
  });
  it('test window when no real window', () => {
    const noon = at('2026-10-17T12:00:00Z');
    const m = member({ testWindowUntil: at('2026-10-17T12:30:00Z') });
    expect(isInTestWindow(m, noon)).toBe(true);
    expect(activeWindowKind(m, noon, { resets5hAt: null })).toBe('test');
    expect(activeWindowKind(m, at('2026-10-17T12:30:00Z'), { resets5hAt: null })).toBeNull();
  });
});

describe('nextLocalTime / nextWindowStart', () => {
  it('next off-hours start later today or tomorrow', () => {
    const tz = 'Asia/Tbilisi';
    expect(nextLocalTime(at('2026-10-17T10:00:00Z'), tz, '19:00').toISOString()).toBe('2026-10-17T15:00:00.000Z');
    expect(nextLocalTime(at('2026-10-17T15:00:00Z'), tz, '19:00').toISOString()).toBe('2026-10-18T15:00:00.000Z');
  });
  it('is DST-aware', () => {
    // Saturday 20:00Z in Berlin (21:00 CET); next 19:00 is Sunday after spring-forward = 17:00Z.
    expect(nextLocalTime(at('2026-03-28T20:00:00Z'), 'Europe/Berlin', '19:00').toISOString()).toBe('2026-03-29T17:00:00.000Z');
  });
  it('picks the earliest of off-hours and before-reset', () => {
    const m = member();
    const now = at('2026-10-17T10:00:00Z');
    expect(nextWindowStart(m, now, { resets5hAt: at('2026-10-17T14:00:00Z') })?.toISOString()).toBe('2026-10-17T12:00:00.000Z');
    expect(nextWindowStart(m, now, { resets5hAt: null })?.toISOString()).toBe('2026-10-17T19:00:00.000Z');
    // before-reset already started → only off-hours
    expect(nextWindowStart(m, now, { resets5hAt: at('2026-10-17T11:00:00Z') })?.toISOString()).toBe('2026-10-17T19:00:00.000Z');
  });
  it('null when no window can start', () => {
    const m = member({ offHoursStart: '10:00', offHoursEnd: '10:00' });
    expect(nextWindowStart(m, at('2026-10-17T10:00:00Z'), { resets5hAt: null })).toBeNull();
  });
});

describe('activeWindowEnd / formatting', () => {
  it('ends per window kind', () => {
    const m = member({ testWindowUntil: at('2026-10-17T12:45:00Z') });
    expect(activeWindowEnd(m, at('2026-10-17T20:00:00Z'), { resets5hAt: null })?.toISOString()).toBe('2026-10-18T08:00:00.000Z');
    expect(activeWindowEnd(m, at('2026-10-17T12:00:00Z'), { resets5hAt: at('2026-10-17T13:00:00Z') })?.toISOString()).toBe('2026-10-17T13:00:00.000Z');
    expect(activeWindowEnd(m, at('2026-10-17T12:00:00Z'), { resets5hAt: null })?.toISOString()).toBe('2026-10-17T12:45:00.000Z');
    expect(activeWindowEnd(member(), at('2026-10-17T12:00:00Z'), { resets5hAt: null })).toBeNull();
  });
  it('formats in zone', () => {
    expect(formatLocalTime(at('2026-10-17T15:05:00Z'), 'Asia/Tbilisi')).toBe('19:05');
    expect(localDate(at('2026-10-17T22:00:00Z'), 'Asia/Tbilisi')).toBe('2026-10-18');
  });
});
