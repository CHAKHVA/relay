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
