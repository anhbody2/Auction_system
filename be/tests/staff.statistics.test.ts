import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { app, insertAuction, loginAs, resetDb } from './helpers';

// Fixed past dates (UTC). All of these have ended or been cancelled except the far-future one.
async function seedStats() {
  await insertAuction({ seller: 'alice', name: 'Sold lamp', start: '2025-03-01T10:00:00Z', end: '2025-03-02T10:00:00Z', initialPrice: 50, sold: { winner: 'bob', price: 150, commission: 7.5 } });
  await insertAuction({ seller: 'alice', name: 'Sold chair', start: '2025-03-03T23:30:00Z', end: '2025-03-04T10:00:00Z', initialPrice: 20, sold: { winner: 'carol', price: 60, commission: 6 } });
  await insertAuction({ seller: 'bob', name: 'Unsold vase', start: '2025-03-02T08:00:00Z', end: '2025-03-03T08:00:00Z', initialPrice: 80, status: 'ended' });
  await insertAuction({ seller: 'bob', name: 'Cancelled clock', start: '2025-03-02T09:00:00Z', end: '2025-03-05T09:00:00Z', initialPrice: 40, status: 'cancelled' });
  await insertAuction({ seller: 'carol', name: 'April item', start: '2025-04-01T09:00:00Z', end: '2025-04-02T09:00:00Z', initialPrice: 10, status: 'ended' });
  await insertAuction({ seller: 'carol', name: 'Future item', start: '2099-01-01T09:00:00Z', end: '2099-01-02T09:00:00Z', initialPrice: 30 });
}

const names = (body: { auctions: { title: string }[] }) => body.auctions.map((a) => a.title);

describe('stf-001 filter and list auctions for statistics', () => {
  let staff: request.Agent;

  beforeAll(async () => {
    await resetDb();
    await seedStats();
    staff = await loginAs('staff');
  });

  it('lists every auction starting in the range with all columns and totals', async () => {
    const res = await staff.get('/api/staff/auctions?from=2025-03-01&to=2025-03-31&status=all');
    expect(res.status).toBe(200);
    expect(names(res.body)).toEqual(['Sold lamp', 'Unsold vase', 'Cancelled clock', 'Sold chair']);
    expect(res.body.auctions[0]).toMatchObject({
      title: 'Sold lamp',
      seller: 'alice',
      status: 'ended',
      startingPrice: 50,
      finalPrice: 150,
      winner: 'bob',
      commission: 7.5,
      startTime: '2025-03-01T10:00:00.000Z',
      endTime: '2025-03-02T10:00:00.000Z',
    });
    expect(res.body.auctions[1]).toMatchObject({ status: 'ended', finalPrice: null, winner: null, commission: null });
    expect(res.body.summary).toEqual({ count: 4, totalStartingPrice: 190, totalFinalPrice: 210, totalCommission: 13.5 });
  });

  it('filters by effective status; totals match the rows', async () => {
    const ended = await staff.get('/api/staff/auctions?from=2025-03-01&to=2025-03-31&status=ended');
    expect(names(ended.body)).toEqual(['Sold lamp', 'Unsold vase', 'Sold chair']);
    expect(ended.body.summary.count).toBe(3);
    const cancelled = await staff.get('/api/staff/auctions?from=2025-03-01&to=2025-03-31&status=cancelled');
    expect(names(cancelled.body)).toEqual(['Cancelled clock']);
    const upcoming = await staff.get('/api/staff/auctions?from=2099-01-01&to=2099-01-01&status=upcoming');
    expect(names(upcoming.body)).toEqual(['Future item']);
    expect((await staff.get('/api/staff/auctions?from=2025-03-01&to=2025-03-31&status=active')).body.summary.count).toBe(0);
  });

  it('is inclusive of both days (start time) and respects the client time zone', async () => {
    expect(names((await staff.get('/api/staff/auctions?from=2025-03-01&to=2025-03-01')).body)).toEqual(['Sold lamp']);
    expect(names((await staff.get('/api/staff/auctions?from=2025-03-03&to=2025-03-03')).body)).toEqual(['Sold chair']);
    // In UTC+7 (tz=-420) the chair starts on 2025-03-04 local time
    expect(names((await staff.get('/api/staff/auctions?from=2025-03-03&to=2025-03-03&tz=-420')).body)).toEqual([]);
    expect(names((await staff.get('/api/staff/auctions?from=2025-03-04&to=2025-03-04&tz=-420')).body)).toEqual(['Sold chair']);
  });

  it('rejects from after to, invalid dates and invalid status with 400', async () => {
    const reversed = await staff.get('/api/staff/auctions?from=2025-03-10&to=2025-03-01');
    expect(reversed.status).toBe(400);
    expect(reversed.body.fields.from).toBe('From date must be on or before To date');
    const badDate = await staff.get('/api/staff/auctions?from=2025-02-30&to=2025-03-01');
    expect(badDate.status).toBe(400);
    expect(badDate.body.fields.from).toBe('From date is not a valid date');
    expect((await staff.get('/api/staff/auctions?from=03/01/2025&to=2025-03-01')).status).toBe(400);
    expect((await staff.get('/api/staff/auctions?to=2025-03-01')).body.fields.from).toBe('From date is required');
    const badStatus = await staff.get('/api/staff/auctions?from=2025-03-01&to=2025-03-02&status=sold');
    expect(badStatus.status).toBe(400);
    expect(badStatus.body.fields.status).toMatch(/Status must be one of/);
  });

  it('requires report.view: 401 anonymous, 403 customer and admin, 200 staff', async () => {
    const url = '/api/staff/auctions?from=2025-03-01&to=2025-03-31';
    expect((await request(app).get(url)).status).toBe(401);
    expect((await (await loginAs('alice')).get(url)).status).toBe(403);
    expect((await (await loginAs('admin')).get(url)).status).toBe(403);
    expect((await staff.get(url)).status).toBe(200);
  });
});
