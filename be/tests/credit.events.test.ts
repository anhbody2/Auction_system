import type http from 'node:http';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db';
import { userListenerCount } from '../src/lib/events';
import { closeDueAuctions } from '../src/lib/settlement';
import { app, createAuction, loginAs, resetDb } from './helpers';
import { listen, loginCookie, settle, subscribe, waitFor } from './sse';

const userId = async (username: string) => (await prisma.user.findUniqueOrThrow({ where: { username } })).id;

describe('crd-003 user event stream', () => {
  let server: http.Server;
  let port: number;
  beforeAll(async () => {
    ({ server, port } = await listen());
  });
  afterAll(() => new Promise((r) => server.close(r)));
  beforeEach(resetDb);

  /** Opens /api/me/events as the user and waits until the server is listening for them. */
  const streamFor = async (username: string) => {
    const sub = subscribe(port, '/api/me/events', await loginCookie(username));
    const { status } = await sub.ready;
    expect(status).toBe(200);
    const id = await userId(username);
    await waitFor(() => userListenerCount(id) >= 1);
    return sub;
  };

  it('anonymous -> 401', async () => {
    expect((await request(app).get('/api/me/events')).status).toBe(401);
  });

  it('an outbid user receives an outbid event with the released amount; raising your own bid sends none', async () => {
    const alice = await loginAs('alice');
    const bob = await loginAs('bob');
    const carol = await loginAs('carol');
    const a = await createAuction(alice, { name: 'Oak Chair', initialPrice: 100 });
    const bobEvents = await streamFor('bob');
    const carolEvents = await streamFor('carol');

    const first = await bob.post(`/api/auctions/${a.id}/bids`).send({ amount: 100 });
    const raise = await bob.post(`/api/auctions/${a.id}/bids`).send({ amount: 110 });
    expect(raise.body.released).toBe(100); // own earlier hold freed by the raise
    await settle();
    expect(bobEvents.events).toHaveLength(0);

    expect((await carol.post(`/api/auctions/${a.id}/bids`).send({ amount: 120 })).body.released).toBe(0);
    await waitFor(() => bobEvents.events.length === 1);
    expect(bobEvents.events[0]).toMatchObject({
      event: 'outbid',
      id: String(raise.body.bid.id),
      data: { auctionId: a.id, auctionName: 'Oak Chair', bidId: raise.body.bid.id, releasedAmount: 110 },
    });
    expect(first.body.bid.id).not.toBe(raise.body.bid.id);
    expect(carolEvents.events).toHaveLength(0);

    bobEvents.close();
    carolEvents.close();
  });

  it('when the close job settles an auction, the winner, the outbid bidders and the seller get auction-finished', async () => {
    const alice = await loginAs('alice');
    const bob = await loginAs('bob');
    const carol = await loginAs('carol');
    const a = await createAuction(alice, { name: 'Brass Clock', initialPrice: 100 });
    await bob.post(`/api/auctions/${a.id}/bids`).send({ amount: 100 });
    await carol.post(`/api/auctions/${a.id}/bids`).send({ amount: 110 });

    const streams = { alice: await streamFor('alice'), bob: await streamFor('bob'), carol: await streamFor('carol') };
    const staff = await streamFor('staff'); // not involved

    await prisma.auction.update({ where: { id: BigInt(a.id) }, data: { endTime: new Date(Date.now() - 1000) } });
    expect(await closeDueAuctions()).toBe(1);

    for (const sub of Object.values(streams)) {
      await waitFor(() => sub.events.some((e) => e.event === 'auction-finished'));
      const finished = sub.events.filter((e) => e.event === 'auction-finished');
      expect(finished).toHaveLength(1); // once per user, even with several bids
      expect(finished[0].data).toEqual({ auctionId: a.id, auctionName: 'Brass Clock', reason: 'ended' });
    }
    await settle();
    expect(staff.events).toHaveLength(0);

    // The event is sent after commit: a refetch straight away sees the settled credit.
    expect((await carol.get('/api/credit')).body).toMatchObject({ balance: 390, held: 0 });

    // A second close run settles nothing and sends nothing more.
    expect(await closeDueAuctions()).toBe(0);
    await settle();
    expect(streams.bob.events.filter((e) => e.event === 'auction-finished')).toHaveLength(1);
    for (const sub of [...Object.values(streams), staff]) sub.close();
  });

  it('cancelling an auction sends auction-finished (reason cancelled) to the seller and bidders', async () => {
    const alice = await loginAs('alice');
    const bob = await loginAs('bob');
    const admin = await loginAs('admin');
    const a = await createAuction(alice, { name: 'Cancel Rug', initialPrice: 100 });
    await bob.post(`/api/auctions/${a.id}/bids`).send({ amount: 100 });
    const streams = [await streamFor('alice'), await streamFor('bob')];

    expect((await admin.post(`/api/auctions/${a.id}/cancel`)).status).toBe(200);
    for (const sub of streams) {
      await waitFor(() => sub.events.length === 1);
      expect(sub.events[0]).toMatchObject({ event: 'auction-finished', data: { auctionId: a.id, reason: 'cancelled' } });
      sub.close();
    }
  });
});
