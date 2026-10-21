import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db';
import { closeDueAuctions } from '../src/lib/settlement';
import { app, createAuction, inMinutes, loginAs, resetDb } from './helpers';

describe('bid-002 post a message', () => {
  let auctionId: number;
  beforeAll(async () => {
    await resetDb();
    auctionId = (await createAuction(await loginAs('alice'))).id;
  });

  it('posts a message visible to others with author and time', async () => {
    const bob = await loginAs('bob');
    const res = await bob.post(`/api/auctions/${auctionId}/messages`).send({ content: '  Is the lens included?  ' });
    expect(res.status).toBe(201);
    expect(res.body.message).toMatchObject({ content: 'Is the lens included?', author: { username: 'bob' } });
    expect(res.body.message.createdAt).toBeDefined();

    const carol = await loginAs('carol');
    const list = (await carol.get(`/api/auctions/${auctionId}/messages`)).body.messages;
    expect(list.map((m: { content: string }) => m.content)).toEqual(['Is the lens included?']);
    expect((await request(app).get(`/api/auctions/${auctionId}/messages`)).body.messages).toHaveLength(1);
  });

  it('rejects empty/whitespace messages and anonymous posts', async () => {
    const bob = await loginAs('bob');
    for (const content of ['', '   ', undefined]) {
      const res = await bob.post(`/api/auctions/${auctionId}/messages`).send({ content });
      expect(res.status).toBe(400);
      expect(res.body.fields.content).toBe('Message cannot be empty');
    }
    expect((await request(app).post(`/api/auctions/${auctionId}/messages`).send({ content: 'hi' })).status).toBe(401);
  });

  it('404s for a missing auction', async () => {
    const bob = await loginAs('bob');
    expect((await bob.post('/api/auctions/999999/messages').send({ content: 'hi' })).status).toBe(404);
  });
});

describe('cmt-001 comments close with the auction', () => {
  beforeEach(resetDb);
  const CLOSED = 'Comments are closed for this auction';
  const post = (agent: request.Agent | ReturnType<typeof request>, id: number, content = 'Still available?') =>
    agent.post(`/api/auctions/${id}/messages`).send({ content });

  it('open on upcoming and active auctions for signed-in users; anonymous is 401', async () => {
    const alice = await loginAs('alice');
    const bob = await loginAs('bob');
    const upcoming = await createAuction(alice, { name: 'Soon', startTime: inMinutes(60), duration: { value: 1, unit: 'hours' } });
    const active = await createAuction(alice, { name: 'Live' });
    expect((await post(bob, upcoming.id)).status).toBe(201);
    expect((await post(bob, active.id)).status).toBe(201);
    expect((await post(alice, active.id, 'Yes, it is.')).status).toBe(201); // the seller answers
    expect((await post(request(app), active.id)).status).toBe(401);
  });

  it('closed once ended (stored status, or end time passed before the close job) or cancelled', async () => {
    const alice = await loginAs('alice');
    const bob = await loginAs('bob');
    const admin = await loginAs('admin');

    // End time passed, close job not run: stored status still 'active'
    const due = await createAuction(alice, { name: 'Due' });
    await prisma.auction.update({ where: { id: BigInt(due.id) }, data: { endTime: new Date(Date.now() - 1000), status: 'active' } });
    const early = await post(bob, due.id);
    expect(early.status).toBe(400);
    expect(early.body.error).toBe(CLOSED);

    // Stored 'ended' (closed by the job)
    const ended = await createAuction(alice, { name: 'Ended' });
    await prisma.auction.update({ where: { id: BigInt(ended.id) }, data: { status: 'ended', closedAt: new Date() } });
    expect((await post(bob, ended.id)).body.error).toBe(CLOSED);

    // Cancelled
    const cancelled = await createAuction(alice, { name: 'Cancelled' });
    expect((await admin.post(`/api/auctions/${cancelled.id}/cancel`)).status).toBe(200);
    const res = await post(alice, cancelled.id);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe(CLOSED);
  });

  it('comments posted before the close are kept after the close job and after a cancel', async () => {
    const alice = await loginAs('alice');
    const bob = await loginAs('bob');
    const admin = await loginAs('admin');
    const a = await createAuction(alice, { name: 'To close' });
    const b = await createAuction(alice, { name: 'To cancel' });
    await post(bob, a.id, 'Before close');
    await post(bob, b.id, 'Before cancel');

    await prisma.auction.update({ where: { id: BigInt(a.id) }, data: { endTime: new Date(Date.now() - 1000) } });
    expect(await closeDueAuctions()).toBe(1);
    await admin.post(`/api/auctions/${b.id}/cancel`);

    const afterClose = (await request(app).get(`/api/auctions/${a.id}/messages`)).body.messages;
    expect(afterClose.map((m: { content: string }) => m.content)).toEqual(['Before close']);
    const afterCancel = (await request(app).get(`/api/auctions/${b.id}/messages`)).body.messages;
    expect(afterCancel.map((m: { content: string }) => m.content)).toEqual(['Before cancel']);
    expect(await prisma.auctionMessage.count()).toBe(2);
  });
});
