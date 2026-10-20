import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../src/db';
import { startDueAuctions } from '../src/lib/jobs';
import { auctionJobs, DEFAULT_JOB_INTERVAL_MS, jobIntervalMs, startScheduler } from '../src/lib/scheduler';
import { createAuction, inMinutes, loginAs, resetDb } from './helpers';

const status = async (id: number) => (await prisma.auction.findUniqueOrThrow({ where: { id: BigInt(id) } })).status;
const setAuction = (id: number, data: { status?: string; startTime?: Date }) => prisma.auction.update({ where: { id: BigInt(id) }, data });
const upcoming = { startTime: inMinutes(5), duration: { value: 1, unit: 'hours' } };

describe('sys-001 start auction job', () => {
  beforeEach(resetDb);

  it('activates upcoming auctions whose start time has arrived and leaves the rest alone', async () => {
    const alice = await loginAs('alice');
    const due = await createAuction(alice, upcoming);
    const future = await createAuction(alice, upcoming);
    const cancelled = await createAuction(alice, upcoming);
    const ended = await createAuction(alice, upcoming);
    const past = new Date(Date.now() - 1000);
    await setAuction(due.id, { startTime: past });
    await setAuction(cancelled.id, { status: 'cancelled', startTime: past });
    await setAuction(ended.id, { status: 'ended', startTime: past });
    expect(await status(due.id)).toBe('upcoming');

    expect(await startDueAuctions()).toBe(1);
    expect(await status(due.id)).toBe('active');
    expect(await status(future.id)).toBe('upcoming');
    expect(await status(cancelled.id)).toBe('cancelled');
    expect(await status(ended.id)).toBe('ended');
  });

  it('activates an auction whose start time equals now', async () => {
    const alice = await loginAs('alice');
    const a = await createAuction(alice, upcoming);
    const now = new Date();
    await setAuction(a.id, { startTime: now });
    expect(await startDueAuctions(now)).toBe(1);
    expect(await status(a.id)).toBe('active');
  });

  it('a second run in a row changes nothing', async () => {
    const alice = await loginAs('alice');
    const a = await createAuction(alice, upcoming);
    await setAuction(a.id, { startTime: new Date(Date.now() - 1000) });
    expect(await startDueAuctions()).toBe(1);
    const before = await prisma.auction.findUniqueOrThrow({ where: { id: BigInt(a.id) } });
    expect(await startDueAuctions()).toBe(0);
    expect(await prisma.auction.findUniqueOrThrow({ where: { id: BigInt(a.id) } })).toEqual(before);
  });
});

describe('sys-001 scheduler', () => {
  afterEach(() => vi.useRealTimers());

  it('defaults to one hour and reads AUCTION_JOB_INTERVAL_MS', () => {
    expect(DEFAULT_JOB_INTERVAL_MS).toBe(3_600_000);
    expect(jobIntervalMs({})).toBe(3_600_000);
    expect(jobIntervalMs({ AUCTION_JOB_INTERVAL_MS: '1000' })).toBe(1000);
    expect(jobIntervalMs({ AUCTION_JOB_INTERVAL_MS: 'nope' })).toBe(3_600_000);
  });

  it('registers the start job and runs it at startup and on every interval', async () => {
    expect(auctionJobs().map((j) => [j.name, j.intervalMs])).toContainEqual(['start-auctions', 3_600_000]);

    vi.useFakeTimers();
    const run = vi.fn().mockResolvedValue(0);
    const s = startScheduler([{ name: 'start-auctions', intervalMs: 3_600_000, run }]);
    expect(run).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(3_599_999);
    expect(run).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(run).toHaveBeenCalledTimes(2);
    s.stop();
    await vi.advanceTimersByTimeAsync(3_600_000);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('a failing job is logged and keeps running on later ticks', async () => {
    vi.useFakeTimers();
    const run = vi.fn().mockRejectedValue(new Error('boom'));
    const log = { error: vi.fn() };
    const s = startScheduler([{ name: 'x', intervalMs: 1000, run }], log);
    await vi.advanceTimersByTimeAsync(1000);
    expect(run).toHaveBeenCalledTimes(2);
    expect(log.error).toHaveBeenCalledWith('job x failed', expect.any(Error));
    s.stop();
  });
});
