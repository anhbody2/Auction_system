import { expect, test } from '@playwright/test';
import { createAuctionViaApi, login, logout, registerViaApi, topUpViaApi } from './helpers';

const TAG = Date.now().toString(36);

test('ui-3b.2: type chips, one search box (lot, id, amount), date presets, signed amounts and balance', async ({ page }) => {
  const seller = `tx_seller_${TAG}`;
  const user = `tx_user_${TAG}`;
  await registerViaApi(page.request, seller);
  await registerViaApi(page.request, user);
  await login(page, seller);
  const lot = await createAuctionViaApi(page.request, { name: `Panel Kettle ${TAG}`, initialPrice: 40 });
  await logout(page);

  await login(page, user);
  await topUpViaApi(page.request, 200);
  const t75 = await topUpViaApi(page.request, 75);
  await expect(async () => {
    expect((await page.request.post(`/api/auctions/${lot.id}/bids`, { data: { amount: 40 } })).status()).toBe(201);
  }).toPass({ timeout: 15_000 });
  await page.goto('/credit');

  const table = page.getByTestId('transactions');
  const rows = table.locator('tbody tr');
  await expect(page.getByTestId('tx-total')).toHaveText('3 transactions · page 1 of 1');
  // Newest first: the hold, signed and coloured, with the balance after it and its id under the description
  const hold = rows.first();
  await expect(hold.getByTestId('tx-type')).toHaveText('Hold');
  await expect(hold.locator('td.num').first()).toHaveText('-$40.00');
  await expect(hold.locator('td.num').first()).toHaveClass(/ui-money-minus/);
  await expect(hold.locator('td').last()).toHaveText('$275.00');
  await expect(hold.getByTestId('tx-id')).toHaveText(/^#\d+$/);
  await expect(rows.nth(1).locator('td.num').first()).toHaveText('+$75.00');
  await expect(rows.nth(1).locator('td.num').first()).toHaveClass(/ui-money-plus/);

  // Type chips: every real type, filtering on the server
  const chips = page.getByTestId('tx-types');
  await expect(chips.getByRole('tab')).toHaveText(['All', 'Top up', 'Withdraw', 'Hold', 'Release', 'Purchase', 'Sale', 'Adjustment']);
  await chips.getByRole('tab', { name: 'Top up' }).click();
  await expect(page.getByTestId('tx-total')).toHaveText('2 transactions · page 1 of 1');
  await chips.getByRole('tab', { name: 'Hold' }).click();
  await expect(page.getByTestId('tx-total')).toHaveText('1 transaction · page 1 of 1');
  await chips.getByRole('tab', { name: 'Sale' }).click();
  await expect(page.getByTestId('tx-empty')).toHaveText('No transactions match.');
  await chips.getByRole('tab', { name: 'All' }).click();
  await expect(page.getByTestId('tx-total')).toHaveText('3 transactions · page 1 of 1');

  // One search box: lot name, transaction id, amount
  const q = page.getByTestId('tx-q');
  await q.fill('kettle');
  await expect(page.getByTestId('tx-total')).toHaveText('1 transaction · page 1 of 1');
  await expect(rows.first().getByTestId('tx-type')).toHaveText('Hold');
  await q.fill(`#${t75.id}`);
  await expect(page.getByTestId('tx-total')).toHaveText('1 transaction · page 1 of 1');
  await expect(rows.first().getByTestId('tx-id')).toHaveText(`#${t75.id}`);
  await q.fill('200');
  await expect(page.getByTestId('tx-total')).toHaveText('1 transaction · page 1 of 1');
  await expect(rows.first().locator('td.num').first()).toHaveText('+$200.00');
  // Combined with a chip
  await chips.getByRole('tab', { name: 'Hold' }).click();
  await expect(page.getByTestId('tx-empty')).toHaveText('No transactions match.');
  await q.fill('');
  await chips.getByRole('tab', { name: 'All' }).click();
  await expect(page.getByTestId('tx-total')).toHaveText('3 transactions · page 1 of 1');

  // Date presets come from the 30-day search window; picking one keeps today's rows
  const range = page.getByTestId('tx-range');
  await expect(range).toHaveValue('30');
  await expect(range.locator('option')).toHaveText(['Last 7 days', 'Last 14 days', 'Last 30 days', 'Custom dates']);
  await range.selectOption({ label: 'Last 7 days' });
  await expect(range).toHaveValue('7');
  await expect(page.getByTestId('tx-total')).toHaveText('3 transactions · page 1 of 1');
  // Custom dates opens the full filter form
  await range.selectOption({ label: 'Custom dates' });
  await expect(page.getByRole('search', { name: 'Search transactions' }).getByLabel('From', { exact: true })).toBeVisible();
});

test('ui-3b.2: pagination stays and the panel fits at 375px', async ({ page }) => {
  const user = `tx_pages_${TAG}`;
  await registerViaApi(page.request, user);
  await login(page, user);
  for (let i = 1; i <= 21; i++) await topUpViaApi(page.request, i);
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto('/credit');
  await expect(page.getByTestId('tx-total')).toHaveText('21 transactions · page 1 of 2');
  await expect(page.getByTestId('transactions').locator('tbody tr')).toHaveCount(20);
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByTestId('tx-total')).toHaveText('21 transactions · page 2 of 2');
  await expect(page.getByTestId('transactions').locator('tbody tr')).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
});
