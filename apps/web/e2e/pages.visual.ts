import { mkdirSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { truncateAll } from '../test/helpers/db';
import { TEST_OWNER } from '../test/helpers/github';
import { seedDemoBoard } from './seed';

const OUT = process.env.SHOTS_DIR ?? 'test-artifacts/screens/m11';
const VIEWPORTS = [
  { name: '1440', width: 1440, height: 900 },
  { name: '768', width: 768, height: 1024 },
];
const SCHEMES = ['light', 'dark'] as const;

let wsId = '';
test.setTimeout(240_000);
test.beforeAll(async ({ request }) => {
  test.setTimeout(600_000);
  // Fixture `request` is per-worker; seeding only needs the DB and one signed-in call.
  mkdirSync(OUT, { recursive: true });
  await truncateAll();
  await request.post('/api/test/login', { data: { githubLogin: TEST_OWNER, name: 'Giorgi' } });
  const created = await (await request.post('/api/workspaces', { data: { name: 'Payments team', timezone: 'Asia/Tbilisi' } })).json();
  wsId = created.workspace.id;
  await seedDemoBoard(wsId);
  // Warm up: compile every route once so screenshots aren't racing the dev compiler.
  for (const path of ['/', '/guide', '/privacy', '/onboarding', `/w/${wsId}`, `/w/${wsId}/tasks/r3c7z`, `/w/${wsId}/team`, `/w/${wsId}/me`, `/w/${wsId}/settings`, `/w/${wsId}/start`]) {
    await request.get(path, { timeout: 120_000 });
  }
});

for (const vp of VIEWPORTS) {
  for (const scheme of SCHEMES) {
    test(`signed-in pages ${vp.name} ${scheme}`, async ({ browser }) => {
      const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, colorScheme: scheme });
      await ctx.request.post('/api/test/login', { data: { githubLogin: TEST_OWNER, name: 'Giorgi' } });
      const page = await ctx.newPage();
      const pages: [string, string][] = [
        ['board', `/w/${wsId}`],
        ['task', `/w/${wsId}/tasks/r3c7z`],
        ['team', `/w/${wsId}/team`],
        ['me', `/w/${wsId}/me`],
        ['settings', `/w/${wsId}/settings`],
        ['start', `/w/${wsId}/start`],
        ['onboarding', '/onboarding'],
      ];
      for (const [name, path] of pages) {
        await page.goto(path, { waitUntil: 'domcontentloaded' });
        await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 60_000 });
        await expect(page.getByText('Loading')).toHaveCount(0, { timeout: 30_000 });
        await page.waitForTimeout(700);
        await page.screenshot({ path: `${OUT}/${name}-${vp.name}-${scheme}.png`, fullPage: true });
      }
      await ctx.close();
    });

    test(`public pages ${vp.name} ${scheme}`, async ({ browser }) => {
      const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, colorScheme: scheme });
      const page = await ctx.newPage();
      for (const [name, path] of [['landing', '/'], ['guide', '/guide'], ['privacy', '/privacy']] as const) {
        await page.goto(path, { waitUntil: 'domcontentloaded' });
        await expect(page.locator('h1').first()).toBeVisible({ timeout: 60_000 });
        await page.waitForTimeout(1200);
        await page.screenshot({ path: `${OUT}/${name}-${vp.name}-${scheme}.png`, fullPage: true });
      }
      await ctx.close();
    });
  }
}
