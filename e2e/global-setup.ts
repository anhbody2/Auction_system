import { execSync } from 'node:child_process';

// Fresh, seeded e2e database for every run.
export default function globalSetup() {
  execSync('npx prisma migrate reset --force --skip-generate', {
    cwd: 'be',
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: 'postgresql://auction:auction@localhost:5433/auction_e2e' },
  });
}
