import { spawn, type ChildProcess } from 'node:child_process';
import { openSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import SmeeClient from 'smee-client';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { truncateAll } from '../helpers/db';
import { TEST_LABEL, TEST_NAME, TEST_OWNER, cleanSandbox, makeSandboxWorkspace, sandboxOctokit } from '../helpers/github';

/**
 * Webhook end-to-end (SPEC §22.1): GitHub → smee.io → smee-client → `next dev` → task row.
 * Needs the Relay Dev app's webhook URL to be SMEE_URL (done in SETUP.md).
 */
const PORT = 3100;
let server: ChildProcess | null = null;
let smee: SmeeClient | null = null;
let ctx: Awaited<ReturnType<typeof makeSandboxWorkspace>>;

async function waitFor<T>(fn: () => Promise<T | null | undefined | false>, ms = 45_000, step = 1000): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error('timed out waiting for condition');
    await new Promise((r) => setTimeout(r, step));
  }
}

beforeAll(async () => {
  await truncateAll();
  ctx = await makeSandboxWorkspace();
  server = spawn('pnpm', ['exec', 'next', 'dev', '--turbopack', '-p', String(PORT)], {
    cwd: new URL('../..', import.meta.url).pathname,
    env: { ...process.env, APP_URL: `http://localhost:${PORT}`, PORT: String(PORT) },
    stdio: ['ignore', openSync(process.env.WEBHOOK_E2E_LOG ?? '/dev/null', 'a'), openSync(process.env.WEBHOOK_E2E_LOG ?? '/dev/null', 'a')],
  });
  await waitFor(async () => fetch(`http://localhost:${PORT}/api/github/webhook`, { method: 'POST' }).then((r) => r.status === 401).catch(() => false), 120_000, 1500);
  smee = new SmeeClient({ source: process.env.SMEE_URL!, target: `http://localhost:${PORT}/api/github/webhook`, logger: { info() {}, error: console.error } });
  await smee.start();
}, 180_000);

afterAll(async () => {
  await smee?.stop();
  server?.kill('SIGTERM');
  await cleanSandbox(await sandboxOctokit());
});

describe('webhook end-to-end through smee', () => {
  it('rejects unsigned deliveries', async () => {
    const r = await fetch(`http://localhost:${PORT}/api/github/webhook`, { method: 'POST', body: '{}', headers: { 'x-github-event': 'ping' } });
    expect(r.status).toBe(401);
  });

  it('a new relay issue becomes a task within 30 s, then closing it cancels the task', async () => {
    const { data: issue } = await ctx.gh.rest.issues.create({
      owner: TEST_OWNER,
      repo: TEST_NAME,
      title: 'Webhook e2e',
      body: 'Write docs.\n\n<!-- relay\ntype: docs\n-->',
      labels: ['relay', TEST_LABEL],
    });
    const task = await waitFor(async () => {
      const [t] = await db().select().from(schema.tasks).where(eq(schema.tasks.issueNumber, issue.number));
      return t;
    }, 30_000);
    expect(task.workspaceId).toBe(ctx.wsId);
    expect(task.type).toBe('docs');
    await ctx.gh.rest.issues.update({ owner: TEST_OWNER, repo: TEST_NAME, issue_number: issue.number, state: 'closed' });
    await waitFor(async () => {
      const [t] = await db().select().from(schema.tasks).where(eq(schema.tasks.issueNumber, issue.number));
      return t?.status === 'cancelled';
    }, 30_000);
  });
});
