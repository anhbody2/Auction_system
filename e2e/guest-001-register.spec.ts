import { expect, test } from '@playwright/test';
import { login } from './helpers';

test('guest-001: guest registers with validated fields and a confirmation email is sent', async ({ page }) => {
  // 1. Open register page
  await page.goto('/');
  await page.getByRole('link', { name: 'Register' }).click();
  await expect(page.getByRole('heading', { name: 'Create account' })).toBeVisible();

  // 2. Invalid info in every field -> validation messages
  await page.getByLabel('Full name').fill('A');
  await page.getByLabel('Username').fill('x');
  await page.getByLabel('Email').fill('not-an-email');
  await page.getByLabel('Phone').fill('abc');
  await page.getByLabel('Password', { exact: true }).fill('short');
  await page.getByLabel('Confirm password').fill('other');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText('Full name is required')).toBeVisible();
  await expect(page.getByText('Username must be 3-30 letters, numbers or underscores')).toBeVisible();
  await expect(page.getByText('Enter a valid email address')).toBeVisible();
  await expect(page.getByText('Enter a valid phone number')).toBeVisible();
  await expect(page.getByText('Password must be at least 8 characters')).toBeVisible();
  await expect(page.getByText('Passwords do not match')).toBeVisible();

  // Server-side duplicate check is surfaced on the field
  await page.getByLabel('Full name').fill('Erin Example');
  await page.getByLabel('Username').fill('alice');
  await page.getByLabel('Email').fill('erin@example.com');
  await page.getByLabel('Phone').fill('+1 555 123 4567');
  await page.getByLabel('Password', { exact: true }).fill('Secret123');
  await page.getByLabel('Confirm password').fill('Secret123');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText('Username is already taken')).toBeVisible();

  // 3. Valid info -> success notification
  await page.getByLabel('Username').fill('erin');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Account created' })).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);

  // 4. The API sent the confirmation email to the user's address
  const outbox = await (await page.request.get('/api/dev/outbox?to=erin@example.com')).json();
  expect(outbox.mails).toHaveLength(1);
  expect(outbox.mails[0].subject).toBe('Confirm your BidHouse account');
  const link = outbox.mails[0].text.match(/https?:\/\/\S+verify-email\?token=\w+/)[0];

  await page.goto(new URL(link).pathname + new URL(link).search);
  await expect(page.getByText('Email confirmed')).toBeVisible();

  await login(page, 'erin', 'Secret123');
  await expect(page.getByTestId('current-user')).toHaveText('erin');
});
