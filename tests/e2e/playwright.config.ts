import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './',
  outputDir: './test-results',
  fullyParallel: true,
  reporter: [['html', { outputFolder: './playwright-report' }]],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
  },
  expect: {
    timeout: 10_000, // wait up to 10 seconds on every "except" assertion by default
  },

  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
