import { expect, request as playwrightRequest, test } from '@playwright/test';
import { PASSWORD, createAuctionViaApi } from './helpers';

const TAG = `jc${Date.now().toString(36)}`;

test('home-2.1: /api/auctions returns the 8 most recently closed lots, newest first', async ({ baseURL }) => {
  const alice = await playwrightRequest.newContext({ baseURL });
  expect((await alice.post('/api/auth/login', { data: { identifier: 'alice', password: PASSWORD } })).status()).toBe(200);
  const expired: number[] = [];
  for (let i = 1; i <= 9; i++) {
    const lot = await createAuctionViaApi(alice, { name: `Closed jar ${i} ${TAG}` });
    expect((await alice.post(`/api/dev/auctions/${lot.id}/expire`)).status()).toBe(200);
    expired.push(lot.id);
  }
  await alice.dispose();

  // Workers: 1, so these 9 are the newest closed lots in the whole e2e database.
  const guest = await playwrightRequest.newContext({ baseURL });
  const body = await (await guest.get('/api/auctions')).json();
  await guest.dispose();
  expect(body.justCompletedLimit).toBe(8);
  const ended = (body.auctions as { id: number; status: string }[]).filter((a) => a.status === 'ended');
  expect(ended).toHaveLength(8);
  expect(ended.map((a) => a.id)).toEqual(expired.slice(1).reverse());
  expect(ended.map((a) => a.id)).not.toContain(expired[0]);
});
