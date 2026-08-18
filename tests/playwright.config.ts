import { defineConfig, devices } from '@playwright/test';

const componentsProjectUseParams = {
  baseURL: 'http://localhost:5173/playwright/gallery/index.html',
  serviceWorkers: 'block' as const,
  reuseContext: true,
};

export default defineConfig({
  testDir: './',
  testMatch: ['**/*.spec.ts', '**/*.mobile.spec.ts'],
  outputDir: './test-results',
  fullyParallel: true,
  reporter: [['html', { outputFolder: './playwright-report' }]],

  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },

  projects: [
    {
      name: 'e2e',
      testDir: './e2e',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://localhost:5173',
        trace: 'retain-on-failure',
      },
    },
    {
      name: 'components',
      testDir: './components',
      testMatch: '**/*.desktop.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        ...componentsProjectUseParams,
      },
    },
    {
      name: 'components',
      testDir: './components',
      testMatch: '**/*.mobile.spec.ts',
      use: {
        ...devices['Pixel 7'],
        ...componentsProjectUseParams,
      },
    },
  ],
});
