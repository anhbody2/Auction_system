import { expect, test } from '@playwright/test';
import { createAuctionViaApi, createGoodsViaApi, login, logout, registerViaApi, topUpViaApi } from './helpers';

const TAG = Date.now().toString(36);

test('stf-006: staff search and page auctions, add one for a seller, edit it, and delete one with bids', async ({ page }) => {
  const seller = `aseller_${TAG}`;
  const bidder = `abidder_${TAG}`;
  await registerViaApi(page.request, seller);
  await registerViaApi(page.request, bidder);

  // The seller: 21 running auctions (so the list pages), plus approved goods for staff to auction.
  await login(page, seller);
  const created: { id: number; name: string }[] = [];
  for (let i = 0; i < 21; i++) created.push(await createAuctionViaApi(page.request, { name: `Lot ${TAG} ${String(i).padStart(2, '0')}`, initialPrice: 10 }));
  await createGoodsViaApi(page.request, { name: `Staff Goods ${TAG}`, description: 'Goods staff will put up for auction.' });
  await logout(page);

  // The bidder bids on one of them.
  const doomed = created[5];
  await login(page, bidder);
  await topUpViaApi(page.request, 100);
  expect((await page.request.post(`/api/auctions/${doomed.id}/bids`, { data: { amount: 30 } })).status()).toBe(201);
  await page.goto('/credit');
  await expect(page.getByTestId('credit-held')).toHaveText('$30.00');
  await logout(page);

  await login(page, 'staff');
  await page.locator('header nav').getByRole('link', { name: 'Manage auctions' }).click();
  await expect(page.getByRole('heading', { name: 'Auction management' })).toBeVisible();
  const search = page.getByRole('search', { name: 'Search auctions' });

  // Search by seller + status, then page.
  await search.getByLabel('Seller').fill(seller);
  await search.getByLabel('Status').selectOption({ label: 'Active' });
  await search.getByRole('button', { name: 'Search' }).click();
  await expect(page.getByTestId('auctions-total')).toHaveText('21 auctions · page 1 of 2');
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByTestId('auctions-total')).toHaveText('21 auctions · page 2 of 2');
  await expect(page.getByTestId('staff-auctions').getByRole('row')).toHaveCount(2);

  // Add an auction for the seller from their goods; it is upcoming with the New tag.
  await page.goto('/staff/auctions/new');
  await page.getByLabel('Seller (username or email)').fill(seller);
  await page.getByRole('button', { name: 'Find goods' }).click();
  await page.getByLabel('Goods').selectOption({ label: `Staff Goods ${TAG}` });
  await expect(page.getByLabel('Auction name')).toHaveValue(`Staff Goods ${TAG}`);
  await page.getByLabel('Starting price').fill('40');
  await page.getByRole('button', { name: 'Create auction' }).click();
  await expect(page.getByRole('heading', { name: `Staff Goods ${TAG}` })).toBeVisible();
  await expect(page.getByTestId('status')).toHaveText('upcoming');
  await expect(page.getByTestId('new-tag')).toHaveText('New');

  // Edit it: name and price.
  await page.getByRole('button', { name: 'Edit' }).click();
  await page.getByLabel('Auction name').fill(`Staff Lot ${TAG}`);
  await page.getByLabel('Starting price').fill('45');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('heading', { name: `Staff Lot ${TAG}` })).toBeVisible();
  await expect(page.getByTestId('staff-auction-details')).toContainText('$45.00');

  // Delete the auction the bidder bid on.
  await page.goto(`/staff/auctions?q=${encodeURIComponent(doomed.name)}`);
  await page.getByRole('link', { name: `View ${doomed.name}` }).click();
  await expect(page.getByTestId('staff-auction-bids')).toContainText(bidder);
  await page.getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByRole('group', { name: `Confirm delete ${doomed.name}` })).toContainText('held credit is released');
  await page.getByRole('button', { name: 'Yes, delete' }).click();
  await expect(page).toHaveURL(/\/staff\/auctions$/);
  await page.goto(`/staff/auctions?q=${encodeURIComponent(doomed.name)}&status=deleted`);
  await expect(page.getByTestId(`staff-auction-${doomed.id}`)).toContainText('deleted');
  await logout(page);

  // The bidder's hold is released and the auction is gone for customers.
  await login(page, bidder);
  await page.goto('/credit');
  await expect(page.getByTestId('credit-held')).toHaveText('$0.00');
  await expect(page.getByTestId('transactions')).toContainText(`Auction deleted by staff: ${doomed.name}`);
  expect((await page.request.get(`/api/auctions/${doomed.id}`)).status()).toBe(404);
});
