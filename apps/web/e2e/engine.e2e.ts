import { expect, test, type APIRequestContext } from '@playwright/test';
import { eq } from 'drizzle-orm';
import { db, schema } from '../lib/db';
import { truncateAll } from '../test/helpers/db';
import { TEST_LABEL, TEST_OWNER, cleanSandbox, sandboxInstallationId, sandboxOctokit, TEST_NAME } from '../test/helpers/github';

/**
 * Browser-level end-to-end against `next dev` (test login on, DRY RUN workspace, real sandbox repo).
 * Drives the product through its HTTP API with a signed-in browser context, then loads real pages.
 */
const FIRE = 'https://api.anthropic.com/v1/claude_code/routines/trig_E2EE2EE2E2E/fire';

async function login(req: APIRequestContext, githubLogin: string, name: string) {
  const r = await req.post('/api/test/login', { data: { githubLogin, name } });
  expect(r.ok()).toBeTruthy();
}

test.beforeAll(async () => {
  await truncateAll();
  await cleanSandbox(await sandboxOctokit());
});
test.afterAll(async () => cleanSandbox(await sandboxOctokit()));

test('settings → routine → task → run now → done, with workspace isolation', async ({ browser, page, request }) => {
  await login(request, TEST_OWNER, 'Owner');
  const created = await (await request.post('/api/workspaces', { data: { name: 'E2E', timezone: 'UTC' } })).json();
  const wsId = created.workspace.id as string;
  await db()
    .update(schema.workspaces)
    .set({ githubInstallationId: await sandboxInstallationId(), repoOwner: TEST_OWNER, repoName: TEST_NAME, defaultBranch: 'main', dryRun: true })
    .where(eq(schema.workspaces.id, wsId));

  // Settings persist
  const patched = await request.patch(`/api/w/${wsId}/me`, { data: { offHoursStart: '03:00', offHoursEnd: '03:01', reservePct: 10, sharingEnabled: true } });
  expect(patched.ok()).toBeTruthy();
  const routine = await request.put(`/api/w/${wsId}/me/routine`, { data: { fireUrl: FIRE, token: 'fake-e2e-routine-token' } });
  expect(JSON.stringify(await routine.json())).not.toContain('fake-e2e-routine-token');
  const me = (await (await request.get(`/api/w/${wsId}/me`)).json()).member;
  expect(me).toMatchObject({ routineConfigured: true, routineHint: 'trig_…E2E', offHoursStart: '03:00', sharingEnabled: true });

  // Create a task: it opens a GitHub issue and appears in board state
  const t = await request.post(`/api/w/${wsId}/tasks`, {
    data: { type: 'docs', title: 'E2E docs task', description: 'Write something', extraLabels: [TEST_LABEL] },
  });
  expect(t.status()).toBe(201);
  const task = (await t.json()).task;
  expect(task.issueUrl).toContain('/issues/');

  const state = async () => (await (await request.get(`/api/w/${wsId}/state`)).json());
  let s = await state();
  expect(s.workspace.dryRun).toBe(true);
  expect(s.tasks.find((x: { id: string }) => x.id === task.id)).toBeTruthy();

  // Outside any window (03:00–03:01 UTC) unless the suite happens to run then: it waits or already runs.
  const run = await request.post(`/api/w/${wsId}/tasks/${task.id}/run-now`);
  expect([200, 409]).toContain(run.status());
  await expect.poll(async () => (await state()).tasks.find((x: { id: string }) => x.id === task.id)?.status, { timeout: 30_000 }).toBe('dispatched');

  // Dry run completes after 20 s; the owner tick reconciles it.
  await expect
    .poll(
      async () => {
        await request.post(`/api/w/${wsId}/tick`);
        return (await state()).tasks.find((x: { id: string }) => x.id === task.id)?.status;
      },
      { timeout: 90_000, intervals: [3000] },
    )
    .toBe('done');
  s = await state();
  expect(s.stats.tasksManual).toBeGreaterThanOrEqual(1);
  expect(s.events.map((e: { kind: string }) => e.kind)).toEqual(expect.arrayContaining(['task_created', 'task_dispatched', 'task_done']));

  // Real pages load for the signed-in owner
  await page.context().addCookies(await request.storageState().then((st) => st.cookies));
  const res = await page.goto(`/w/${wsId}/team`);
  expect(res?.status()).toBe(200);
  await expect(page.getByText('Owner').first()).toBeVisible();

  // Workspace isolation: another user gets 404 everywhere and cannot tick, read state, or act on tasks
  const other = await browser.newContext();
  await login(other.request, 'someone-else', 'Someone Else');
  for (const [method, path] of [
    ['get', `/api/w/${wsId}/state`],
    ['get', `/api/w/${wsId}/me`],
    ['post', `/api/w/${wsId}/tick`],
    ['post', `/api/w/${wsId}/tasks/${task.id}/cancel`],
    ['post', `/api/w/${wsId}/tasks`],
  ] as const) {
    const r = await other.request[method](path, method === 'post' ? { data: { type: 'docs', title: 'x' } } : undefined);
    expect(r.status(), `${method} ${path}`).toBe(404);
  }
  expect((await other.request.get('/api/cron/tick')).status()).toBe(401);
  await other.close();
});
