import { expect, test, type Page } from '@playwright/test';
import { login, logout, registerViaApi } from './helpers';

const TAG = Date.now().toString(36);
const NEW = 'Fresh2026pw';

/** Path + query of the newest password link mailed to `email` (dev outbox). */
async function latestLink(page: Page, email: string) {
  const { mails } = (await (await page.request.get(`/api/dev/outbox?to=${encodeURIComponent(email)}`)).json()) as { mails: { text: string }[] };
  const url = new URL(mails.at(-1)!.text.match(/https?:\/\/\S+reset-password\?token=\w+/)![0]);
  return url.pathname + url.search;
}

/** On the new-password form: a weak password shows the rule error; then a valid one is saved. */
async function setNewPassword(page: Page) {
  const rules = page.getByTestId('password-rules');
  await page.getByLabel('New password', { exact: true }).fill('abcdefgh');
  await expect(rules.locator('li[data-met="true"]')).toHaveCount(2); // 8 characters + a letter
  await page.getByLabel('Confirm new password').fill('abcdefgh');
  await page.getByRole('button', { name: 'Reset password' }).click();
  await expect(page.getByText('Password must contain a number')).toBeVisible();
  await page.getByLabel('New password', { exact: true }).fill(NEW);
  await expect(rules.locator('li[data-met="true"]')).toHaveCount(3);
  await page.getByLabel('Confirm new password').fill(NEW);
  await page.getByRole('button', { name: 'Reset password' }).click();
}

// Fresh accounts stand in for bob and carol, so the seeded users keep their passwords for other specs.
test('mail-003: change password by emailed link (signed in) and forgot password both use the new-password form', async ({ page }) => {
  const changer = `chg_${TAG}`;
  const forgetter = `fgt_${TAG}`;
  await registerViaApi(page.request, changer);
  await registerViaApi(page.request, forgetter);

  // Change password: request a link from /change-password
  await login(page, changer);
  await page.goto('/change-password');
  await page.getByRole('button', { name: 'Send me a change-password link' }).click();
  await expect(page.getByTestId('link-sent')).toHaveText(`We sent a link to change your password to ${changer}@example.com`);
  await page.goto(await latestLink(page, `${changer}@example.com`));
  await expect(page.getByRole('heading', { name: 'Set a new password' })).toBeVisible();
  await setNewPassword(page);
  // Back to the profile with the success message
  await expect(page).toHaveURL(/\/profile$/);
  await expect(page.getByTestId('page-notice')).toHaveText('Your password has been changed');
  await logout(page);
  await login(page, changer, NEW);
  await logout(page);

  // Forgot password: same form, then to log in
  await page.goto('/forgot-password');
  await page.getByLabel('Email').fill(`${forgetter}@example.com`);
  await page.getByRole('button', { name: /send/i }).click();
  await expect.poll(async () => (await (await page.request.get(`/api/dev/outbox?to=${forgetter}@example.com`)).json()).mails.length).toBeGreaterThan(1);
  const link = await latestLink(page, `${forgetter}@example.com`);
  await page.goto(link);
  await setNewPassword(page);
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByTestId('page-notice')).toHaveText('Password has been reset. You can now log in.');
  await login(page, forgetter, NEW);

  // The used link no longer works
  await logout(page);
  await page.goto(link);
  await page.getByLabel('New password', { exact: true }).fill('Another2026x');
  await page.getByLabel('Confirm new password').fill('Another2026x');
  await page.getByRole('button', { name: 'Reset password' }).click();
  await expect(page.getByRole('alert')).toHaveText('This reset link is invalid or has expired');
});
