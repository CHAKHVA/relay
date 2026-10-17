#!/usr/bin/env node
// Generate apps/web/.env.local (dev) and apps/web/.env.test from .env.setup.
// Values are written to git-ignored files only; nothing is printed.
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadEnvSetup, readPem, ROOT } from './lib/env-setup.mjs';

const env = loadEnvSetup();
if (!env) {
  console.error('.env.setup not found');
  process.exit(1);
}
const pemLine = (p) => readPem(p).trim().replace(/\r?\n/g, '\\n');
const q = (v) => `"${String(v).replace(/"/g, '\\"')}"`;

function devValues({ testLogin }) {
  return {
    DATABASE_URL: env.DATABASE_URL,
    BETTER_AUTH_SECRET: env.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: env.APP_URL,
    APP_URL: env.APP_URL,
    GITHUB_CLIENT_ID: env.GITHUB_CLIENT_ID,
    GITHUB_CLIENT_SECRET: env.GITHUB_CLIENT_SECRET,
    GITHUB_APP_ID: env.GITHUB_APP_ID,
    GITHUB_APP_SLUG: env.GITHUB_APP_SLUG,
    GITHUB_APP_PRIVATE_KEY: pemLine(env.GITHUB_APP_PRIVATE_KEY_PATH),
    GITHUB_WEBHOOK_SECRET: env.GITHUB_WEBHOOK_SECRET,
    RELAY_ENCRYPTION_KEY: env.RELAY_ENCRYPTION_KEY,
    CRON_SECRET: env.CRON_SECRET,
    RELAY_ENABLE_TEST_LOGIN: testLogin ? '1' : '0',
    RELAY_DEMO_TEMPLATE_REPO: env.DEMO_TEMPLATE_REPO,
    SMEE_URL: env.SMEE_URL,
    TEST_REPO: env.TEST_REPO,
  };
}

function write(file, values) {
  const body = Object.entries(values).map(([k, v]) => `${k}=${q(v)}`).join('\n') + '\n';
  writeFileSync(resolve(ROOT, 'apps/web', file), `# Generated from .env.setup by scripts/gen-env.mjs — do not commit\n${body}`, { mode: 0o600 });
  console.log(`wrote apps/web/${file} (${Object.keys(values).length} vars)`);
}

write('.env.local', devValues({ testLogin: true }));
write('.env.test', devValues({ testLogin: true }));
