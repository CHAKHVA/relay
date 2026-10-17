#!/usr/bin/env node
// Production smoke test (SPEC §22.1). Uses RELAY_PROD_URL / CRON_SECRET / webhook secret from env or .env.setup.
import { createHmac } from 'node:crypto';
import { loadEnvSetup } from './lib/env-setup.mjs';

const f = loadEnvSetup() ?? {};
const url = (process.env.RELAY_PROD_URL ?? f.PROD_APP_URL ?? '').replace(/\/+$/, '');
const cron = process.env.CRON_SECRET ?? f.PROD_CRON_SECRET;
const hook = process.env.PROD_GITHUB_WEBHOOK_SECRET ?? f.PROD_GITHUB_WEBHOOK_SECRET;
if (!url) {
  console.error('RELAY_PROD_URL not set');
  process.exit(2);
}
let failed = 0;
const check = async (name, fn) => {
  try {
    const msg = await fn();
    console.log(`✓ ${name}${msg ? ` — ${msg}` : ''}`);
  } catch (e) {
    failed++;
    console.log(`✖ ${name} — ${e.message}`);
  }
};
const expectStatus = async (path, want, init) => {
  const r = await fetch(url + path, { redirect: 'manual', ...init });
  if (r.status !== want) throw new Error(`${path} → ${r.status}, expected ${want}`);
  return r;
};

await check('landing renders', async () => {
  const r = await expectStatus('/', 200);
  const t = await r.text();
  if (!t.includes('Sign in with GitHub')) throw new Error('missing sign-in button');
});
await check('/guide and /privacy', async () => {
  await expectStatus('/guide', 200);
  await expectStatus('/privacy', 200);
});
await check('/api/health ok', async () => {
  const r = await expectStatus('/api/health', 200);
  const j = await r.json();
  if (!j.ok || !j.db || !j.github) throw new Error(JSON.stringify(j));
});
await check('protected pages redirect when signed out', async () => {
  const r = await expectStatus('/onboarding', 307);
  if (!r.headers.get('location')?.includes('next=')) throw new Error('no next param');
});
await check('sign-in redirects to GitHub', async () => {
  const r = await fetch(`${url}/api/auth/sign-in/social`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ provider: 'github', callbackURL: '/onboarding' }) });
  const j = await r.json();
  if (!String(j.url).startsWith('https://github.com/login/oauth/authorize')) throw new Error('no GitHub authorize url');
  if (!String(j.url).includes(encodeURIComponent(`${url}/api/auth/callback/github`))) throw new Error('callback URL is not the production URL');
});
await check('test login is disabled in production', async () => void (await expectStatus('/api/test/login', 404, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"githubLogin":"x"}' })));
await check('cron tick: 401 without secret', async () => void (await expectStatus('/api/cron/tick', 401)));
if (cron) await check('cron tick: 200 with secret', async () => void (await expectStatus('/api/cron/tick', 200, { headers: { authorization: `Bearer ${cron}` } })));
await check('webhook rejects unsigned', async () => void (await expectStatus('/api/github/webhook', 401, { method: 'POST', body: '{}' })));
if (hook) {
  await check('webhook accepts a signed ping', async () => {
    const body = JSON.stringify({ zen: 'smoke test', hook_id: 0 });
    const sig = `sha256=${createHmac('sha256', hook).update(body).digest('hex')}`;
    await expectStatus('/api/github/webhook', 200, { method: 'POST', headers: { 'x-hub-signature-256': sig, 'x-github-event': 'ping', 'x-github-delivery': 'smoke', 'content-type': 'application/json' }, body });
  });
}
if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nAll production checks passed');
