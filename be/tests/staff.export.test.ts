import ExcelJS from 'exceljs';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { app, insertAuction, loginAs, resetDb } from './helpers';

const binary = (res: request.Response, cb: (err: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on('data', (c: Buffer) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};

async function download(agent: request.Agent, qs: string) {
  return agent.get(`/api/staff/auctions/export?${qs}`).buffer(true).parse(binary);
}

async function readSheet(body: Buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(body);
  const ws = wb.getWorksheet('Auctions')!;
  const rows: unknown[][] = [];
  ws.eachRow((row) => rows.push((row.values as unknown[]).slice(1)));
  return rows;
}

describe('stf-002 export the statistics list to Excel', () => {
  let staff: request.Agent;

  beforeAll(async () => {
    await resetDb();
    await insertAuction({ seller: 'alice', name: 'Sold lamp', start: '2025-03-01T10:00:00Z', end: '2025-03-02T10:00:00Z', initialPrice: 50, sold: { winner: 'bob', price: 150, commission: 7.5 } });
    await insertAuction({ seller: 'bob', name: 'Unsold vase', start: '2025-03-02T08:00:00Z', end: '2025-03-03T08:00:00Z', initialPrice: 80, status: 'ended' });
    await insertAuction({ seller: 'bob', name: 'Cancelled clock', start: '2025-03-02T09:00:00Z', end: '2025-03-05T09:00:00Z', initialPrice: 40, status: 'cancelled' });
    staff = await loginAs('staff');
  });

  it('returns an xlsx attachment named after the range', async () => {
    const res = await download(staff, 'from=2025-03-01&to=2025-03-31&status=all');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(res.headers['content-disposition']).toBe('attachment; filename="auctions_2025-03-01_2025-03-31.xlsx"');
    expect(res.body.subarray(0, 2).toString()).toBe('PK'); // zip container
  });

  it('holds a header row plus one row per auction from the list endpoint, then the totals', async () => {
    const qs = 'from=2025-03-01&to=2025-03-31&status=ended';
    const list = await staff.get(`/api/staff/auctions?${qs}`);
    const rows = await readSheet((await download(staff, qs)).body);

    expect(rows[0]).toEqual(['ID', 'Title', 'Seller', 'Start time', 'End time', 'Status', 'Starting price', 'Final price', 'Winner', 'Commission']);
    const data = rows.slice(1, 1 + list.body.auctions.length);
    expect(data.map((r) => r[1])).toEqual(list.body.auctions.map((a: { title: string }) => a.title));
    expect(data[0]).toEqual([
      list.body.auctions[0].id,
      'Sold lamp',
      'alice',
      new Date('2025-03-01T10:00:00Z'),
      new Date('2025-03-02T10:00:00Z'),
      'ended',
      50,
      150,
      'bob',
      7.5,
    ]);
    const totals = rows[1 + list.body.auctions.length];
    expect(totals[1]).toBe('Total: 2 auctions');
    expect(totals[6]).toBe(list.body.summary.totalStartingPrice);
    expect(totals[7]).toBe(list.body.summary.totalFinalPrice);
    expect(totals[9]).toBe(list.body.summary.totalCommission);
    expect(rows.at(-1)?.[0]).toBe('Filter: 2025-03-01 to 2025-03-31, status ended (by start time)');
  });

  it('validates the filter like the list endpoint', async () => {
    const res = await staff.get('/api/staff/auctions/export?from=2025-03-10&to=2025-03-01');
    expect(res.status).toBe(400);
  });

  it('needs report.export: 401 anonymous, 403 customer, and revoking it from staff blocks export', async () => {
    const qs = 'from=2025-03-01&to=2025-03-31';
    expect((await request(app).get(`/api/staff/auctions/export?${qs}`)).status).toBe(401);
    expect((await (await loginAs('alice')).get(`/api/staff/auctions/export?${qs}`)).status).toBe(403);

    const admin = await loginAs('admin');
    await admin.put('/api/admin/roles/staff/permissions/report.export').send({ granted: false });
    expect((await staff.get(`/api/staff/auctions/export?${qs}`)).status).toBe(403);
    expect((await staff.get(`/api/staff/auctions?${qs}`)).status).toBe(200);
    await admin.put('/api/admin/roles/staff/permissions/report.export').send({ granted: true });
    expect((await download(staff, qs)).status).toBe(200);
  });
});
