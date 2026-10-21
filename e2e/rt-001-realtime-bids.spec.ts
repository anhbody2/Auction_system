import { expect, test, type Page } from '@playwright/test';
import { createAuctionViaApi, login, topUpViaApi } from './helpers';

test('rt-001: two viewers see each other\'s bids without reloading', async ({ page, browser }) => {
  await login(page, 'alice');
  const auction = await createAuctionViaApi(page.request, { name: 'Live Clock', initialPrice: 100 });

  const bobContext = await browser.newContext();
  const carolContext = await browser.newContext();
  const bob = await bobContext.newPage();
  const carol = await carolContext.newPage();
  for (const [p, name] of [[bob, 'bob'], [carol, 'carol']] as const) {
    await login(p, name);
    // Other specs spend these seeded users' credit; make sure there is enough here.
    await topUpViaApi(p.request, 1000);
    await p.goto(`/auctions/${auction.id}`);
    await expect(p.getByTestId('current-price')).toHaveText('$100.00');
  }

  // Counts full page loads, to prove the updates arrive without one.
  let bobLoads = 0;
  bob.on('load', () => bobLoads++);
  let carolLoads = 0;
  carol.on('load', () => carolLoads++);

  const expectState = async (p: Page, price: string, min: string, count: string, top: string) => {
    await expect(p.getByTestId('current-price')).toHaveText(price);
    await expect(p.getByTestId('next-min-bid')).toHaveText(min);
    await expect(p.getByTestId('bid-count')).toHaveText(count);
    await expect(p.getByTestId('bid-history').getByRole('row').nth(1)).toContainText(top);
  };

  // carol bids; bob's page updates
  await carol.getByRole('button', { name: 'Place bid' }).click();
  await expectState(carol, '$100.00', '$110.00', '1', 'carol');
  await expect(carol.getByTestId('my-standing')).toHaveText('You are the leading bidder');
  await expectState(bob, '$100.00', '$110.00', '1', 'carol');
  await expect(bob.getByLabel('Your bid')).toHaveValue('110');
  await expect(bob.getByTestId('my-standing')).toHaveCount(0);

  // bob bids; carol's page updates and shows she is outbid
  await bob.getByRole('button', { name: 'Place bid' }).click();
  await expectState(bob, '$110.00', '$120.00', '2', 'bob');
  await expect(bob.getByTestId('my-standing')).toHaveText('You are the leading bidder');
  await expectState(carol, '$110.00', '$120.00', '2', 'bob');
  await expect(carol.getByTestId('my-standing')).toHaveText('You have been outbid');
  await expect(carol.getByTestId('bid-history').getByRole('row').nth(2)).toContainText('outbid');
  await expect(carol.getByLabel('Your bid')).toHaveValue('120');

  // A bid from outside any page (the API) is pushed to both
  expect((await carol.request.post(`/api/auctions/${auction.id}/bids`, { data: { amount: 150 } })).status()).toBe(201);
  await expectState(bob, '$150.00', '$160.00', '3', 'carol');
  await expect(bob.getByTestId('my-standing')).toHaveText('You have been outbid');
  await expectState(carol, '$150.00', '$160.00', '3', 'carol');

  // bob's stale bid of the old minimum is refused and the panel shows the current minimum
  await bob.getByLabel('Your bid').fill('120');
  await bob.getByRole('button', { name: 'Place bid' }).click();
  await expect(bob.getByRole('alert')).toHaveText('Bid must be at least $160.00');

  expect(bobLoads).toBe(0);
  expect(carolLoads).toBe(0);
  await bobContext.close();
  await carolContext.close();
});
