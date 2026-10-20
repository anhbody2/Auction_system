import { expect, test } from '@playwright/test';
import { createAuctionViaApi, createGoodsViaApi, login } from './helpers';

test('gds-002: seller edits and deletes available goods; goods in an active auction cannot be changed', async ({ page }) => {
  await login(page, 'alice');
  await createGoodsViaApi(page.request, { name: 'Pewter Candlestick' });
  await createGoodsViaApi(page.request, { name: 'Spare Teapot' });
  await createAuctionViaApi(page.request, { name: 'Running Gramophone' });

  await page.goto('/goods');
  const table = page.getByTestId('my-goods');

  // Edit the name of an available item.
  await page.getByRole('link', { name: 'Edit Pewter Candlestick' }).click();
  await expect(page.getByRole('heading', { name: 'Edit goods' })).toBeVisible();
  await expect(page.getByLabel('Name')).toHaveValue('Pewter Candlestick');
  await expect(page.getByRole('img', { name: 'Uploaded image 1' })).toBeVisible();
  await page.getByLabel('Name').fill('Pewter Candlestick Pair');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page).toHaveURL(/\/goods$/);
  await expect(table.getByRole('row', { name: /Pewter Candlestick Pair/ })).toBeVisible();

  // Delete asks first; Keep leaves it, Yes removes it.
  await page.getByRole('button', { name: 'Delete Spare Teapot' }).click();
  const confirm = page.getByRole('group', { name: 'Confirm delete Spare Teapot' });
  await expect(confirm).toContainText('Delete Spare Teapot?');
  await confirm.getByRole('button', { name: 'Keep' }).click();
  await expect(table.getByRole('row', { name: /Spare Teapot/ })).toBeVisible();
  await page.getByRole('button', { name: 'Delete Spare Teapot' }).click();
  await page.getByRole('group', { name: 'Confirm delete Spare Teapot' }).getByRole('button', { name: 'Yes, delete' }).click();
  await expect(page.getByText('Goods deleted')).toBeVisible();
  await expect(table.getByRole('row', { name: /Spare Teapot/ })).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId('my-goods').getByRole('row', { name: /Spare Teapot/ })).toHaveCount(0);

  // In an active auction: both actions off, with the reason.
  const busy = page.getByTestId('my-goods').getByRole('row', { name: /Running Gramophone/ });
  await expect(busy.getByTestId('goods-status')).toHaveText('in auction');
  await expect(busy.getByRole('button', { name: 'Edit Running Gramophone' })).toBeDisabled();
  await expect(busy.getByRole('button', { name: 'Delete Running Gramophone' })).toBeDisabled();
  await expect(busy.getByTestId('locked-reason')).toHaveText('Goods in an active auction cannot be changed');
  await expect(busy.getByRole('link', { name: 'View auction' })).toBeVisible();
});
