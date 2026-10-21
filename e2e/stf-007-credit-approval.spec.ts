import { expect, test } from '@playwright/test';
import { login, registerViaApi } from './helpers';

const TAG = Date.now().toString(36);

test('stf-007: a top-up waits for staff approval; once approved the customer sees it without reloading', async ({ page, browser }) => {
  const customer = `req_${TAG}`;
  await registerViaApi(page.request, customer);
  await login(page, customer);
  await page.goto('/credit');
  await expect(page.getByTestId('credit-balance')).toHaveText('$0.00');

  // Request $50: pending, balance unchanged
  await page.getByLabel('Top up amount').fill('50');
  await page.getByRole('button', { name: 'Top up' }).click();
  await expect(page.getByTestId('pending-requests')).toContainText('Top up of $50.00');
  await expect(page.getByTestId('credit-balance')).toHaveText('$0.00');
  await expect(page.getByTestId('header-credit')).toHaveText('$0.00');
  await expect(page.getByTestId('transactions')).toContainText('pending');

  // A second request staff will reject
  await page.getByLabel('Top up amount').fill('70');
  await page.getByRole('button', { name: 'Top up' }).click();
  await expect(page.getByTestId('pending-requests')).toContainText('Top up of $70.00');

  const { pending } = (await (await page.request.get('/api/credit')).json()) as { pending: { id: number; amount: number }[] };
  const idOf = (amount: number) => pending.find((p) => Number(p.amount) === amount)!.id;

  // Staff, in another browser session
  const staffContext = await browser.newContext();
  const staff = await staffContext.newPage();
  await login(staff, 'staff');
  await staff.locator('header nav').getByRole('link', { name: 'Credit management' }).click();
  const fifty = staff.getByTestId(`request-${idOf(50)}`);
  const seventy = staff.getByTestId(`request-${idOf(70)}`);
  await expect(fifty).toContainText(customer);
  await expect(fifty).toContainText('$50.00');
  await fifty.getByRole('button', { name: /^Approve/ }).click();
  await expect(fifty).toHaveCount(0);

  // The customer sees +$50 at once, no reload
  await expect(page.getByTestId('credit-balance')).toHaveText('$50.00');
  await expect(page.getByTestId('header-credit')).toHaveText('$50.00');
  await expect(page.getByTestId('pending-requests')).not.toContainText('$50.00');

  // Reject needs a reason
  await seventy.getByRole('button', { name: /^Reject/ }).click();
  const rejectForm = staff.getByRole('form', { name: `Reject request ${idOf(70)}` });
  await rejectForm.getByRole('button', { name: 'Confirm reject' }).click();
  await expect(rejectForm.getByRole('alert')).toHaveText('Give a reason for the rejection');
  await rejectForm.getByLabel('Reason').fill('Card declined');
  await rejectForm.getByRole('button', { name: 'Confirm reject' }).click();
  await expect(staff.getByTestId('no-requests').or(staff.getByTestId('credit-requests'))).toBeVisible();
  await expect(seventy).toHaveCount(0);
  await staffContext.close();

  await expect(page.getByTestId('no-pending')).toBeVisible();
  await expect(page.getByTestId('credit-balance')).toHaveText('$50.00');
  await expect(page.getByTestId('transactions')).toContainText('rejected: Card declined');
});
