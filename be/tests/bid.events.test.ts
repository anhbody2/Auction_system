import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { auctionListenerCount } from '../src/lib/events';
import { app, createAuction, loginAs, resetDb } from './helpers';

interface SseEvent {
  event: string;
  id?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
}

/** Opens GET /api/auctions/:id/events and collects parsed events until close(). */
function subscribe(port: number, auctionId: number) {
  const events: SseEvent[] = [];
  let req!: http.ClientRequest;
  const ready = new Promise<{ status: number; headers: http.IncomingHttpHeaders }>((resolve, reject) => {
    req = http.get({ host: '127.0.0.1', port, path: `/api/auctions/${auctionId}/events` }, (res) => {
      let buffer = '';
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => {
        buffer += chunk;
        let at: number;
        while ((at = buffer.indexOf('\n\n')) >= 0) {
          const frame = buffer.slice(0, at);
          buffer = buffer.slice(at + 2);
          const ev: Partial<SseEvent> = {};
          for (const line of frame.split('\n')) {
            if (line.startsWith('event: ')) ev.event = line.slice(7);
            else if (line.startsWith('id: ')) ev.id = line.slice(4);
            else if (line.startsWith('data: ')) ev.data = JSON.parse(line.slice(6));
          }
          if (ev.event) events.push(ev as SseEvent);
        }
      });
      resolve({ status: res.statusCode!, headers: res.headers });
    });
    req.on('error', (err) => {
      if ((err as NodeJS.ErrnoException).code !== 'ECONNRESET') reject(err);
    });
  });
  return { events, ready, close: () => req.destroy() };
}

const waitFor = async (check: () => boolean, ms = 3000) => {
  const until = Date.now() + ms;
  while (!check()) {
    if (Date.now() > until) throw new Error('timed out waiting');
    await new Promise((r) => setTimeout(r, 20));
  }
};
const settle = () => new Promise((r) => setTimeout(r, 300));

describe('rt-001 auction event stream', () => {
  let server: http.Server;
  let port: number;
  beforeAll(async () => {
    server = app.listen(0);
    await new Promise((r) => server.once('listening', r));
    port = (server.address() as AddressInfo).port;
  });
  afterAll(() => new Promise((r) => server.close(r)));
  beforeEach(resetDb);

  it('sends a bid event with the bid, the bidder and the new price and minimum', async () => {
    const alice = await loginAs('alice');
    const bob = await loginAs('bob');
    const carol = await loginAs('carol');
    const a = await createAuction(alice, { initialPrice: 100 });
    const sub = subscribe(port, a.id);
    const { status, headers } = await sub.ready;
    expect(status).toBe(200);
    expect(headers['content-type']).toMatch(/^text\/event-stream/);
    expect(headers['cache-control']).toContain('no-cache');
    await waitFor(() => auctionListenerCount(BigInt(a.id)) === 1);

    const first = await bob.post(`/api/auctions/${a.id}/bids`).send({ amount: 100 });
    expect(first.status).toBe(201);
    await waitFor(() => sub.events.length === 1);
    expect(sub.events[0]).toMatchObject({
      event: 'bid',
      id: String(first.body.bid.id),
      data: {
        auctionId: a.id,
        bid: { id: first.body.bid.id, amount: 100, status: 'active', bidder: { username: 'bob' } },
        outbidBidIds: [],
        currentPrice: 100,
        nextMinBid: 110,
        bidCount: 1,
      },
    });
    // The POST response carries the same event, so the bidder's own page can apply it at once.
    expect(first.body.event).toEqual(sub.events[0].data);

    const second = await carol.post(`/api/auctions/${a.id}/bids`).send({ amount: 110 });
    await waitFor(() => sub.events.length === 2);
    expect(sub.events[1].data).toMatchObject({
      bid: { id: second.body.bid.id, amount: 110, bidder: { username: 'carol' } },
      outbidBidIds: [first.body.bid.id],
      currentPrice: 110,
      nextMinBid: 120,
      bidCount: 2,
    });

    sub.close();
    await waitFor(() => auctionListenerCount(BigInt(a.id)) === 0);
  });

  it('a rejected bid sends no event, and bids on other auctions are not sent', async () => {
    const alice = await loginAs('alice');
    const bob = await loginAs('bob');
    const a = await createAuction(alice, { initialPrice: 100 });
    const b = await createAuction(alice, { name: 'Other', initialPrice: 100 });
    const sub = subscribe(port, a.id);
    await sub.ready;
    await waitFor(() => auctionListenerCount(BigInt(a.id)) === 1);

    expect((await bob.post(`/api/auctions/${a.id}/bids`).send({ amount: 50 })).status).toBe(400);
    expect((await alice.post(`/api/auctions/${a.id}/bids`).send({ amount: 500 })).status).toBe(403);
    expect((await bob.post(`/api/auctions/${b.id}/bids`).send({ amount: 100 })).status).toBe(201);
    await settle();
    expect(sub.events).toHaveLength(0);
    sub.close();
  });

  it('unknown auction -> 404', async () => {
    const res = await new Promise<http.IncomingMessage>((resolve) =>
      http.get({ host: '127.0.0.1', port, path: '/api/auctions/999999/events' }, resolve),
    );
    expect(res.statusCode).toBe(404);
    res.resume();
  });
});
