import { defineConfig, devices } from '@playwright/test';

/**
 * E2E smoke configuration.
 *
 * Tests run against the production build served by `astro preview` (build first,
 * then `npm run test:e2e`). Locally we point Playwright at the pre-installed
 * Chromium via PW_CHROMIUM_PATH so no browser download is needed; CI installs
 * its own browser with `npx playwright install`.
 */
const executablePath = process.env.PW_CHROMIUM_PATH || undefined;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'line' : 'list',
  timeout: 30_000,
  use: {
    baseURL: 'http://localhost:4399',
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
  },
  webServer: {
    command: 'npm run preview -- --port 4399',
    url: 'http://localhost:4399',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
