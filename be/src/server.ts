import { createApp } from './app';
import { config } from './config';
import { startScheduler } from './lib/scheduler';

createApp().listen(config.port, () => {
  console.log(`API listening on http://localhost:${config.port}`);
});

const scheduler = startScheduler();
console.log(`Scheduler: ${scheduler.jobs.map((j) => `${j.name} every ${j.intervalMs / 1000}s`).join(', ')}`);

