import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db';
import { app, createAuction, inMinutes, loginAs, resetDb } from './helpers';

const STARTED = 'This auction has started; only an admin can cancel it';
const upcoming = { startTime: inMinutes(60), duration: { value: 1, unit: 'hours' } };
const statusOf = async (id: number) => (await request(app).get(`/api/auctions/${id}`)).body.auction.status;

describe('sell-002 / sell-005 seller cancel', () => {
  beforeEach(resetDb);

  it('the seller cancels an upcoming auction; bids are then rejected', async () => {
    const alice = await loginAs('alice');
    const bob = await loginAs('bob');
    const a = await createAuction(alice, { initialPrice: 100, ...upcoming });

    const res = await alice.post(`/api/auctions/${a.id}/cancel`);
    expect(res.status).toBe(200);
    expect(await statusOf(a.id)).toBe('cancelled');

    const late = await bob.post(`/api/auctions/${a.id}/bids`).send({ amount: 500 });
    expect(late.status).toBe(400);
    expect(late.body.error).toBe('This auction has been cancelled');
  });

  it('the seller cannot cancel once the auction is active', async () => {
    const alice = await loginAs('alice');
    const bob = await loginAs('bob');
    const a = await createAuction(alice, { initialPrice: 100 });
    await bob.post(`/api/auctions/${a.id}/bids`).send({ amount: 100 });

    const res = await alice.post(`/api/auctions/${a.id}/cancel`);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe(STARTED);
    expect(await statusOf(a.id)).toBe('active');
    expect((await bob.get('/api/credit')).body.held).toBe(100);
  });

  it('the seller cannot cancel after start_time even while the stored status is still upcoming', async () => {
    const alice = await loginAs('alice');
    const a = await createAuction(alice, upcoming);
    // Start time has passed, but the start job has not run yet.
    await prisma.auction.update({ where: { id: BigInt(a.id) }, data: { startTime: new Date(Date.now() - 1000), status: 'upcoming' } });

    const res = await alice.post(`/api/auctions/${a.id}/cancel`);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe(STARTED);
    const stored = await prisma.auction.findUniqueOrThrow({ where: { id: BigInt(a.id) } });
    expect(stored.status).toBe('upcoming');
    expect(stored.cancelledAt).toBeNull();
  });

  it('a non-owner customer and a staff user cannot cancel', async () => {
    const alice = await loginAs('alice');
    const bob = await loginAs('bob');
    const staff = await loginAs('staff');
    const a = await createAuction(alice, upcoming);
    const b = await createAuction(alice);
    for (const id of [a.id, b.id]) {
      expect((await bob.post(`/api/auctions/${id}/cancel`)).status).toBe(403);
      expect((await staff.post(`/api/auctions/${id}/cancel`)).status).toBe(403);
    }
    expect(await statusOf(a.id)).toBe('upcoming');
    expect(await statusOf(b.id)).toBe('active');
  });

  it('ended or already-cancelled auctions cannot be cancelled', async () => {
    const alice = await loginAs('alice');
    const a = await createAuction(alice, upcoming);
    await alice.post(`/api/auctions/${a.id}/cancel`);
    const again = await alice.post(`/api/auctions/${a.id}/cancel`);
    expect(again.status).toBe(400);
    expect(again.body.error).toBe('This auction is already cancelled');

    const b = await createAuction(alice);
    await prisma.auction.update({ where: { id: BigInt(b.id) }, data: { endTime: new Date(Date.now() - 1000) } });
    expect((await alice.post(`/api/auctions/${b.id}/cancel`)).body.error).toBe('An auction that has ended cannot be cancelled');
  });
});
