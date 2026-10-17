/** "3 min ago" / "in 2 h" style relative time. */
export function relTime(iso: string | Date | null | undefined, now = Date.now()): string {
  if (!iso) return '';
  const diff = new Date(iso).getTime() - now;
  const abs = Math.abs(diff);
  const m = Math.round(abs / 60_000);
  let s: string;
  if (m < 1) s = 'just now';
  else if (m < 60) s = `${m} min`;
  else if (m < 60 * 24) s = `${Math.round(m / 60)} h`;
  else s = `${Math.round(m / 1440)} d`;
  if (s === 'just now') return s;
  return diff < 0 ? `${s} ago` : `in ${s}`;
}

/** HH:mm in an IANA time zone. */
export function clock(iso: string | Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone }).format(new Date(iso));
  } catch {
    return new Date(iso).toISOString().slice(11, 16);
  }
}

export function dayClock(iso: string | Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone }).format(new Date(iso));
  } catch {
    return clock(iso, 'UTC');
  }
}
