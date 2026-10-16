import { expect, test } from '@playwright/test';
import { PASSWORD, login, registerViaApi } from './helpers';

const GENERIC = 'If an account exists for that email, a password reset link has been sent.';

test('cust-004: customer resets a forgotten password via a single-use link', async ({ page }) => {
  await registerViaApi(page.request, 'gina');

  // 1-2. Login page -> Forgot password -> submit registered email
  await page.goto('/login');
  await page.getByRole('link', { name: 'Forgot password?' }).click();
  await page.getByLabel('Email').fill('gina@example.com');
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByRole('status').filter({ hasText: GENERIC })).toBeVisible();

  // 3. Reset link issued by email (dev outbox)
  const outbox = await (await page.request.get('/api/dev/outbox?to=gina@example.com')).json();
  const mail = outbox.mails.find((m: { subject: string }) => m.subject === 'Reset your BidHouse password');
  const link = new URL(mail.text.match(/https?:\/\/\S+reset-password\?token=\w+/)[0]);

  // 4. Use it to set a new password
  await page.goto(link.pathname + link.search);
  await page.getByLabel('New password', { exact: true }).fill('Recovered123');
  await page.getByLabel('Confirm new password').fill('Recovered123');
  await page.getByRole('button', { name: 'Reset password' }).click();
  await expect(page).toHaveURL(/\/login$/);

  // 5. New password works, old doesn't, token can't be reused
  await page.getByLabel('Username or email').fill('gina');
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByRole('alert')).toHaveText('Invalid username/email or password');
  await login(page, 'gina', 'Recovered123');

  await page.goto(link.pathname + link.search);
  await page.getByLabel('New password', { exact: true }).fill('Another123');
  await page.getByLabel('Confirm new password').fill('Another123');
  await page.getByRole('button', { name: 'Reset password' }).click();
  await expect(page.getByRole('alert')).toHaveText('This reset link is invalid or has expired');

  // 6. Unknown email: same generic message, no mail sent
  await page.goto('/forgot-password');
  await page.getByLabel('Email').fill('nobody-here@example.com');
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByRole('status').filter({ hasText: GENERIC })).toBeVisible();
  const none = await (await page.request.get('/api/dev/outbox?to=nobody-here@example.com')).json();
  expect(none.mails).toHaveLength(0);
});
