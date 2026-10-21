import { expect, test } from '@playwright/test';
import { login, logout, registerViaApi, staffApi, testPng, uploadImageViaApi } from './helpers';

const TAG = Date.now().toString(36);

test('stf-005: new goods wait for staff approval; staff search, page, edit and delete goods', async ({ page }) => {
  const seller = `gseller_${TAG}`;
  await registerViaApi(page.request, seller);
  const name = `Pending Vase ${TAG}`;

  // The seller adds goods: pending, and not offered for an auction.
  await login(page, seller);
  await page.goto('/goods/new');
  await page.getByLabel('Name').fill(name);
  await page.getByLabel('Description').fill('A tall glass vase waiting for approval.');
  await page.getByLabel('Category').selectOption({ index: 1 });
  await page.getByLabel('Condition').selectOption({ label: 'Like new' });
  await page.getByLabel('Images').setInputFiles({ name: 'vase.png', mimeType: 'image/png', buffer: await testPng() });
  await expect(page.getByRole('img', { name: 'Uploaded image 1' })).toBeVisible();
  await page.getByRole('button', { name: 'Add goods' }).click();
  const row = page.getByTestId('my-goods').getByRole('row', { name: new RegExp(name) });
  await expect(row.getByTestId('goods-status')).toHaveText('pending approval');
  await page.goto('/auctions/new');
  await expect(page.getByTestId('no-goods')).toBeVisible();
  await logout(page);

  // Staff: 20 more goods for the same seller, so the list pages.
  const staff = await staffApi();
  const image = await uploadImageViaApi(staff);
  const categories = (await (await staff.get('/api/categories')).json()).categories as { id: number; name: string }[];
  for (let i = 0; i < 20; i++) {
    const res = await staff.post('/api/staff/goods', {
      data: { seller, name: `Bulk Item ${TAG} ${String(i).padStart(2, '0')}`, description: 'Added in bulk by staff.', categoryId: categories[0].id, condition: 'used', images: [image] },
    });
    expect(res.status()).toBe(201);
  }

  await login(page, 'staff');
  await page.locator('header nav').getByRole('link', { name: 'Goods' }).click();
  await expect(page.getByRole('heading', { name: 'Goods management' })).toBeVisible();
  const search = page.getByRole('search', { name: 'Search goods' });

  // Seller filter: 21 goods -> 2 pages
  await search.getByLabel('Seller').fill(seller);
  await search.getByRole('button', { name: 'Search' }).click();
  await expect(page.getByTestId('goods-total')).toHaveText('21 goods items · page 1 of 2');
  await expect(page.getByTestId('staff-goods').getByRole('row')).toHaveCount(21); // header + 20
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByTestId('goods-total')).toHaveText('21 goods items · page 2 of 2');
  await expect(page.getByTestId('staff-goods').getByRole('row')).toHaveCount(2);

  // Pending filter finds the new goods; approve it.
  await search.getByLabel('Status').selectOption({ label: 'Pending approval' });
  await search.getByRole('button', { name: 'Search' }).click();
  await expect(page.getByTestId('goods-total')).toHaveText('1 goods item · page 1 of 1');
  await page.getByRole('link', { name: `View ${name}` }).click();
  await expect(page.getByTestId('staff-goods-status')).toHaveText('pending approval');
  await page.getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByTestId('staff-goods-status')).toHaveText('approved');

  // Search by name, edit one bulk item and delete another.
  await page.goto('/staff/goods');
  await search.getByLabel('Name').fill(`Bulk Item ${TAG} 03`);
  await search.getByRole('button', { name: 'Search' }).click();
  await expect(page.getByTestId('goods-total')).toHaveText('1 goods item · page 1 of 1');
  await page.getByRole('link', { name: `View Bulk Item ${TAG} 03` }).click();
  await page.getByRole('button', { name: 'Edit' }).click();
  await page.getByLabel('Name').fill(`Edited Item ${TAG}`);
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('heading', { name: `Edited Item ${TAG}` })).toBeVisible();

  await page.goto(`/staff/goods?q=${encodeURIComponent(`Bulk Item ${TAG} 04`)}`);
  await page.getByRole('link', { name: `View Bulk Item ${TAG} 04` }).click();
  await page.getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('button', { name: 'Yes, delete' }).click();
  await expect(page).toHaveURL(/\/staff\/goods$/);
  await page.goto(`/staff/goods?q=${encodeURIComponent(`Bulk Item ${TAG} 04`)}`);
  await expect(page.getByText('No goods match these filters.')).toBeVisible();
  await page.goto(`/staff/goods?q=${encodeURIComponent(`Bulk Item ${TAG} 04`)}&status=deleted`);
  await expect(page.getByTestId('staff-goods-status')).toHaveText('deleted');
  await logout(page);

  // The seller can now auction the approved goods.
  await login(page, seller);
  await page.goto('/goods');
  await expect(row.getByTestId('goods-status')).toHaveText('available');
  await row.getByRole('link', { name: `Auction ${name}` }).click();
  await page.getByLabel('Starting price').fill('25');
  await page.getByRole('button', { name: 'Create auction' }).click();
  await expect(page.getByRole('heading', { name })).toBeVisible();
});
