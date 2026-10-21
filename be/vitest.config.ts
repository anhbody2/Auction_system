import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    env: {
      DATABASE_URL: 'postgresql://auction:auction@localhost:5436/auction_test',
      JWT_SECRET: 'test-secret',
      NODE_ENV: 'test',
      // Keep tests on the in-memory outbox even when be/.env holds real Gmail/SMTP settings
      // (dotenv does not override keys that are already set).
      GMAIL_USER: '',
      GMAIL_CLIENT_ID: '',
      GMAIL_CLIENT_SECRET: '',
      GMAIL_REFRESH_TOKEN: '',
      SMTP_HOST: '',
    },
    fileParallelism: false,
    testTimeout: 20000,
  },
});
