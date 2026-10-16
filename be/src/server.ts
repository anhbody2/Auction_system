import { createApp } from './app';
import { config } from './config';
import { closeDueAuctions } from './lib/settlement';
import { startScheduler } from './lib/scheduler';

createApp().listen(config.port, () => {
  console.log(`API listening on http://localhost:${config.port}`);
});

const scheduler = startScheduler();
console.log(`Scheduler: ${scheduler.jobs.map((j) => `${j.name} every ${j.intervalMs / 1000}s`).join(', ')}`);

// Background closer so auctions settle even when nobody is browsing.
setInterval(() => {
  closeDueAuctions().catch((err) => console.error('closeDueAuctions failed', err));
}, 5000);
