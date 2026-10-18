import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { app, insertAuction, loginAs, resetDb } from './helpers';

describe('stf-003 per-day chart data', () => {
  let staff: request.Agent;

  beforeAll(async () => {
    await resetDb();
    await insertAuction({ seller: 'alice', name: 'Sold lamp', start: '2025-03-01T10:00:00Z', end: '2025-03-02T10:00:00Z', sold: { winner: 'bob', price: 150, commission: 7.5 } });
    await insertAuction({ seller: 'alice', name: 'Sold chair', start: '2025-03-01T12:00:00Z', end: '2025-03-02T12:00:00Z', sold: { winner: 'carol', price: 60, commission: 6 } });
    await insertAuction({ seller: 'bob', name: 'Unsold vase', start: '2025-03-03T08:00:00Z', end: '2025-03-04T08:00:00Z', status: 'ended' });
    await insertAuction({ seller: 'bob', name: 'Cancelled clock', start: '2025-03-03T23:30:00Z', end: '2025-03-05T09:00:00Z', status: 'cancelled' });
    staff = await loginAs('staff');
  });

  it('returns every day in the range with counts by status and sale value', async () => {
    const res = await staff.get('/api/staff/auctions/summary?from=2025-03-01&to=2025-03-04');
    expect(res.status).toBe(200);
    expect(res.body.days).toEqual([
      { date: '2025-03-01', upcoming: 0, active: 0, ended: 2, cancelled: 0, total: 2, saleValue: 210 },
      { date: '2025-03-02', upcoming: 0, active: 0, ended: 0, cancelled: 0, total: 0, saleValue: 0 },
      { date: '2025-03-03', upcoming: 0, active: 0, ended: 1, cancelled: 1, total: 2, saleValue: 0 },
      { date: '2025-03-04', upcoming: 0, active: 0, ended: 0, cancelled: 0, total: 0, saleValue: 0 },
    ]);
  });

  it('per-day counts add up to the list total, for each status filter', async () => {
    for (const status of ['all', 'ended', 'cancelled', 'active']) {
      const qs = `from=2025-03-01&to=2025-03-31&status=${status}`;
      const [summary, list] = await Promise.all([staff.get(`/api/staff/auctions/summary?${qs}`), staff.get(`/api/staff/auctions?${qs}`)]);
      const sum = summary.body.days.reduce((s: number, d: { total: number }) => s + d.total, 0);
      expect(sum).toBe(list.body.summary.count);
      const value = summary.body.days.reduce((s: number, d: { saleValue: number }) => s + d.saleValue, 0);
      expect(value).toBe(list.body.summary.totalFinalPrice);
    }
  });

  it('buckets by the client local day', async () => {
    // UTC+7: the 23:30Z cancelled clock starts on 2025-03-04 local time
    const res = await staff.get('/api/staff/auctions/summary?from=2025-03-03&to=2025-03-04&tz=-420');
    expect(res.body.days.map((d: { date: string; total: number }) => [d.date, d.total])).toEqual([
      ['2025-03-03', 1],
      ['2025-03-04', 1],
    ]);
  });

  it('validates the filter and caps the range at 366 days', async () => {
    expect((await staff.get('/api/staff/auctions/summary?from=2025-03-05&to=2025-03-01')).status).toBe(400);
    const long = await staff.get('/api/staff/auctions/summary?from=2024-01-01&to=2025-03-01');
    expect(long.status).toBe(400);
    expect(long.body.error).toBe('Charts cover at most 366 days');
    expect((await staff.get('/api/staff/auctions/summary?from=2024-03-01&to=2025-03-01')).status).toBe(200);
  });

  it('needs report.view', async () => {
    const qs = 'from=2025-03-01&to=2025-03-02';
    expect((await request(app).get(`/api/staff/auctions/summary?${qs}`)).status).toBe(401);
    expect((await (await loginAs('alice')).get(`/api/staff/auctions/summary?${qs}`)).status).toBe(403);
  });
});
