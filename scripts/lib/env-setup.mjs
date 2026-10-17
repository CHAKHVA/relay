// Shared helpers for build scripts: parse .env.setup without printing values.
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createSign } from 'node:crypto';

export const ROOT = resolve(import.meta.dirname, '..', '..');

export function loadEnvSetup(path = resolve(ROOT, '.env.setup')) {
  if (!existsSync(path)) return null;
  const out = {};
  for (const raw of readFileSync(path, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  // Repo values may be given as full URLs; normalize to owner/name.
  for (const k of ['TEST_REPO', 'DEMO_TEMPLATE_REPO', 'APP_REPO']) {
    if (out[k]) out[k] = normalizeRepo(out[k]);
  }
  return out;
}

export function normalizeRepo(value) {
  return value.replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '').replace(/\/+$/, '');
}

export function readPem(path) {
  return readFileSync(resolve(ROOT, path), 'utf8');
}

/** Mask a secret for display: keep only a short suffix. */
export function mask(value, keep = 4) {
  if (!value) return '(empty)';
  return `…${String(value).slice(-keep)}`;
}

function b64url(input) {
  return Buffer.from(input).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

/** Create a GitHub App JWT (RS256) with node:crypto only. */
export function appJwt(appId, pem) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify({ iat: now - 60, exp: now + 540, iss: String(appId) }));
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${payload}`);
  const sig = signer.sign(pem).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${header}.${payload}.${sig}`;
}

export async function fetchWithTimeout(url, init = {}, ms = 15_000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

export const REQUIRED_VARS = [
  'GITHUB_OWNER', 'TEST_REPO', 'DEMO_TEMPLATE_REPO', 'APP_REPO',
  'APP_URL', 'DATABASE_URL', 'BETTER_AUTH_SECRET', 'RELAY_ENCRYPTION_KEY', 'CRON_SECRET', 'SMEE_URL',
  'GITHUB_APP_ID', 'GITHUB_APP_SLUG', 'GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET', 'GITHUB_WEBHOOK_SECRET',
  'GITHUB_APP_PRIVATE_KEY_PATH',
  'ROUTINE_FIRE_URL', 'ROUTINE_TOKEN', 'REAL_FIRE_BUDGET',
  'PROD_APP_URL', 'PROD_DATABASE_URL', 'PROD_BETTER_AUTH_SECRET', 'PROD_RELAY_ENCRYPTION_KEY', 'PROD_CRON_SECRET',
  'PROD_GITHUB_APP_ID', 'PROD_GITHUB_APP_SLUG', 'PROD_GITHUB_CLIENT_ID', 'PROD_GITHUB_CLIENT_SECRET',
  'PROD_GITHUB_WEBHOOK_SECRET', 'PROD_GITHUB_APP_PRIVATE_KEY_PATH',
  'VERCEL_TOKEN', 'VERCEL_SCOPE', 'VERCEL_PROJECT_NAME',
];
