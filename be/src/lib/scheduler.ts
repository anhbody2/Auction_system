import { startDueAuctions } from './jobs';
import { closeDueAuctions } from './settlement';

export const DEFAULT_JOB_INTERVAL_MS = 60 * 60 * 1000;

export type Job = { name: string; intervalMs: number; run: () => Promise<unknown> };

/** Interval for the auction jobs: AUCTION_JOB_INTERVAL_MS, else one hour. */
export function jobIntervalMs(env: NodeJS.ProcessEnv = process.env) {
  const v = Number(env.AUCTION_JOB_INTERVAL_MS);
  return Number.isFinite(v) && v > 0 ? v : DEFAULT_JOB_INTERVAL_MS;
}

export function auctionJobs(intervalMs = jobIntervalMs()): Job[] {
  return [
    { name: 'start-auctions', intervalMs, run: () => startDueAuctions() },
    { name: 'close-auctions', intervalMs, run: () => closeDueAuctions() },
  ];
}

/**
 * Runs each job once at startup, then every `intervalMs`. A run is skipped while the previous one
 * of the same job is still going. Returns a handle to stop all timers.
 */
export function startScheduler(jobs: Job[] = auctionJobs(), log: Pick<Console, 'error'> = console) {
  const timers = jobs.map((job) => {
    let running = false;
    const tick = async () => {
      if (running) return;
      running = true;
      try {
        await job.run();
      } catch (err) {
        log.error(`job ${job.name} failed`, err);
      } finally {
        running = false;
      }
    };
    void tick();
    return setInterval(tick, job.intervalMs);
  });
  return { jobs, stop: () => timers.forEach(clearInterval) };
}
