import { expect, test } from '@playwright/test';
import { latestPasswordLink, login, logout, outboxCount, registerViaApi } from './helpers';

const TAG = Date.now().toString(36);
const NEW = 'Flow2026pass';

test('mail-004: Change password mails a link, shows the check-mail screen, and the link opens the change-password page', async ({ page, browser }) => {
  const user = `flow_${TAG}`;
  const email = `${user}@example.com`;
  const masked = `f${'*'.repeat(user.length - 1)}@example.com`;
  await registerViaApi(page.request, user);
  await login(page, user);
  const before = await outboxCount(page.request, email);

  // Req-1: one click on the profile -> mail sent -> check-mail screen with the masked address.
  await page.goto('/profile');
  await page.getByRole('button', { name: 'Change password' }).click();
  await expect(page).toHaveURL(/\/change-password\/check-email$/);
  const screen = page.getByTestId('check-mail-screen');
  await expect(screen.getByRole('heading', { name: 'Check your email' })).toBeVisible();
  await expect(page.getByTestId('check-mail-text')).toContainText(`We sent a link to change your password to ${masked}`);
  await expect(page.getByTestId('check-mail-text')).not.toContainText(email);
  expect(await outboxCount(page.request, email)).toBe(before + 1);

  // Reloading the screen sends nothing.
  await page.reload();
  await expect(screen).toBeVisible();
  expect(await outboxCount(page.request, email)).toBe(before + 1);

  // Resend: a new mail; the first link stops working.
  const firstLink = await latestPasswordLink(page, email);
  await screen.getByRole('button', { name: /Resend email|Send email/ }).click();
  await expect.poll(() => outboxCount(page.request, email)).toBe(before + 2);
  const link = await latestPasswordLink(page, email);
  expect(link).toMatch(/^\/change-password\/new\?token=/);
  expect(link).not.toBe(firstLink);

  // Req-2: the link opens the change-password page: the forgot-password form (rules checklist, confirm field).
  await page.goto(firstLink);
  await page.getByLabel('New password', { exact: true }).fill(NEW);
  await page.getByLabel('Confirm new password').fill(NEW);
  await page.getByRole('button', { name: 'Change password' }).click();
  await expect(page.getByRole('alert')).toHaveText('This reset link is invalid or has expired');

  await page.goto(link);
  await expect(page.getByRole('heading', { name: 'Change your password' })).toBeVisible();
  const rules = page.getByTestId('password-rules');
  await page.getByLabel('New password', { exact: true }).fill('weakpassword');
  await expect(rules.locator('li[data-met="true"]')).toHaveCount(2);
  await page.getByLabel('Confirm new password').fill('weakpassword');
  await page.getByRole('button', { name: 'Change password' }).click();
  await expect(page.getByText('Password must contain a number')).toBeVisible();
  await page.getByLabel('New password', { exact: true }).fill(NEW);
  await expect(rules.locator('li[data-met="true"]')).toHaveCount(3);
  await page.getByLabel('Confirm new password').fill(NEW);
  await page.getByRole('button', { name: 'Change password' }).click();

  // Saved in the signed-in browser: still signed in, back on the profile.
  await expect(page).toHaveURL(/\/profile$/);
  await expect(page.getByTestId('page-notice')).toHaveText('Your password has been changed');
  await page.reload();
  await expect(page.getByTestId('current-user')).toHaveText(user);

  await logout(page);
  await login(page, user, NEW);

  // A link opened on another device (signed out) sends the user to log in.
  await page.goto('/change-password/check-email');
  await expect(page.getByTestId('check-mail-text')).toContainText('Send a link');
  await page.getByTestId('check-mail-screen').getByRole('button', { name: 'Send email' }).click();
  await expect.poll(() => outboxCount(page.request, email)).toBe(before + 3);
  const other = await browser.newPage();
  await other.goto(await latestPasswordLink(page, email));
  await other.getByLabel('New password', { exact: true }).fill('Other2026pass');
  await other.getByLabel('Confirm new password').fill('Other2026pass');
  await other.getByRole('button', { name: 'Change password' }).click();
  await expect(other).toHaveURL(/\/login$/);
  await expect(other.getByTestId('page-notice')).toHaveText('Your password has been changed, please log in');
  await other.close();
});
