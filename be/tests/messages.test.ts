import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { app, createAuction, loginAs, resetDb } from './helpers';

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
