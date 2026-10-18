import { expect, test } from '@playwright/test';
import { truncateAll } from '../test/helpers/db';
import { TEST_NAME, TEST_OWNER, sandboxOctokit } from '../test/helpers/github';
import { seedDemoBoard } from './seed';

/** UI-driven flows on a seeded demo board: new-task dialog (N shortcut), seat controls, task detail, settings. */
let wsId = '';
test.setTimeout(240_000);
test.beforeAll(async ({ request }) => {
  await truncateAll();
  await request.post('/api/test/login', { data: { githubLogin: TEST_OWNER, name: 'Giorgi' } });
  wsId = (await (await request.post('/api/workspaces', { data: { name: 'UI e2e', timezone: 'UTC' } })).json()).workspace.id;
  await seedDemoBoard(wsId);
  for (const p of [`/w/${wsId}`, `/w/${wsId}/me`, `/w/${wsId}/tasks/r3c7z`, `/w/${wsId}/settings`]) await request.get(p, { timeout: 120_000 });
});
test.afterAll(async () => {
  const gh = await sandboxOctokit();
  const issues = await gh.paginate(gh.rest.issues.listForRepo, { owner: TEST_OWNER, repo: TEST_NAME, labels: 'relay', state: 'open', per_page: 100 });
  for (const i of issues.filter((x) => x.title.startsWith('E2E UI task'))) await gh.rest.issues.update({ owner: TEST_OWNER, repo: TEST_NAME, issue_number: i.number, state: 'closed' });
});

test('board renders seats, queue, stats; N opens the new-task dialog and creates a GitHub issue', async ({ page, request }) => {
  await page.context().request.post('/api/test/login', { data: { githubLogin: TEST_OWNER, name: 'Giorgi' } });
  await page.goto(`/w/${wsId}`);
  await expect(page.getByRole('heading', { name: 'Queue' })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText('Simulated').first()).toBeVisible();
  await expect(page.getByText('DRY RUN', { exact: true })).toBeVisible();
  await expect(page.getByRole('article', { name: /Task r7f3a/ })).toContainText('Shared');
  await expect(page.getByRole('article', { name: /Task r5m1x/ })).toContainText('Blocked on src/auth.ts by r2k9d');
  await expect(page.getByText('$2.40')).toBeVisible();

  await page.keyboard.press('n');
  const dialog = page.getByRole('dialog', { name: 'New task' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Title').fill('E2E UI task');
  await dialog.getByRole('radio', { name: 'Docs' }).click();
  await expect(dialog.getByLabel('Done check')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Create task' }).click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });
  await expect(page.getByRole('article', { name: /E2E UI task/ })).toBeVisible({ timeout: 30_000 });
  void request;
});

test('seat controls: sharing + pause toggles persist; test window opens; detail page renders the result', async ({ page }) => {
  await page.context().request.post('/api/test/login', { data: { githubLogin: TEST_OWNER, name: 'Giorgi' } });
  await page.goto(`/w/${wsId}/me`);
  const pause = page.getByRole('switch', { name: 'Pause my seat' });
  await expect(pause).toHaveAttribute('aria-checked', 'false', { timeout: 60_000 });
  await pause.click();
  await expect(pause).toHaveAttribute('aria-checked', 'true');
  await page.reload();
  await expect(page.getByRole('switch', { name: 'Pause my seat' })).toHaveAttribute('aria-checked', 'true', { timeout: 60_000 });
  await page.getByRole('switch', { name: 'Pause my seat' }).click();
  await page.getByRole('button', { name: 'Open a 60-min window' }).click();
  await expect(page.getByRole('button', { name: 'Close window' })).toBeVisible();
  await page.getByRole('button', { name: 'Close window' }).click();

  await page.goto(`/w/${wsId}/tasks/r3c7z`);
  await expect(page.getByRole('heading', { name: /Compare 3 approaches/ })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText('Intl.NumberFormat').first()).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Hand-rolled' })).toBeVisible();
});

test('settings: demo tools, jump to next window moves the clock; non-owner pages 404', async ({ page, browser }) => {
  await page.context().request.post('/api/test/login', { data: { githubLogin: TEST_OWNER, name: 'Giorgi' } });
  await page.goto(`/w/${wsId}/settings`);
  await page.getByRole('button', { name: 'Jump to next window' }).click({ timeout: 60_000 });
  await expect(page.getByText(/Clock is/)).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Reset to real time' }).click();
  await expect(page.getByText('Skip ahead to the start')).toBeVisible();

  const other = await browser.newContext();
  await other.request.post('/api/test/login', { data: { githubLogin: 'nobody-else', name: 'Nobody' } });
  const p2 = await other.newPage();
  const res = await p2.goto(`/w/${wsId}`);
  expect(res?.status()).toBe(404);
  await other.close();
});

test('bell, ⌘K palette, recurring and digest pages', async ({ page }) => {
  const { db, schema } = await import('../lib/db');
  const { notify } = await import('../lib/engine/notify');
  const { eq } = await import('drizzle-orm');
  const { newId } = await import('../lib/ids');
  const [me] = await db().select().from(schema.members).where(eq(schema.members.workspaceId, wsId));
  await notify({ memberId: me!.id, kind: 'my_task_ready', title: 'Your task r3c7z is ready', body: 'Compare 3 approaches', url: `/w/${wsId}/tasks/r3c7z`, dedupeKey: 'e2e-ready' });
  await db().insert(schema.digests).values({ id: newId(), memberId: me!.id, date: '2026-06-02', markdown: '### Ran on your seat\n- **r7f3a** #1 Add unit tests', commentUrl: 'https://github.com/x/y/issues/1#c' }).onConflictDoNothing();

  await page.context().request.post('/api/test/login', { data: { githubLogin: TEST_OWNER, name: 'Giorgi' } });
  await page.goto(`/w/${wsId}`);
  const bell = page.getByRole('button', { name: /Notifications, \d+ unread/ });
  await expect(bell).toBeVisible({ timeout: 60_000 });
  await bell.click();
  await expect(page.getByText('Your task r3c7z is ready').first()).toBeVisible();
  await page.getByRole('button', { name: 'Mark all read' }).click();
  await expect(page.getByRole('button', { name: 'Notifications' })).toBeVisible();
  await page.keyboard.press('Escape');

  await page.keyboard.press('Control+k');
  const palette = page.getByRole('dialog', { name: 'Command palette' });
  await expect(palette).toBeVisible();
  await palette.getByPlaceholder('Type a command…').fill('pause');
  await palette.getByRole('option', { name: 'Pause my seat' }).click();
  await expect(page.getByText('Seat paused').first()).toBeVisible({ timeout: 15_000 });
  await page.keyboard.press('Control+k');
  await page.getByPlaceholder('Type a command…').fill('resume');
  await page.getByRole('option', { name: 'Resume my seat' }).click();
  await page.keyboard.press('Control+k');
  await page.getByPlaceholder('Type a command…').fill('new task');
  await page.getByRole('option', { name: /New task/ }).click();
  await expect(page.getByRole('dialog', { name: 'New task' })).toBeVisible();
  await page.keyboard.press('Escape');

  await page.goto(`/w/${wsId}/recurring`);
  await expect(page.getByRole('heading', { name: 'Recurring tasks' })).toBeVisible({ timeout: 60_000 });
  await page.getByRole('button', { name: 'New recurring task' }).first().click();
  await page.getByLabel('Title').fill('E2E weekly audit');
  await page.getByRole('button', { name: 'Save recurring task' }).click();
  await expect(page.getByText('E2E weekly audit')).toBeVisible({ timeout: 15_000 });
  const row = page.getByRole('listitem').filter({ hasText: 'E2E weekly audit' });
  await row.getByRole('button', { name: 'Pause' }).click();
  await expect(row.getByText('Paused')).toBeVisible();

  await page.goto(`/w/${wsId}/digest`);
  await expect(page.getByRole('heading', { name: 'Digest' })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText('Ran on your seat')).toBeVisible();
});
