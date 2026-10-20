import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db';
import { DURATION_MESSAGE, durationToMinutes } from '../src/lib/duration';
import { createGoodsFor, inMinutes, loginAs, resetDb } from './helpers';

describe('sell-004 durationToMinutes', () => {
  it('turns hours and days into minutes, from 1 hour to 30 days', () => {
    expect(durationToMinutes({ value: 1, unit: 'hours' })).toBe(60);
    expect(durationToMinutes({ value: 48, unit: 'hours' })).toBe(2880);
    expect(durationToMinutes({ value: 2, unit: 'days' })).toBe(2880);
    expect(durationToMinutes({ value: 30, unit: 'days' })).toBe(43200);
    expect(durationToMinutes({ value: 720, unit: 'hours' })).toBe(43200);
  });

  it('rejects 0, under 1 hour, over 30 days and fractions', () => {
    expect(durationToMinutes({ value: 0, unit: 'hours' })).toBeNull();
    expect(durationToMinutes({ value: 59 / 60, unit: 'hours' })).toBeNull(); // 59 minutes
    expect(durationToMinutes({ value: 31, unit: 'days' })).toBeNull();
    expect(durationToMinutes({ value: 721, unit: 'hours' })).toBeNull();
    expect(durationToMinutes({ value: -1, unit: 'days' })).toBeNull();
    expect(durationToMinutes({ value: 1.5, unit: 'days' })).toBeNull();
  });
});

describe('sell-004 POST /api/auctions with start time and duration', () => {
  beforeEach(resetDb);

  const send = async (extra: Record<string, unknown>) => {
    const alice = await loginAs('alice');
    const goods = await createGoodsFor(alice, { name: 'Duration lamp' });
    return alice.post('/api/auctions').send({
      goodsId: Number(goods.id),
      name: 'Duration lamp',
      description: 'An auction with a picked duration.',
      initialPrice: 20,
      ...extra,
    });
  };

  it('stores end_time = start_time + duration and duration_minutes', async () => {
    const start = new Date(Date.now() + 3 * 3600_000);
    start.setSeconds(0, 0);
    const res = await send({ startTime: start.toISOString(), duration: { value: 2, unit: 'days' } });
    expect(res.status).toBe(201);
    const row = await prisma.auction.findUniqueOrThrow({ where: { id: BigInt(res.body.auction.id) } });
    expect(row.startTime.toISOString()).toBe(start.toISOString());
    expect(row.endTime.getTime() - row.startTime.getTime()).toBe(48 * 3600_000);
    expect(row.durationMinutes).toBe(2880);
    expect(res.body.auction).toMatchObject({ status: 'upcoming', durationMinutes: 2880, endTime: new Date(start.getTime() + 48 * 3600_000).toISOString() });
  });

  it('a start time a moment ago starts now and the end follows from now', async () => {
    const res = await send({ startTime: inMinutes(-1), duration: { value: 3, unit: 'hours' } });
    expect(res.status).toBe(201);
    const row = await prisma.auction.findUniqueOrThrow({ where: { id: BigInt(res.body.auction.id) } });
    expect(row.status).toBe('active');
    expect(row.endTime.getTime() - row.startTime.getTime()).toBe(3 * 3600_000);
    expect(Math.abs(row.startTime.getTime() - Date.now())).toBeLessThan(10_000);
  });

  it('rejects 0 hours, 31 days, 721 hours, a bad unit, a missing duration and a client endTime', async () => {
    for (const duration of [{ value: 0, unit: 'hours' }, { value: 31, unit: 'days' }, { value: 721, unit: 'hours' }, { value: 'abc', unit: 'days' }]) {
      const res = await send({ startTime: inMinutes(0), duration });
      expect(res.status).toBe(400);
      expect(res.body.fields.duration).toBe(DURATION_MESSAGE);
    }
    expect((await send({ startTime: inMinutes(0), duration: { value: 2, unit: 'weeks' } })).body.fields.duration).toBe('Choose hours or days');
    expect((await send({ startTime: inMinutes(0) })).body.fields.duration).toBe('Choose a duration');
    const withEnd = await send({ startTime: inMinutes(0), duration: { value: 1, unit: 'hours' }, endTime: inMinutes(600) });
    expect(withEnd.status).toBe(400);
    expect(withEnd.body.fields.endTime).toBe('The end time is worked out from the duration');
    expect(await prisma.auction.count()).toBe(0);
  });
});
