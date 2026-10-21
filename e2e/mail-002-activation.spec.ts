import { expect, test, type Page } from '@playwright/test';
import { login, logout } from './helpers';

const TAG = Date.now().toString(36);

/** Path + query of the newest activation link mailed to `email` (dev outbox). */
async function latestLink(page: Page, email: string) {
  const { mails } = (await (await page.request.get(`/api/dev/outbox?to=${encodeURIComponent(email)}`)).json()) as { mails: { text: string }[] };
  const link = mails.at(-1)!.text.match(/https?:\/\/\S+verify-email\?token=\w+/)![0];
  const url = new URL(link);
  return url.pathname + url.search;
}

test('mail-002: activation link signs in and lands on the main page; used links offer a resend that invalidates older links', async ({ page }) => {
  const username = `act_${TAG}`;
  const email = `${username}@example.com`;

  // Register through the form
  await page.goto('/register');
  await page.getByLabel('Full name').fill('Activation Tester');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Phone').fill('0900000000');
  await page.getByLabel('Password', { exact: true }).fill('Password123!');
  await page.getByLabel('Confirm password').fill('Password123!');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/login$/);
  const first = await latestLink(page, email);

  // Pending account: the banner offers a resend; the first link stops working.
  await login(page, username);
  await expect(page.getByTestId('pending-banner')).toContainText(email);
  await page.getByTestId('pending-banner').getByRole('button', { name: 'Resend activation email' }).click();
  await expect(page.getByTestId('resend-result')).toHaveText(`A new activation email has been sent to ${email}`);
  const second = await latestLink(page, email);
  expect(second).not.toBe(first);
  await logout(page);

  // The old link: error and a resend button, which sends a third link.
  await page.goto(first);
  await expect(page.getByRole('alert')).toHaveText('This activation link is invalid or has expired');
  await page.getByRole('button', { name: 'Resend activation email' }).click();
  await expect(page.getByTestId('resend-result')).toHaveText(`A new activation email has been sent to ${email}`);
  const third = await latestLink(page, email);

  // The second link died with that resend; the third one activates, signs in and goes to the main page.
  await page.goto(second);
  await expect(page.getByRole('alert')).toHaveText('This activation link is invalid or has expired');
  await page.goto(third);
  await expect(page.getByTestId('page-notice')).toHaveText('Your account is activated');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId('current-user')).toHaveText(username);
  await expect(page.getByTestId('pending-banner')).toHaveCount(0);

  // Opening the used link again: error; a resend now says the account is already active.
  await page.goto(third);
  await expect(page.getByRole('alert')).toHaveText('This activation link is invalid or has expired');
  await page.getByRole('button', { name: 'Resend activation email' }).click();
  await expect(page.getByTestId('resend-result')).toHaveText('Account is already activated');
});
