import { expect, test } from '@playwright/test';
import { login, registerViaApi, staffApi, topUpViaApi } from './helpers';

const TAG = Date.now().toString(36);

test('ui-3b.1: quick amounts, pending top-up approved live, withdrawal over available refused, ?mode=withdraw', async ({ page }) => {
  const user = `credform_${TAG}`;
  await registerViaApi(page.request, user);
  await login(page, user);
  await topUpViaApi(page.request, 300);
  await page.goto('/credit');

  await expect(page.getByTestId('credit-available')).toHaveText('$300.00');
  await expect(page.getByTestId('credit-balance')).toHaveText('$300.00');
  await expect(page.getByTestId('credit-held')).toHaveText('$0.00');
  const mode = page.getByTestId('credit-mode');
  await expect(mode.getByRole('tab', { name: 'Top up' })).toHaveAttribute('aria-selected', 'true');

  // Empty amount -> inline message, nothing sent
  await page.getByTestId('credit-submit').click();
  await expect(page.getByTestId('credit-error')).toHaveText('Enter an amount.');
  await expect(page.getByTestId('no-pending')).toBeVisible();

  // Quick amount fills the input and the button label
  await page.getByTestId('quick-1000').click();
  await expect(page.getByLabel('Top up amount')).toHaveValue('1,000');
  await expect(page.getByTestId('credit-submit')).toHaveText('Request top up $1,000.00');
  await expect(page.getByTestId('credit-error')).toHaveCount(0);
  await page.getByTestId('credit-submit').click();
  await expect(page.getByTestId('pending-requests')).toContainText('Top up of $1,000.00');
  await expect(page.getByLabel('Top up amount')).toHaveValue('');
  // The balance waits for staff
  await expect(page.getByTestId('credit-balance')).toHaveText('$300.00');

  // Staff approves in another session -> balance and pending update without reload
  await page.evaluate(() => ((window as unknown as { __ui3b1: boolean }).__ui3b1 = true));
  const { pending } = (await (await page.request.get('/api/credit')).json()) as { pending: { id: number }[] };
  expect((await (await staffApi()).post(`/api/staff/credit/requests/${pending[0].id}/approve`)).status()).toBe(200);
  await expect(page.getByTestId('credit-balance')).toHaveText('$1,300.00');
  await expect(page.getByTestId('credit-available')).toHaveText('$1,300.00');
  await expect(page.getByTestId('no-pending')).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __ui3b1?: boolean }).__ui3b1)).toBe(true);

  // Withdraw: crimson button, refused inline over available credit
  await mode.getByRole('tab', { name: 'Withdraw' }).click();
  await expect(page).toHaveURL(/\?mode=withdraw$/);
  await page.getByLabel('Withdraw amount').fill('5000');
  await expect(page.getByTestId('credit-submit')).toHaveText('Request withdrawal $5,000.00');
  await expect(page.getByTestId('credit-submit')).toHaveClass(/btn-danger/);
  await page.getByTestId('credit-submit').click();
  await expect(page.getByTestId('credit-error')).toHaveText('Exceeds available credit of $1,300.00.');
  await expect(page.getByTestId('no-pending')).toBeVisible();
  await page.getByLabel('Withdraw amount').fill('200');
  await page.getByTestId('credit-submit').click();
  await expect(page.getByTestId('pending-requests')).toContainText('Withdrawal of $200.00');

  // ?mode=withdraw (the dashboard's Withdraw button) opens the Withdraw tab
  await page.goto('/dashboard');
  await page.getByRole('link', { name: 'Withdraw' }).click();
  await expect(mode.getByRole('tab', { name: 'Withdraw' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByLabel('Withdraw amount')).toBeVisible();
});

test('ui-3b.1: at 375px the form stacks above the transactions with no sideways scroll', async ({ page }) => {
  const user = `credform0_${TAG}`;
  await registerViaApi(page.request, user);
  await login(page, user);
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto('/credit?mode=topup');
  const form = await page.getByTestId('credit-form').boundingBox();
  const history = await page.getByRole('heading', { name: 'Transaction history' }).boundingBox();
  expect(history!.y).toBeGreaterThan(form!.y + form!.height - 1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
});
