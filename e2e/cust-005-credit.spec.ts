import { expect, test, type Page } from '@playwright/test';
import { login, registerViaApi, staffApi } from './helpers';

/** stf-007: staff approve the customer's (only) pending request. */
async function approvePending(page: Page) {
  const { pending } = (await (await page.request.get('/api/credit')).json()) as { pending: { id: number }[] };
  expect(pending).toHaveLength(1);
  expect((await (await staffApi()).post(`/api/staff/credit/requests/${pending[0].id}/approve`)).status()).toBe(200);
}

test('cust-005: customer views balance/history, tops up, and withdraws', async ({ page }) => {
  await registerViaApi(page.request, 'hank');
  await login(page, 'hank');
  await page.locator('header nav').getByRole('link', { name: 'Credit', exact: true }).click();

  // Balance + history displayed
  await expect(page.getByTestId('credit-balance')).toHaveText('$0.00');
  await expect(page.getByText('No transactions yet.')).toBeVisible();

  // Top up -> a pending request (stf-007); once staff approve, the balance increases and the row is recorded
  await page.getByLabel('Top up amount').fill('300');
  await page.getByRole('button', { name: 'Top up' }).click();
  await expect(page.getByTestId('pending-requests')).toContainText('Top up of $300.00');
  await expect(page.getByTestId('credit-balance')).toHaveText('$0.00');
  await approvePending(page);
  await expect(page.getByTestId('credit-balance')).toHaveText('$300.00');
  await expect(page.getByTestId('no-pending')).toBeVisible();
  await expect(page.getByTestId('transactions').getByRole('row')).toHaveCount(2);
  await expect(page.getByTestId('header-credit')).toHaveText('$300.00');
  await expect(page.getByTestId('header-locked')).toHaveText('$0.00');

  // Withdraw too much -> rejected (ui-3b.1: one form with a Top up / Withdraw switch; checked inline first)
  await page.getByTestId('credit-mode').getByRole('tab', { name: 'Withdraw' }).click();
  await page.getByLabel('Withdraw amount').fill('500');
  await page.getByRole('button', { name: 'Withdraw' }).click();
  await expect(page.getByTestId('credit-error')).toHaveText('Exceeds available credit of $300.00.');
  await expect(page.getByTestId('credit-balance')).toHaveText('$300.00');

  // Valid withdraw -> balance decreases, transaction recorded
  await page.getByLabel('Withdraw amount').fill('120.25');
  await page.getByRole('button', { name: 'Withdraw' }).click();
  await expect(page.getByTestId('pending-requests')).toContainText('Withdrawal of $120.25');
  await approvePending(page);
  await expect(page.getByTestId('credit-balance')).toHaveText('$179.75');
  const rows = page.getByTestId('transactions').getByRole('row');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(1)).toContainText('Withdraw');
  await expect(rows.nth(1)).toContainText('-$120.25');

  // Persisted
  await page.reload();
  await expect(page.getByTestId('credit-balance')).toHaveText('$179.75');
});
