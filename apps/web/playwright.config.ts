import { config } from 'dotenv';
import { defineConfig, devices } from '@playwright/test';

config({ path: '.env.test', quiet: true });
process.env.RELAY_ENABLE_TEST_LOGIN = '1';
const PORT = 3200;
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: 'e2e',
  outputDir: 'test-artifacts/playwright',
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: { baseURL, trace: 'retain-on-failure' },
  webServer: {
    command: `pnpm exec next dev --turbopack -p ${PORT}`,
    url: `${baseURL}/api/health`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: { APP_URL: baseURL, RELAY_ENABLE_TEST_LOGIN: '1' },
    stdout: 'ignore',
  },
  projects: [
    { name: 'e2e', testMatch: /.*\.e2e\.ts/, use: { ...devices['Desktop Chrome'] } },
    { name: 'visual', testMatch: /.*\.visual\.ts/, use: { ...devices['Desktop Chrome'] } },
  ],
});
