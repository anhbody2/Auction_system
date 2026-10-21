import { expect, test } from '@playwright/test';
import { createAuctionViaApi, login, logout, registerViaApi, topUpViaApi } from './helpers';

test('bid-004: the next minimum bid steps by $10 from $100 and by $100 from $1000', async ({ page }) => {
  await login(page, 'alice');
  const auction = await createAuctionViaApi(page.request, { name: 'Ladder Bureau', initialPrice: 100 });
  await logout(page);

  await registerViaApi(page.request, 'ladder_bidder');
  await login(page, 'ladder_bidder');
  await topUpViaApi(page.request, 2000);
  await page.goto(`/auctions/${auction.id}`);

  await page.getByLabel('Your bid').fill('100');
  await page.getByRole('button', { name: 'Place bid' }).click();
  await expect(page.getByTestId('current-price')).toHaveText('$100.00');
  await expect(page.getByTestId('next-min-bid')).toHaveText('$110.00');

  await page.getByLabel('Your bid').fill('1000');
  await page.getByRole('button', { name: 'Place bid' }).click();
  await expect(page.getByTestId('current-price')).toHaveText('$1,000.00');
  await expect(page.getByTestId('next-min-bid')).toHaveText('$1,100.00');

  await page.getByLabel('Your bid').fill('1099');
  await page.getByRole('button', { name: 'Place bid' }).click();
  await expect(page.getByRole('alert')).toHaveText('Bid must be at least $1100.00');
});
