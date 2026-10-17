#!/usr/bin/env node
// Secret hygiene check (SPEC §22.6). Scans staged files (or paths given as args)
// for private keys, tokens, connection strings, and literal .env.setup secret values.
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { loadEnvSetup } from './lib/env-setup.mjs';

const PATTERNS = [
  { name: 'private key', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: 'GitHub token', re: /\b(ghs|ghp|gho|ghu|ghr)_[A-Za-z0-9]{20,}/ },
  { name: 'GitHub PAT', re: /\bgithub_pat_[A-Za-z0-9_]{20,}/ },
  { name: 'Anthropic token', re: /\bsk-ant-[A-Za-z0-9_-]{16,}/ },
  { name: 'Postgres URL with credentials', re: /postgres(ql)?:\/\/[^\s'"`@/]+:[^\s'"`@/]+@/ },
  { name: 'Vercel token', re: /\bvercel_[A-Za-z0-9]{20,}/ },
];

// Values in .env.setup that are not secret (identity, public URLs, ids).
const PUBLIC_KEYS = new Set([
  'GITHUB_OWNER', 'TEST_REPO', 'DEMO_TEMPLATE_REPO', 'APP_REPO', 'APP_URL', 'PROD_APP_URL',
  'GITHUB_APP_ID', 'GITHUB_APP_SLUG', 'GITHUB_CLIENT_ID', 'PROD_GITHUB_APP_ID', 'PROD_GITHUB_APP_SLUG',
  'PROD_GITHUB_CLIENT_ID', 'GITHUB_APP_PRIVATE_KEY_PATH', 'PROD_GITHUB_APP_PRIVATE_KEY_PATH',
  'REAL_FIRE_BUDGET', 'VERCEL_SCOPE', 'VERCEL_PROJECT_NAME',
]);

const env = loadEnvSetup() ?? {};
const secretValues = Object.entries(env)
  .filter(([k, v]) => !PUBLIC_KEYS.has(k) && v && v.length >= 8)
  .map(([k, v]) => ({ k, v }));

function stagedFiles() {
  const out = execFileSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z'], { encoding: 'utf8' });
  return out.split('\0').filter(Boolean);
}
function stagedContent(path) {
  try {
    return execFileSync('git', ['show', `:${path}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  } catch {
    return '';
  }
}

const args = process.argv.slice(2);
const files = args.length ? args : stagedFiles();
const findings = [];
for (const f of files) {
  if (/(^|\/)pnpm-lock\.yaml$/.test(f)) continue;
  const content = args.length ? (existsSync(f) ? readFileSync(f, 'utf8') : '') : stagedContent(f);
  if (!content || content.includes('\0')) continue;
  for (const p of PATTERNS) if (p.re.test(content)) findings.push(`${f}: ${p.name}`);
  for (const { k, v } of secretValues) if (content.includes(v)) findings.push(`${f}: value of ${k}`);
  if (/(^|\/)\.env(\.|$)/.test(f) && !f.endsWith('.env.example')) findings.push(`${f}: env file must not be committed`);
  if (/\.pem$/.test(f)) findings.push(`${f}: key file must not be committed`);
}

if (findings.length) {
  console.error('✖ Secret check failed:\n' + findings.map((x) => `  - ${x}`).join('\n'));
  process.exit(1);
}
console.log(`✓ Secret check passed (${files.length} file(s))`);
