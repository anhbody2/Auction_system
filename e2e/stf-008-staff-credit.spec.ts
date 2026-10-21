import { expect, test } from '@playwright/test';
import { login, logout, registerViaApi, topUpViaApi } from './helpers';

const TAG = Date.now().toString(36);

test('stf-008: staff filter transactions, add an adjustment, edit and delete requests, and reverse a posted adjustment', async ({ page }) => {
  const customer = `ledger_${TAG}`;
  await registerViaApi(page.request, customer);
  await login(page, customer);
  await topUpViaApi(page.request, 15);
  await topUpViaApi(page.request, 150);
  const req = async (amount: number) => (await (await page.request.post('/api/credit/topup', { data: { amount } })).json()).request.id as number;
  const toEdit = await req(30);
  const toDelete = await req(40);
  await logout(page);

  await login(page, 'staff');
  await page.goto('/staff/credit');
  const search = page.getByRole('search', { name: 'Search transactions' });

  // Customer + amount range: only the $150 top-up
  await search.getByLabel('Customer', { exact: true }).fill(customer);
  await search.getByLabel('Min amount').fill('100');
  await search.getByRole('button', { name: 'Search' }).click();
  await expect(page.getByTestId('tx-total')).toHaveText('1 transaction · page 1 of 1');
  await expect(page.getByTestId('transactions')).toContainText('$150.00');
  // Customer + Pending status: the two requests
  await search.getByRole('button', { name: 'Clear' }).click();
  await search.getByLabel('Customer', { exact: true }).fill(customer);
  await search.getByLabel('Status').selectOption({ label: 'Pending' });
  await search.getByRole('button', { name: 'Search' }).click();
  await expect(page.getByTestId('tx-total')).toHaveText('2 transactions · page 1 of 1');

  // Manual $20 credit for carol
  const adjust = page.getByRole('form', { name: 'Manual adjustment' });
  await adjust.getByLabel('Customer (username or email)').fill('carol');
  await adjust.getByLabel('Adjustment amount').fill('20');
  await adjust.getByLabel('Reason').fill(`Goodwill ${TAG}`);
  await adjust.getByRole('button', { name: 'Post adjustment' }).click();
  await expect(adjust.getByLabel('Reason')).toHaveValue('');

  // Edit the $30 request's amount to $35
  await page.goto(`/staff/credit/${toEdit}`);
  await page.getByRole('button', { name: 'Edit' }).click();
  await page.getByLabel('Amount', { exact: true }).fill('35');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByTestId('tx-amount')).toHaveText('$35.00');

  // Delete the $40 request
  await page.goto(`/staff/credit/${toDelete}`);
  await page.getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('button', { name: 'Yes, delete' }).click();
  await expect(page).toHaveURL(/\/staff\/credit$/);
  await page.goto(`/staff/credit/${toDelete}`);
  await expect(page.getByTestId('tx-detail-status')).toHaveText('deleted');
  await expect(page.getByRole('button', { name: 'Delete' })).toHaveCount(0);

  // Find carol's adjustment and reverse it
  await page.goto('/staff/credit');
  await search.getByLabel('Name').fill(`Goodwill ${TAG}`);
  await search.getByRole('button', { name: 'Search' }).click();
  await expect(page.getByTestId('tx-total')).toHaveText('1 transaction · page 1 of 1');
  await expect(page.getByTestId('transactions')).toContainText('+$20.00');
  await page.getByRole('link', { name: /^View transaction/ }).click();
  await expect(page.getByTestId('tx-details')).toContainText('adjustment (credit)');
  const adjustmentUrl = page.url();
  await page.getByRole('button', { name: 'Reverse' }).click();
  await page.getByRole('button', { name: 'Yes, reverse' }).click();
  await expect(page.getByTestId('tx-details')).toContainText('adjustment (debit)');
  await expect(page.getByTestId('tx-details')).toContainText(`Reversal of #`);
  await page.goto(adjustmentUrl);
  await expect(page.getByTestId('tx-details')).toContainText('Reversed by');
  await expect(page.getByRole('button', { name: 'Reverse' })).toHaveCount(0);
  await logout(page);

  // carol sees both rows; the customer sees the edited request and not the deleted one
  await login(page, 'carol');
  await page.goto('/credit');
  await expect(page.getByTestId('transactions')).toContainText(`Adjustment: Goodwill ${TAG}`);
  await expect(page.getByTestId('transactions')).toContainText('Reversal of #');
  await logout(page);
  await login(page, customer);
  await page.goto('/credit');
  await expect(page.getByTestId('pending-requests')).toContainText('Top up of $35.00');
  await expect(page.getByTestId('pending-requests')).not.toContainText('$40.00');
});
