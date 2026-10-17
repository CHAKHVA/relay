#!/usr/bin/env node
// Deploy Relay to Vercel production (SPEC §20 M14). Never prints secret values.
//   node scripts/deploy-prod.mjs [settings|env|migrate|secrets|deploy|all]
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadEnvSetup, readPem, ROOT } from './lib/env-setup.mjs';

const e = loadEnvSetup();
if (!e) throw new Error('.env.setup not found');
const need = ['VERCEL_TOKEN', 'VERCEL_SCOPE', 'VERCEL_PROJECT_NAME', 'PROD_APP_URL', 'PROD_DATABASE_URL'];
for (const k of need) if (!e[k]) throw new Error(`${k} missing in .env.setup`);
const appUrl = e.PROD_APP_URL.replace(/\/+$/, '');
const API = 'https://api.vercel.com';
const q = `slug=${encodeURIComponent(e.VERCEL_SCOPE)}`;

async function vercel(path, init = {}) {
  const res = await fetch(`${API}${path}${path.includes('?') ? '&' : '?'}${q}`, {
    ...init,
    headers: { authorization: `Bearer ${e.VERCEL_TOKEN}`, 'content-type': 'application/json', ...(init.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Vercel ${init.method ?? 'GET'} ${path} → ${res.status} ${body?.error?.message ?? ''}`);
  return body;
}

async function project() {
  return vercel(`/v9/projects/${e.VERCEL_PROJECT_NAME}`);
}

async function settings() {
  const p = await project();
  await vercel(`/v9/projects/${p.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ framework: 'nextjs', rootDirectory: 'apps/web', sourceFilesOutsideRootDirectory: true, nodeVersion: '24.x' }),
  });
  mkdirSync(resolve(ROOT, '.vercel'), { recursive: true });
  writeFileSync(resolve(ROOT, '.vercel/project.json'), JSON.stringify({ projectId: p.id, orgId: p.accountId }));
  console.log('✓ project settings: nextjs, root apps/web, node 24.x; linked');
}

function prodEnv() {
  const pem = readPem(e.PROD_GITHUB_APP_PRIVATE_KEY_PATH).trim().replace(/\r?\n/g, '\\n');
  return {
    DATABASE_URL: e.PROD_DATABASE_URL,
    BETTER_AUTH_SECRET: e.PROD_BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: appUrl,
    APP_URL: appUrl,
    GITHUB_CLIENT_ID: e.PROD_GITHUB_CLIENT_ID,
    GITHUB_CLIENT_SECRET: e.PROD_GITHUB_CLIENT_SECRET,
    GITHUB_APP_ID: e.PROD_GITHUB_APP_ID,
    GITHUB_APP_SLUG: e.PROD_GITHUB_APP_SLUG,
    GITHUB_APP_PRIVATE_KEY: pem,
    GITHUB_WEBHOOK_SECRET: e.PROD_GITHUB_WEBHOOK_SECRET,
    RELAY_ENCRYPTION_KEY: e.PROD_RELAY_ENCRYPTION_KEY,
    CRON_SECRET: e.PROD_CRON_SECRET,
    RELAY_DEMO_TEMPLATE_REPO: e.DEMO_TEMPLATE_REPO,
    ...(e.NEXT_PUBLIC_DEMO_VIDEO_URL ? { NEXT_PUBLIC_DEMO_VIDEO_URL: e.NEXT_PUBLIC_DEMO_VIDEO_URL } : {}),
  };
}

async function envVars() {
  const p = await project();
  const vars = prodEnv();
  for (const [key, value] of Object.entries(vars)) {
    if (!value) throw new Error(`${key} is empty`);
    await vercel(`/v10/projects/${p.id}/env?upsert=true`, {
      method: 'POST',
      body: JSON.stringify({ key, value, type: key.startsWith('NEXT_PUBLIC_') ? 'plain' : 'encrypted', target: ['production'] }),
    });
  }
  // Test login must never exist in production.
  const all = await vercel(`/v9/projects/${p.id}/env`);
  for (const v of all.envs.filter((x) => x.key === 'RELAY_ENABLE_TEST_LOGIN')) await vercel(`/v9/projects/${p.id}/env/${v.id}`, { method: 'DELETE' });
  console.log(`✓ set ${Object.keys(vars).length} production env vars (values not shown)`);
}

function migrate() {
  const r = spawnSync('node', ['apps/web/scripts/migrate.mjs'], { cwd: ROOT, env: { ...process.env, DATABASE_URL: e.PROD_DATABASE_URL }, stdio: 'inherit' });
  if (r.status !== 0) throw new Error('migration failed');
}

function secrets() {
  const repo = e.APP_REPO;
  const set = (name, value) => execFileSync('gh', ['secret', 'set', name, '--repo', repo], { input: value, stdio: ['pipe', 'ignore', 'inherit'] });
  set('RELAY_TICK_URL', `${appUrl}/api/cron/tick`);
  set('CRON_SECRET', e.PROD_CRON_SECRET);
  set('RELAY_PROD_URL', appUrl);
  console.log(`✓ GitHub Actions secrets set on ${repo}`);
}

function deploy() {
  // Team-scoped tokens can't call /v2/user, so identify the project through VERCEL_ORG_ID / VERCEL_PROJECT_ID (as CI does).
  const link = JSON.parse(readFileSync(resolve(ROOT, '.vercel/project.json'), 'utf8'));
  const r = spawnSync('vercel', ['deploy', '--prod', '--yes', '--token', e.VERCEL_TOKEN], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, VERCEL_ORG_ID: link.orgId, VERCEL_PROJECT_ID: link.projectId },
  });
  const out = `${r.stdout}\n${r.stderr}`;
  console.log(out.split('\n').filter((l) => !/token/i.test(l)).slice(-25).join('\n'));
  if (r.status !== 0) throw new Error('vercel deploy failed');
}

const steps = { settings, env: envVars, migrate, secrets, deploy };
const which = process.argv[2] ?? 'all';
for (const [name, fn] of Object.entries(steps)) {
  if (which === 'all' || which === name) await fn();
}
