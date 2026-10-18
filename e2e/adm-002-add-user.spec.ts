import { expect, test } from '@playwright/test';
import { login, logout } from './helpers';

test('adm-002: admin adds a staff user who can log in right away', async ({ page }) => {
  const username = `staff_${Date.now().toString(36)}`;
  await login(page, 'admin');
  await page.getByRole('link', { name: '+ Add user' }).click();
  await expect(page.getByRole('heading', { name: 'Add user' })).toBeVisible();

  // Duplicate username is rejected with a clear message
  await page.getByLabel('Username').fill('alice');
  await page.getByLabel('Email').fill(`${username}@example.com`);
  await page.getByLabel('Password', { exact: true }).fill('Welcome123');
  await page.getByRole('button', { name: 'Create user' }).click();
  await expect(page.locator('#username-error')).toHaveText('Username is already taken');

  // Valid data -> success toast and the user is in the list
  await page.getByLabel('Full name (optional)').fill('Fresh Staff');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Role').selectOption('staff');
  await page.getByRole('button', { name: 'Create user' }).click();
  await expect(page.getByRole('status').filter({ hasText: `User ${username} created` })).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/users$/);
  await expect(page.getByTestId(`user-row-${username}`)).toContainText('staff');
  await logout(page);

  // The new account logs in and lands on the staff home
  await page.getByLabel('Username or email').fill(username);
  await page.getByLabel('Password', { exact: true }).fill('Welcome123');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/staff\/statistics$/);
});
