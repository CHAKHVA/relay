import { expect, test } from '@playwright/test';

/** Production smoke (RELAY_PROD_URL): public pages render and sign-in leaves for GitHub. */
test('landing renders and sign-in goes to GitHub', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('AI limits');
  await page.getByRole('link', { name: 'Guide' }).first().click();
  await expect(page.getByRole('heading', { name: 'Try Relay on your own project' })).toBeVisible();
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign in with GitHub' }).first().click();
  await page.waitForURL(/github\.com\/(login|login\/oauth)/, { timeout: 30_000 });
});
