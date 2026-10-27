import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/db';
import { app, createAuction, inMinutes, loginAs, resetDb } from './helpers';

type Row = { id: number; name: string; status: string; myBid: unknown };
const open = (rows: Row[]) => rows.filter((a) => a.status !== 'ended').map((a) => a.name);

describe('home-1.1 the open part of GET /api/auctions is trending (live) lots, most bids first', () => {
  beforeAll(async () => {
    await resetDb();
    // Only this test's auctions: the seed may add its own.
    await prisma.$executeRawUnsafe('TRUNCATE auction_messages, auction_settlements, credit_transactions, bid_tickets, auctions RESTART IDENTITY CASCADE');
    const alice = await loginAs('alice');
    const bob = await loginAs('bob');
    const carol = await loginAs('carol');
    const day = { value: 1, unit: 'days' };
    // Quiet: no bids, ends soonest. Busy: 2 bids. Single: 1 bid, ends in a day. Twin: 1 bid, ends in two days.
    await createAuction(alice, { name: 'Quiet clock', initialPrice: 50 });
    const busy = await createAuction(alice, { name: 'Busy camera', initialPrice: 10, duration: day });
    await bob.post(`/api/auctions/${busy.id}/bids`).send({ amount: 10 });
    await carol.post(`/api/auctions/${busy.id}/bids`).send({ amount: 11 });
    const single = await createAuction(alice, { name: 'Single vase', initialPrice: 200, duration: day });
    await bob.post(`/api/auctions/${single.id}/bids`).send({ amount: 200 });
    const twin = await createAuction(alice, { name: 'Twin vase', initialPrice: 30, duration: { value: 2, unit: 'days' } });
    await carol.post(`/api/auctions/${twin.id}/bids`).send({ amount: 30 });
    // Upcoming (start in the future): not trending.
    await createAuction(alice, { name: 'Future lamp', startTime: inMinutes(30) });
    // Cancelled and soft-deleted: never listed.
    const cancelled = await createAuction(alice, { name: 'Cancelled rug' });
    await (await loginAs('admin')).post(`/api/auctions/${cancelled.id}/cancel`);
    const deleted = await createAuction(alice, { name: 'Deleted rug' });
    await prisma.auction.update({ where: { id: BigInt(deleted.id) }, data: { deletedAt: new Date() } });
  });

  it('lists started lots only: upcoming, cancelled and deleted lots are left out', async () => {
    const res = await request(app).get('/api/auctions');
    expect(res.status).toBe(200);
    const names = open(res.body.auctions);
    expect(names).not.toContain('Future lamp');
    expect(names).not.toContain('Cancelled rug');
    expect(names).not.toContain('Deleted rug');
    expect(names.sort()).toEqual(['Busy camera', 'Quiet clock', 'Single vase', 'Twin vase']);
  });

  it('includes a lot whose start time has passed before the start job ran (stored upcoming)', async () => {
    const stored = await prisma.auction.findFirstOrThrow({ where: { name: 'Quiet clock' } });
    expect(stored.status).toBe('upcoming');
    const row = ((await request(app).get('/api/auctions')).body.auctions as Row[]).find((a) => a.name === 'Quiet clock');
    expect(row).toMatchObject({ status: 'active' });
  });

  it('orders by most bids by default, ties by soonest ending', async () => {
    expect(open((await request(app).get('/api/auctions')).body.auctions)).toEqual(['Busy camera', 'Single vase', 'Twin vase', 'Quiet clock']);
  });

  it('explicit sorts still reorder the trending lots', async () => {
    const names = async (q: string) => open((await request(app).get(`/api/auctions?${q}`)).body.auctions);
    expect(await names('sort=bids')).toEqual(['Busy camera', 'Single vase', 'Twin vase', 'Quiet clock']);
    expect(await names('sort=price_asc')).toEqual(['Busy camera', 'Twin vase', 'Quiet clock', 'Single vase']);
    expect(await names('sort=price_desc')).toEqual(['Single vase', 'Quiet clock', 'Twin vase', 'Busy camera']);
    expect(await names('sort=ending')).toEqual(['Quiet clock', 'Busy camera', 'Single vase', 'Twin vase']);
  });

  it('a guest and a signed-in customer get the same lots; only myBid differs', async () => {
    const guest = (await request(app).get('/api/auctions')).body.auctions as Row[];
    const bob = (await (await loginAs('bob')).get('/api/auctions')).body.auctions as Row[];
    expect(bob.map((a) => a.id)).toEqual(guest.map((a) => a.id));
    expect(guest.every((a) => a.myBid === null)).toBe(true);
    expect(bob.find((a) => a.name === 'Single vase')!.myBid).toMatchObject({ status: 'leading' });
  });
});
