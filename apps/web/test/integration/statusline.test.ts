import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const SCRIPT = resolve(import.meta.dirname, '..', '..', '..', '..', 'scripts', 'relay-statusline.mjs');
let server: Server | null = null;
afterEach(() => void server?.close());

function run(input: string, env: Record<string, string>, home: string): Promise<string> {
  return new Promise((res, rej) => {
    const childEnv: Record<string, string> = { PATH: process.env.PATH ?? '', HOME: home, ...env };
    const child = spawn('node', [SCRIPT], { env: { ...childEnv, NODE_ENV: 'test' }, stdio: ['pipe', 'pipe', 'ignore'] });
    let out = '';
    child.stdout.on('data', (c: Buffer) => (out += c.toString()));
    child.on('error', rej);
    child.on('close', () => res(out));
    child.stdin.end(input);
  });
}

function listen(): Promise<{ url: string; hits: { auth: string | undefined; body: Record<string, unknown> }[] }> {
  const hits: { auth: string | undefined; body: Record<string, unknown> }[] = [];
  return new Promise((ok) => {
    server = createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        hits.push({ auth: req.headers.authorization, body: JSON.parse(body) });
        res.writeHead(200, { 'content-type': 'application/json' }).end('{"ok":true}');
      });
    }).listen(0, '127.0.0.1', () => ok({ url: `http://127.0.0.1:${(server!.address() as { port: number }).port}`, hits }));
  });
}

const SAMPLE = JSON.stringify({ rate_limits: { five_hour: { used_percentage: 42, resets_at: '2026-10-17T20:00:00Z' } } });

describe('relay-statusline.mjs (SPEC §15, M9)', () => {
  it('prints the status line, caches beacon.json, and posts once with the bearer token', async () => {
    const home = mkdtempSync(join(tmpdir(), 'relay-home-'));
    const { url, hits } = await listen();
    const t0 = Date.now();
    const out = await run(SAMPLE, { RELAY_URL: url, RELAY_USAGE_TOKEN: 'rut_testtoken' }, home);
    expect(out.trim()).toBe('Relay ▸ 5h 42%');
    expect(Date.now() - t0).toBeLessThan(2000);
    const beacon = JSON.parse(readFileSync(join(home, '.relay', 'beacon.json'), 'utf8'));
    expect(beacon).toMatchObject({ usedPct5h: 42, resets5hAt: '2026-10-17T20:00:00.000Z' });
    expect(beacon.lastPostedAt).toBeTypeOf('number');
    expect(readFileSync(join(home, '.relay', 'statusline-last.json'), 'utf8')).toBe(SAMPLE);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ auth: 'Bearer rut_testtoken', body: { usedPct5h: 42, resets5hAt: '2026-10-17T20:00:00.000Z' } });

    // throttled: same values within 60 s are not re-posted; changed values are
    await run(SAMPLE, { RELAY_URL: url, RELAY_USAGE_TOKEN: 'rut_testtoken' }, home);
    expect(hits).toHaveLength(1);
    await run(SAMPLE.replace('42', '55'), { RELAY_URL: url, RELAY_USAGE_TOKEN: 'rut_testtoken' }, home);
    expect(hits).toHaveLength(2);
  });

  it('shows weekly usage, the model name, epoch resets, and tolerates alternate field names', async () => {
    const home = mkdtempSync(join(tmpdir(), 'relay-home-'));
    const payload = JSON.stringify({ model: { display_name: 'Opus' }, rate_limits: { five_hour: { utilization: 0.34, reset_at: 1_790_000_000 }, seven_day: { used_percentage: 52 } } });
    const out = await run(payload, {}, home);
    expect(out.trim()).toBe('Opus · Relay ▸ 5h 34% · wk 52% · not connected');
    const beacon = JSON.parse(readFileSync(join(home, '.relay', 'beacon.json'), 'utf8'));
    expect(beacon.resets5hAt).toBe(new Date(1_790_000_000 * 1000).toISOString());
  });

  it('never throws: empty stdin, garbage, and missing env', async () => {
    const home = mkdtempSync(join(tmpdir(), 'relay-home-'));
    expect((await run('', {}, home)).trim()).toBe('Relay ▸ not connected');
    expect((await run('not json', {}, home)).trim()).toBe('Relay ▸ not connected');
    expect((await run('{}', { RELAY_URL: 'http://127.0.0.1:1', RELAY_USAGE_TOKEN: 't' }, home)).trim()).toBe('Relay ▸ no usage data');
    expect(existsSync(join(home, '.relay', 'beacon.json'))).toBe(true);
  });

  it('survives an unreachable Relay URL without delaying the status line', async () => {
    const home = mkdtempSync(join(tmpdir(), 'relay-home-'));
    const t0 = Date.now();
    const out = await run(SAMPLE, { RELAY_URL: 'http://127.0.0.1:1', RELAY_USAGE_TOKEN: 'rut_x' }, home);
    expect(out.trim()).toBe('Relay ▸ 5h 42%');
    expect(Date.now() - t0).toBeLessThan(2000);
  });
});
