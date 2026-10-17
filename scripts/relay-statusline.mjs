#!/usr/bin/env node
// Relay statusLine script for Claude Code. Zero dependencies, never throws, finishes in well under 300 ms.
// Reads Claude Code's status JSON on stdin, caches usage in ~/.relay/beacon.json, and (when RELAY_URL and
// RELAY_USAGE_TOKEN are set) posts it to Relay at most once a minute unless the values changed.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const DIR = join(homedir(), '.relay');
const POST_EVERY_MS = 60_000;
const POST_TIMEOUT_MS = 250;

function readStdin() {
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null);

/** Epoch seconds/milliseconds or an ISO string → ISO string, else null. */
function toIso(v) {
  if (v == null) return null;
  const n = num(v);
  const d = n != null ? new Date(n < 1e12 ? n * 1000 : n) : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function pct(o) {
  if (!o || typeof o !== 'object') return null;
  for (const k of ['used_percentage', 'utilization']) {
    const n = num(o[k]);
    if (n != null) return n <= 1 && k === 'utilization' ? n * 100 : n;
  }
  for (const [k, v] of Object.entries(o)) if (/used|util|percent/i.test(k) && num(v) != null) return num(v);
  return null;
}

function resetOf(o) {
  if (!o || typeof o !== 'object') return null;
  for (const k of ['resets_at', 'reset_at', 'resetsAt']) if (o[k] != null) return toIso(o[k]);
  for (const [k, v] of Object.entries(o)) if (/reset/i.test(k) && toIso(v)) return toIso(v);
  return null;
}

/** Find the window object whose key matches `re` under rate_limits (or anywhere shallow in the payload). */
function windowOf(payload, re) {
  const pools = [payload?.rate_limits, payload?.rateLimits, payload].filter((p) => p && typeof p === 'object');
  for (const pool of pools) for (const [k, v] of Object.entries(pool)) if (re.test(k) && v && typeof v === 'object') return v;
  return null;
}

export function extract(payload) {
  const five = windowOf(payload, /five|5.?h/i);
  const week = windowOf(payload, /seven|week|7.?d/i);
  return {
    usedPct5h: pct(five),
    resets5hAt: resetOf(five),
    usedPctWeek: pct(week),
    resetsWeekAt: resetOf(week),
  };
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

function writeAtomic(path, text) {
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, text);
  renameSync(tmp, path);
}

export function renderLine(u, { model, connected }) {
  const parts = [];
  if (u.usedPct5h != null) parts.push(`5h ${Math.round(u.usedPct5h)}%`);
  if (u.usedPctWeek != null) parts.push(`wk ${Math.round(u.usedPctWeek)}%`);
  let line = `Relay ▸ ${parts.length ? parts.join(' · ') : 'no usage data'}`;
  if (!connected) line = parts.length ? `${line} · not connected` : 'Relay ▸ not connected';
  return model ? `${model} · ${line}` : line;
}

async function main() {
  const raw = readStdin();
  let payload = {};
  try {
    payload = raw.trim() ? JSON.parse(raw) : {};
  } catch {
    payload = {};
  }
  try {
    mkdirSync(DIR, { recursive: true });
    if (raw.trim()) writeAtomic(join(DIR, 'statusline-last.json'), raw);
  } catch {
    /* debugging aid only */
  }
  const found = extract(payload);
  const prev = readJson(join(DIR, 'beacon.json')) ?? {};
  // Keep the last known values when this payload carries none.
  const usage = {
    usedPct5h: found.usedPct5h ?? prev.usedPct5h ?? null,
    resets5hAt: found.usedPct5h != null ? found.resets5hAt : (prev.resets5hAt ?? null),
    usedPctWeek: found.usedPctWeek ?? prev.usedPctWeek ?? null,
    resetsWeekAt: found.usedPctWeek != null ? found.resetsWeekAt : (prev.resetsWeekAt ?? null),
  };
  const now = Date.now();
  const url = (process.env.RELAY_URL ?? '').replace(/\/+$/, '');
  const token = process.env.RELAY_USAGE_TOKEN ?? '';
  const connected = Boolean(url && token);
  const changed = ['usedPct5h', 'resets5hAt', 'usedPctWeek', 'resetsWeekAt'].some((k) => usage[k] !== (prev[k] ?? null));
  let lastPostedAt = prev.lastPostedAt ?? null;
  if (connected && usage.usedPct5h != null && (changed || !lastPostedAt || now - lastPostedAt >= POST_EVERY_MS)) {
    try {
      const res = await fetch(`${url}/api/usage/beacon`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ usedPct5h: usage.usedPct5h, resets5hAt: usage.resets5hAt, usedPctWeek: usage.usedPctWeek, resetsWeekAt: usage.resetsWeekAt }),
        signal: AbortSignal.timeout(POST_TIMEOUT_MS),
      });
      if (res.ok) lastPostedAt = now;
    } catch {
      /* offline or slow: try again on the next update */
    }
  }
  try {
    writeAtomic(join(DIR, 'beacon.json'), JSON.stringify({ ...usage, observedAt: new Date(now).toISOString(), lastPostedAt }, null, 2));
  } catch {
    /* ignore */
  }
  const model = typeof payload?.model?.display_name === 'string' ? payload.model.display_name : null;
  process.stdout.write(`${renderLine(usage, { model, connected })}\n`);
}

// Only run when executed directly (the helpers are exported for tests).
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('relay-statusline.mjs')) {
  main().catch(() => process.stdout.write('Relay ▸ error\n'));
}
