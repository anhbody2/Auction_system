import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/db';
import { app, createAuction, inMinutes, loginAs, resetDb } from './helpers';

type Row = { name: string; status: string };
const list = async (query: string) => (await request(app).get(`/api/auctions?${query}`)).body.auctions as Row[];
const names = async (query: string) => (await list(query)).map((a) => a.name);

describe('ui-1a.2 auction list filters and sort', () => {
  let cats: Record<string, number>;
  beforeAll(async () => {
    await resetDb();
    // Only this test's auctions: the seed may add its own.
    await prisma.$executeRawUnsafe('TRUNCATE auction_messages, auction_settlements, credit_transactions, bid_tickets, auctions RESTART IDENTITY CASCADE');
    const alice = await loginAs('alice');
    const bob = await loginAs('bob');
    const carol = await loginAs('carol');
    cats = Object.fromEntries((await prisma.category.findMany()).map((c) => [c.name, Number(c.id)]));
    const day = { value: 1, unit: 'days' };
    // Cheap camera: 2 bids, ends in a day. Lamp: no bids, ends soonest (under an hour). Table: 1 bid, most expensive.
    const camera = await createAuction(alice, { name: 'Cheap camera', initialPrice: 10, categoryId: cats.Electronics, duration: day });
    await bob.post(`/api/auctions/${camera.id}/bids`).send({ amount: 10 });
    await carol.post(`/api/auctions/${camera.id}/bids`).send({ amount: 11 });
    const lamp = await createAuction(alice, { name: 'Desk lamp', initialPrice: 40, categoryId: cats.Electronics });
    await prisma.auction.update({ where: { id: BigInt(lamp.id) }, data: { endTime: new Date(Date.now() + 20 * 60_000) } });
    const table = await createAuction(alice, { name: 'Oak table', initialPrice: 300, categoryId: cats['Home and Garden'], duration: day });
    await bob.post(`/api/auctions/${table.id}/bids`).send({ amount: 300 });
    // Upcoming: never 'ending soon' even if its end were close.
    await createAuction(alice, { name: 'Future vase', initialPrice: 20, categoryId: cats['Home and Garden'], startTime: inMinutes(30) });
  });

  it('keeps the old order without a sort (soonest ending first)', async () => {
    expect(await names('')).toEqual(['Desk lamp', 'Future vase', 'Cheap camera', 'Oak table']);
  });

  it('sorts by most bids, price both ways and ending time', async () => {
    expect((await names('sort=bids')).slice(0, 2)).toEqual(['Cheap camera', 'Oak table']);
    expect(await names('sort=price_asc')).toEqual(['Cheap camera', 'Future vase', 'Desk lamp', 'Oak table']);
    expect(await names('sort=price_desc')).toEqual(['Oak table', 'Desk lamp', 'Future vase', 'Cheap camera']);
    expect(await names('sort=ending')).toEqual(['Desk lamp', 'Future vase', 'Cheap camera', 'Oak table']);
  });

  it('filters by category', async () => {
    expect(await names(`category=${cats.Electronics}`)).toEqual(['Desk lamp', 'Cheap camera']);
    expect(await names(`category=${cats.Art}`)).toEqual([]);
  });

  it('endingSoon lists only live auctions ending within the hour', async () => {
    expect(await names('endingSoon=1')).toEqual(['Desk lamp']);
  });

  it('combines with the keyword search and with each other (AND)', async () => {
    expect(await names(`q=cheap&field=auction&category=${cats.Electronics}`)).toEqual(['Cheap camera']);
    expect(await names(`q=cheap&field=auction&category=${cats['Home and Garden']}`)).toEqual([]);
    expect(await names(`category=${cats['Home and Garden']}&sort=price_asc`)).toEqual(['Future vase', 'Oak table']);
    expect(await names(`category=${cats.Electronics}&endingSoon=1`)).toEqual(['Desk lamp']);
  });

  it('rejects unknown values with 400', async () => {
    for (const q of ['sort=random', 'category=abc', 'category=-1', 'endingSoon=yes']) {
      expect((await request(app).get(`/api/auctions?${q}`)).status, q).toBe(400);
    }
  });
});
