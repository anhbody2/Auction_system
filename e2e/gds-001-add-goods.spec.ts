import { expect, test } from '@playwright/test';
import { login, logout, testPng } from './helpers';

test('gds-001: seller adds goods with an uploaded image on My goods; an image is required; others cannot see it', async ({ page }) => {
  await login(page, 'alice');
  await page.getByRole('link', { name: 'My goods' }).click();
  await expect(page).toHaveURL(/\/goods$/);
  await expect(page.getByRole('heading', { name: 'My goods' })).toBeVisible();
  await page.getByRole('link', { name: '+ Add goods' }).click();

  await page.getByLabel('Name').fill('Walnut Jewellery Box');
  await page.getByLabel('Description').fill('A hand-made walnut box with a velvet lining.');
  await page.getByLabel('Category').selectOption({ label: 'Collectibles' });
  await page.getByLabel('Condition').selectOption({ label: 'Like new' });

  // No image yet: refused with a message, nothing saved.
  await page.getByRole('button', { name: 'Add goods' }).click();
  await expect(page.getByRole('alert')).toHaveText('Add at least one image');
  await expect(page).toHaveURL(/\/goods\/new$/);

  await page.getByLabel('Images').setInputFiles({ name: 'box.png', mimeType: 'image/png', buffer: await testPng() });
  await expect(page.getByRole('img', { name: 'Uploaded image 1' })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.getByRole('button', { name: 'Add goods' }).click();

  await expect(page).toHaveURL(/\/goods$/);
  const row = page.getByTestId('my-goods').getByRole('row', { name: /Walnut Jewellery Box/ });
  await expect(row).toBeVisible();
  await expect(row.getByTestId('goods-status')).toHaveText('available');
  await expect(row).toContainText('Collectibles');
  await expect(row.getByRole('img', { name: 'Walnut Jewellery Box' })).toHaveAttribute('src', /^\/uploads\/[0-9a-f]{32}\.png$/);
  await logout(page);

  // bob does not see alice's goods.
  await login(page, 'bob');
  await page.getByRole('link', { name: 'My goods' }).click();
  await expect(page.getByRole('heading', { name: 'My goods' })).toBeVisible();
  await expect(page.getByText('Walnut Jewellery Box')).toHaveCount(0);
  const bobGoods = (await (await page.request.get('/api/me/goods')).json()).goods as { name: string }[];
  expect(bobGoods.map((g) => g.name)).not.toContain('Walnut Jewellery Box');
});
