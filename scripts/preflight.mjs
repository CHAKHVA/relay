#!/usr/bin/env node
// Preflight (SPEC §22.4): verify tools, .env.setup, DB, GitHub App, smee, Vercel.
// Prints a ✅/❌ checklist and exits non-zero on any ❌. Never prints secret values.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadEnvSetup, readPem, appJwt, fetchWithTimeout, REQUIRED_VARS, ROOT } from './lib/env-setup.mjs';

const results = [];
const ok = (name, detail = '') => results.push({ pass: true, name, detail });
const fail = (name, fix) => results.push({ pass: false, name, detail: fix });

function cmd(bin, args) {
  return execFileSync(bin, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

// ---- Tools ----
try {
  const v = process.version;
  const major = Number(v.slice(1).split('.')[0]);
  major >= 24 ? ok('node', v) : fail(`node ${v}`, 'SETUP.md §2: fnm install 26 && fnm default 26');
} catch { fail('node', 'SETUP.md §2'); }
for (const [bin, args, step] of [
  ['pnpm', ['-v'], 'SETUP.md §2: corepack enable'],
  ['git', ['--version'], 'SETUP.md §2: xcode-select --install'],
  ['vercel', ['--version'], 'SETUP.md §2: npm i -g vercel smee-client'],
  ['smee', ['--version'], 'SETUP.md §2: npm i -g vercel smee-client'],
]) {
  try { ok(bin, cmd(bin, args).split('\n').pop()); } catch { fail(bin, step); }
}
try {
  const out = execFileSync('gh', ['auth', 'status'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  ok('gh auth', /Logged in/.test(out) ? 'logged in' : 'ok');
} catch (e) {
  const out = String(e.stdout ?? '') + String(e.stderr ?? '');
  /Logged in/.test(out) ? ok('gh auth', 'logged in') : fail('gh auth', 'SETUP.md §2: gh auth login && gh auth refresh -s workflow,repo');
}

// ---- .env.setup ----
const env = loadEnvSetup();
if (!env) {
  fail('.env.setup exists', 'SETUP.md §11: create .env.setup from the template');
} else {
  ok('.env.setup exists');
  const missing = REQUIRED_VARS.filter((k) => !env[k] || /^\.\.\.|<you>|<yourname>/.test(env[k]));
  missing.length ? fail(`.env.setup vars (${missing.join(', ')})`, 'SETUP.md §11: fill every value') : ok('.env.setup vars', `${REQUIRED_VARS.length} set`);
  for (const k of ['GITHUB_APP_PRIVATE_KEY_PATH', 'PROD_GITHUB_APP_PRIVATE_KEY_PATH']) {
    if (env[k]) existsSync(resolve(ROOT, env[k])) ? ok(`${k} file`) : fail(`${k} file`, k.startsWith('PROD') ? 'SETUP.md §9: save key to secrets/relay-prod.pem' : 'SETUP.md §8: save key to secrets/relay-dev.pem');
  }
  try {
    const key = Buffer.from(env.RELAY_ENCRYPTION_KEY ?? '', 'base64');
    key.length === 32 ? ok('RELAY_ENCRYPTION_KEY is 32 bytes') : fail('RELAY_ENCRYPTION_KEY is 32 bytes', 'SETUP.md §7: openssl rand -base64 32');
  } catch { fail('RELAY_ENCRYPTION_KEY', 'SETUP.md §7'); }
  /^https:\/\/api\.anthropic\.com\/v1\/claude_code\/routines\/trig_[A-Za-z0-9]+\/fire$/.test(env.ROUTINE_FIRE_URL ?? '')
    ? ok('ROUTINE_FIRE_URL format') : fail('ROUTINE_FIRE_URL format', 'SETUP.md §10.3: copy the API trigger URL');
}

// ---- Database ----
async function checkDb(label, url, step) {
  try {
    const { neon } = await import('@neondatabase/serverless');
    const sql = neon(url);
    const rows = await sql`select 1 as one`;
    rows[0]?.one === 1 ? ok(label) : fail(label, step);
  } catch (e) {
    fail(`${label} (${e?.code ?? e?.name ?? 'error'})`, step);
  }
}

// ---- GitHub App ----
async function checkApp(label, appId, pemPath, repo, step) {
  try {
    const jwt = appJwt(appId, readPem(pemPath));
    const h = { Authorization: `Bearer ${jwt}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
    const r = await fetchWithTimeout('https://api.github.com/app', { headers: h });
    if (!r.ok) return fail(`${label} auth (HTTP ${r.status})`, step);
    const app = await r.json();
    ok(`${label} auth`, app.slug);
    if (repo) {
      const ri = await fetchWithTimeout(`https://api.github.com/repos/${repo}/installation`, { headers: h });
      ri.ok ? ok(`${label} installed on ${repo}`) : fail(`${label} installed on ${repo} (HTTP ${ri.status})`, 'SETUP.md §8: Install App → only relay-sandbox');
    }
  } catch (e) {
    fail(`${label} auth (${e?.message?.slice(0, 60)})`, step);
  }
}

async function checkSmee(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(url, { headers: { Accept: 'text/event-stream' }, signal: ctrl.signal });
    r.ok ? ok('smee URL reachable') : fail(`smee URL (HTTP ${r.status})`, 'SETUP.md §6: create channel at smee.io/new');
    ctrl.abort();
  } catch (e) {
    e?.name === 'AbortError' ? ok('smee URL reachable') : fail('smee URL', 'SETUP.md §6');
  } finally { clearTimeout(t); }
}

async function checkVercel(token, scope, project) {
  try {
    // Team-scoped tokens cannot read /v2/user; check access to the project instead.
    const r = await fetchWithTimeout(`https://api.vercel.com/v9/projects/${encodeURIComponent(project)}?slug=${encodeURIComponent(scope)}`, { headers: { Authorization: `Bearer ${token}` } });
    r.ok ? ok('Vercel token valid', `project ${project} in ${scope}`) : fail(`Vercel token/project (HTTP ${r.status})`, 'SETUP.md §5: vercel project add relay; create a Vercel token for that scope');
  } catch { fail('Vercel token', 'SETUP.md §5'); }
}

if (env) {
  await Promise.all([
    env.DATABASE_URL && checkDb('dev database connect', env.DATABASE_URL, 'SETUP.md §4.3: dev branch pooled URL'),
    env.PROD_DATABASE_URL && checkDb('prod database connect', env.PROD_DATABASE_URL, 'SETUP.md §4.2: main branch pooled URL'),
    env.GITHUB_APP_ID && checkApp('Relay Dev app', env.GITHUB_APP_ID, env.GITHUB_APP_PRIVATE_KEY_PATH, env.TEST_REPO, 'SETUP.md §8'),
    env.PROD_GITHUB_APP_ID && checkApp('Relay prod app', env.PROD_GITHUB_APP_ID, env.PROD_GITHUB_APP_PRIVATE_KEY_PATH, null, 'SETUP.md §9'),
    env.SMEE_URL && checkSmee(env.SMEE_URL),
    env.VERCEL_TOKEN && checkVercel(env.VERCEL_TOKEN, env.VERCEL_SCOPE, env.VERCEL_PROJECT_NAME),
  ]);
}

console.log('\nRelay preflight\n');
for (const r of results) {
  console.log(`${r.pass ? '✅' : '❌'} ${r.name}${r.detail ? (r.pass ? ` — ${r.detail}` : `\n     fix: ${r.detail}`) : ''}`);
}
const failed = results.filter((r) => !r.pass).length;
console.log(failed ? `\n${failed} check(s) failed.` : '\nAll checks passed.');
process.exit(failed ? 1 : 0);
