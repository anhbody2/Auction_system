import { expect, request as playwrightRequest, test } from '@playwright/test';
import { PASSWORD, createAuctionViaApi } from './helpers';

const TAG = `tr${Date.now().toString(36)}`;

test('home-1.1: /api/auctions lists trending lots only, most bids first, the same for guests and customers', async ({ baseURL }) => {
  const alice = await playwrightRequest.newContext({ baseURL });
  expect((await alice.post('/api/auth/login', { data: { identifier: 'alice', password: PASSWORD } })).status()).toBe(200);
  const quiet = await createAuctionViaApi(alice, { name: `Quiet jug ${TAG}`, initialPrice: 10 });
  const busy = await createAuctionViaApi(alice, { name: `Busy jug ${TAG}`, initialPrice: 10, duration: { value: 2, unit: 'hours' } });
  const later = await createAuctionViaApi(alice, { name: `Later jug ${TAG}`, startTime: new Date(Date.now() + 60 * 60_000).toISOString() });
  await alice.dispose();

  const bob = await playwrightRequest.newContext({ baseURL });
  expect((await bob.post('/api/auth/login', { data: { identifier: 'bob', password: PASSWORD } })).status()).toBe(200);
  // The busy lot ends later than the quiet one, so only its bid can put it first.
  expect((await bob.post(`/api/auctions/${busy.id}/bids`, { data: { amount: 10 } })).status()).toBe(201);

  const guest = await playwrightRequest.newContext({ baseURL });
  for (const [who, ctx] of [['guest', guest], ['customer', bob]] as const) {
    const res = await ctx.get(`/api/auctions?q=${TAG}&field=auction`);
    expect(res.status(), who).toBe(200);
    const ids = ((await res.json()).auctions as { id: number }[]).map((a) => a.id);
    expect(ids, who).toEqual([busy.id, quiet.id]);
    expect(ids, who).not.toContain(later.id);
  }
  // Still reachable by its own URL.
  expect(((await (await guest.get(`/api/auctions/${later.id}`)).json()).auction as { status: string }).status).toBe('upcoming');
  await bob.dispose();
  await guest.dispose();
});
