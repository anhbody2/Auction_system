import { defineConfig } from '@playwright/test';

const E2E_DB = 'postgresql://auction:auction@localhost:5433/auction_e2e';

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5180',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      command: 'npx tsx be/src/server.ts',
      url: 'http://localhost:4100/api/health',
      reuseExistingServer: false,
      env: {
        DATABASE_URL: E2E_DB,
        PORT: '4100',
        APP_URL: 'http://localhost:5180',
        JWT_SECRET: 'e2e-secret',
        NODE_ENV: 'e2e',
        AUCTION_JOB_INTERVAL_MS: '1000',
      },
    },
    {
      command: 'npm run dev -w fe',
      url: 'http://localhost:5180',
      reuseExistingServer: false,
      env: { FE_PORT: '5180', API_URL: 'http://localhost:4100' },
    },
  ],
});
