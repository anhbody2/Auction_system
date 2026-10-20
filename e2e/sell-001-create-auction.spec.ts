import { expect, test } from '@playwright/test';
import { createGoodsViaApi, login, logout } from './helpers';

const local = (offsetMin: number) => {
  const d = new Date(Date.now() + offsetMin * 60_000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

test('sell-001: seller creates an auction that other customers can see; invalid data rejected', async ({ page }) => {
  await login(page, 'alice');
  // sell-003: the auction is created for goods added first.
  await createGoodsViaApi(page.request, { name: 'Antique Clock', description: 'A mahogany mantel clock from 1890, fully working.' });
  await page.getByRole('link', { name: 'My Auctions' }).click();
  await page.getByRole('link', { name: '+ New auction' }).click();

  // Invalid: negative price, end before start
  await page.getByLabel('Goods').selectOption({ label: 'Antique Clock' });
  await expect(page.getByLabel('Auction name')).toHaveValue('Antique Clock');
  await expect(page.getByLabel('Description')).toHaveValue('A mahogany mantel clock from 1890, fully working.');
  await page.getByLabel('Starting price').fill('-10');
  await page.getByLabel('Start time').fill(local(60));
  await page.getByLabel('End time').fill(local(10));
  await page.getByRole('button', { name: 'Create auction' }).click();
  await expect(page.getByText('Starting price must be greater than 0')).toBeVisible();
  await expect(page.getByText('End time must be after start time')).toBeVisible();

  // Valid
  await page.getByLabel('Starting price').fill('200');
  await page.getByLabel('Start time').fill(local(0));
  await page.getByLabel('End time').fill(local(120));
  await page.getByRole('button', { name: 'Create auction' }).click();
  await expect(page.getByRole('heading', { name: 'Antique Clock' })).toBeVisible();
  await expect(page.getByTestId('status')).toHaveText('active');
  await expect(page.getByTestId('current-price')).toHaveText('$200.00');
  const auctionUrl = page.url();

  // Appears in the seller's list
  await page.getByRole('link', { name: 'My Auctions' }).click();
  await expect(page.getByTestId('my-auctions').getByRole('link', { name: 'Antique Clock' })).toBeVisible();

  // Visible to a different customer
  await logout(page);
  await login(page, 'bob');
  await page.goto(auctionUrl);
  await expect(page.getByRole('heading', { name: 'Antique Clock' })).toBeVisible();
  await expect(page.getByText('Sold by alice')).toBeVisible();
});
