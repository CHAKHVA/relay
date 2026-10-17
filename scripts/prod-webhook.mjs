#!/usr/bin/env node
// Ensure the production GitHub App's webhook points at PROD_APP_URL and report recent deliveries (no secrets printed).
import { createSign } from 'node:crypto';
import { loadEnvSetup, readPem } from './lib/env-setup.mjs';

const e = loadEnvSetup();
const now = Math.floor(Date.now() / 1000);
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({ iat: now - 30, exp: now + 540, iss: e.PROD_GITHUB_APP_ID })}`;
const jwt = `${unsigned}.${createSign('RSA-SHA256').update(unsigned).sign(readPem(e.PROD_GITHUB_APP_PRIVATE_KEY_PATH), 'base64url')}`;
const gh = (path, init = {}) => fetch(`https://api.github.com${path}`, { ...init, headers: { authorization: `Bearer ${jwt}`, accept: 'application/vnd.github+json', 'content-type': 'application/json', ...(init.headers ?? {}) } });
const want = `${e.PROD_APP_URL.replace(/\/+$/, '')}/api/github/webhook`;
const cfg = await (await gh('/app/hook/config')).json();
console.log('webhook url:', cfg.url, cfg.url === want ? '(ok)' : `(expected ${want})`);
if (cfg.url !== want || cfg.content_type !== 'json') {
  const r = await gh('/app/hook/config', { method: 'PATCH', body: JSON.stringify({ url: want, content_type: 'json', secret: e.PROD_GITHUB_WEBHOOK_SECRET }) });
  console.log('patched:', r.status);
}
const app = await (await gh('/app')).json();
console.log('app:', app.slug, 'permissions:', JSON.stringify(app.permissions), 'events:', (app.events ?? []).join(','));
const d = await (await gh('/app/hook/deliveries?per_page=5')).json();
for (const x of d) console.log(' delivery', x.event, x.action ?? '', x.status_code, x.delivered_at);

if (process.argv.includes('--redeliver') && d[0]) {
  const r = await gh(`/app/hook/deliveries/${d[0].id}/attempts`, { method: 'POST' });
  console.log('redeliver:', r.status);
  await new Promise((r) => setTimeout(r, 4000));
  const d2 = await (await gh('/app/hook/deliveries?per_page=3')).json();
  for (const x of d2) console.log(' delivery', x.event, x.status_code, x.delivered_at);
}
