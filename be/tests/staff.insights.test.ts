import ExcelJS from 'exceljs';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/db';
import { app, insertAuction, loginAs, registerUser, resetDb } from './helpers';

const sale = (seller: string, winner: string, price: number, commission: number, day: string) =>
  insertAuction({
    seller,
    name: `${seller} to ${winner} ${price}`,
    start: `${day}T08:00:00Z`,
    end: `${day}T20:00:00Z`,
    sold: { winner, price, commission },
  });

describe('stf-004 revenue and customer statistics', () => {
  let staff: request.Agent;

  beforeAll(async () => {
    await resetDb();
    await sale('alice', 'bob', 150, 7.5, '2025-03-01');
    await sale('alice', 'carol', 60, 6, '2025-03-02');
    await sale('bob', 'carol', 1000, 20, '2025-03-03');
    await sale('carol', 'alice', 40, 4, '2025-04-10'); // outside March
    await insertAuction({ seller: 'bob', name: 'Unsold', start: '2025-03-04T08:00:00Z', end: '2025-03-05T08:00:00Z', status: 'ended' });
    // two customers registered in March, one staff (not counted)
    for (const u of ['marchnew1', 'marchnew2']) await registerUser(u);
    await prisma.user.updateMany({ where: { username: { in: ['marchnew1', 'marchnew2', 'staff'] } }, data: { createdAt: new Date('2025-03-15T10:00:00Z') } });
    staff = await loginAs('staff');
  });

  it('revenue equals the sum of commission on settlements in the range', async () => {
    const res = await staff.get('/api/staff/revenue?from=2025-03-01&to=2025-03-31');
    expect(res.status).toBe(200);
    const settlements = await prisma.auctionSettlement.aggregate({
      _sum: { commissionAmount: true },
      where: { settlementStatus: 'settled', settledAt: { gte: new Date('2025-03-01T00:00:00Z'), lt: new Date('2025-04-01T00:00:00Z') } },
    });
    expect(res.body.revenue.totalCommission).toBe(settlements._sum.commissionAmount!.toNumber());
    expect(res.body.revenue).toEqual({ totalCommission: 33.5, totalSales: 1210, settledCount: 3 });
    expect((await staff.get('/api/staff/revenue?from=2025-04-01&to=2025-04-30')).body.revenue.totalCommission).toBe(4);
  });

  it('customer figures: registrations, active bidders and sellers, top 5 by value', async () => {
    const res = await staff.get('/api/staff/customers?from=2025-03-01&to=2025-03-31');
    expect(res.status).toBe(200);
    expect(res.body.customers).toEqual({
      registrations: 2,
      activeBidders: 2, // bob, carol
      activeSellers: 2, // alice, bob
      topSellers: [
        { username: 'bob', value: 1000, count: 1 },
        { username: 'alice', value: 210, count: 2 },
      ],
      topBidders: [
        { username: 'carol', value: 1060, count: 2 },
        { username: 'bob', value: 150, count: 1 },
      ],
    });
  });

  it('top lists hold at most 5 entries', async () => {
    for (let i = 0; i < 6; i++) {
      await registerUser(`seller${i}`);
      await sale(`seller${i}`, 'bob', 10 + i, 1, '2025-05-01');
    }
    const res = await staff.get('/api/staff/customers?from=2025-05-01&to=2025-05-01');
    expect(res.body.customers.topSellers.map((s: { username: string }) => s.username)).toEqual(['seller5', 'seller4', 'seller3', 'seller2', 'seller1']);
  });

  it('the Excel export carries a second sheet with these figures', async () => {
    const res = await staff
      .get('/api/staff/auctions/export?from=2025-03-01&to=2025-03-31')
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.body);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Auctions', 'Revenue and customers']);
    const values: unknown[][] = [];
    wb.getWorksheet('Revenue and customers')!.eachRow((row) => values.push((row.values as unknown[]).slice(1)));
    expect(values).toContainEqual(['Commission revenue', 33.5]);
    expect(values).toContainEqual(['New registrations', 2]);
    expect(values).toContainEqual(['Active bidders', 2]);
    expect(values).toContainEqual(['bob', 1000, 1]);
    expect(values).toContainEqual(['carol', 1060, 2]);
  });

  it('validates the range and needs report.view', async () => {
    expect((await staff.get('/api/staff/revenue?from=2025-03-31&to=2025-03-01')).status).toBe(400);
    expect((await staff.get('/api/staff/customers?from=bad&to=2025-03-01')).status).toBe(400);
    expect((await request(app).get('/api/staff/revenue?from=2025-03-01&to=2025-03-31')).status).toBe(401);
    expect((await (await loginAs('alice')).get('/api/staff/customers?from=2025-03-01&to=2025-03-31')).status).toBe(403);
  });
});
