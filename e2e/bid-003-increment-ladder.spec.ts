import { expect, test } from '@playwright/test';
import { createAuctionViaApi, login, logout } from './helpers';

test('bid-003: auction page shows the ladder minimum next bid and updates after each bid', async ({ page }) => {
  await login(page, 'alice');
  const auction = await createAuctionViaApi(page.request, { name: 'Ladder Mug', initialPrice: 9.5 });
  await logout(page);

  await login(page, 'bob');
  await page.goto(`/auctions/${auction.id}`);
  await expect(page.getByTestId('next-min-bid')).toHaveText('$9.50');
  await page.getByRole('button', { name: 'Place bid' }).click();
  await expect(page.getByTestId('current-price')).toHaveText('$9.50');
  // $9.50 is in the $1-$10 tier: +$0.50
  await expect(page.getByTestId('next-min-bid')).toHaveText('$10.00');

  await page.getByLabel('Your bid').fill('9.99');
  await page.getByRole('button', { name: 'Place bid' }).click();
  await expect(page.getByRole('alert')).toHaveText('Bid must be at least $10.00');

  await page.getByLabel('Your bid').fill('10');
  await page.getByRole('button', { name: 'Place bid' }).click();
  await expect(page.getByTestId('current-price')).toHaveText('$10.00');
  // $10.00 is in the $10-$50 tier: +$1
  await expect(page.getByTestId('next-min-bid')).toHaveText('$11.00');
});
