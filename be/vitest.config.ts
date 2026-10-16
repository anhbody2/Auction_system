import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    env: {
      DATABASE_URL: 'postgresql://auction:auction@localhost:5433/auction_test',
      JWT_SECRET: 'test-secret',
      NODE_ENV: 'test',
    },
    fileParallelism: false,
    testTimeout: 20000,
  },
});
