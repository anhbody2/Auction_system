import { expect, test } from '@playwright/test';
import { createAuctionViaApi, login, logout } from './helpers';

test('bid-001: bidder places valid bids; low, over-credit, own and ended-auction bids are rejected', async ({ page }) => {
  await login(page, 'alice');
  const auction = await createAuctionViaApi(page.request, { name: 'Bid Test Lamp', initialPrice: 100, minIncrement: 10 });
  const ended = await createAuctionViaApi(page.request, { name: 'Ended Lamp' });
  await page.request.post(`/api/dev/auctions/${ended.id}/expire`);

  // Seller cannot bid on own auction
  await page.goto(`/auctions/${auction.id}`);
  await expect(page.getByText("You can't bid on your own auction.")).toBeVisible();
  const own = await page.request.post(`/api/auctions/${auction.id}/bids`, { data: { amount: 500 } });
  expect(own.status()).toBe(403);
  await logout(page);

  // Valid bid becomes current highest
  await login(page, 'bob');
  await page.goto(`/auctions/${auction.id}`);
  await expect(page.getByLabel('Your bid')).toHaveValue('100');
  await page.getByRole('button', { name: 'Place bid' }).click();
  await expect(page.getByTestId('current-price')).toHaveText('$100.00');
  await expect(page.getByTestId('next-min-bid')).toHaveText('$110.00');
  await expect(page.getByTestId('bid-history').getByRole('row').nth(1)).toContainText('bob');

  // Equal / below increment rejected
  await page.getByLabel('Your bid').fill('100');
  await page.getByRole('button', { name: 'Place bid' }).click();
  await expect(page.getByRole('alert')).toHaveText('Bid must be at least $110.00');
  await page.getByLabel('Your bid').fill('105');
  await page.getByRole('button', { name: 'Place bid' }).click();
  await expect(page.getByRole('alert')).toHaveText('Bid must be at least $110.00');

  // Exceeding available credit rejected (bob has 1000, 100 already held -> raising to 5000 fails)
  await page.getByLabel('Your bid').fill('5000');
  await page.getByRole('button', { name: 'Place bid' }).click();
  await expect(page.getByRole('alert')).toHaveText('Bid exceeds your available credit');
  await expect(page.getByTestId('current-price')).toHaveText('$100.00');

  // Ended auction does not accept bids
  await page.goto(`/auctions/${ended.id}`);
  await expect(page.getByTestId('status')).toHaveText('ended');
  await expect(page.getByText('This auction has ended and no longer accepts bids.')).toBeVisible();
  const late = await page.request.post(`/api/auctions/${ended.id}/bids`, { data: { amount: 500 } });
  expect(late.status()).toBe(400);
  expect((await late.json()).error).toBe('This auction has ended');
});
