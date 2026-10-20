import { expect, test } from '@playwright/test';
import { login, registerViaApi } from './helpers';

test('cust-005: customer views balance/history, tops up, and withdraws', async ({ page }) => {
  await registerViaApi(page.request, 'hank');
  await login(page, 'hank');
  await page.getByRole('link', { name: 'Credit' }).click();

  // Balance + history displayed
  await expect(page.getByTestId('credit-balance')).toHaveText('$0.00');
  await expect(page.getByText('No transactions yet.')).toBeVisible();

  // Top up -> balance increases, transaction recorded
  await page.getByLabel('Top up amount').fill('300');
  await page.getByRole('button', { name: 'Top up' }).click();
  await expect(page.getByTestId('credit-balance')).toHaveText('$300.00');
  await expect(page.getByTestId('transactions').getByRole('row')).toHaveCount(2);
  await expect(page.getByTestId('header-credit')).toHaveText('$300.00');
  await expect(page.getByTestId('header-locked')).toHaveText('$0.00');

  // Withdraw too much -> rejected
  await page.getByLabel('Withdraw amount').fill('500');
  await page.getByRole('button', { name: 'Withdraw' }).click();
  await expect(page.getByText('Amount exceeds your available credit')).toBeVisible();
  await expect(page.getByTestId('credit-balance')).toHaveText('$300.00');

  // Valid withdraw -> balance decreases, transaction recorded
  await page.getByLabel('Withdraw amount').fill('120.25');
  await page.getByRole('button', { name: 'Withdraw' }).click();
  await expect(page.getByTestId('credit-balance')).toHaveText('$179.75');
  const rows = page.getByTestId('transactions').getByRole('row');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(1)).toContainText('withdraw');
  await expect(rows.nth(1)).toContainText('-$120.25');

  // Persisted
  await page.reload();
  await expect(page.getByTestId('credit-balance')).toHaveText('$179.75');
});
