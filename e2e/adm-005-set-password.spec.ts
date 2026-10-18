import { expect, test } from '@playwright/test';
import { PASSWORD, login, logout, registerViaApi } from './helpers';

test('adm-005: admin sets a new password from the user detail page', async ({ page, request }) => {
  const username = `pw_${Date.now().toString(36)}`;
  await registerViaApi(request, username);

  await login(page, 'admin');
  await page.getByLabel('Search').fill(username);
  await page.getByRole('button', { name: 'Apply' }).click();
  await page.getByRole('link', { name: username }).click();

  const form = page.getByRole('form', { name: 'Set password' });
  // Weak password is rejected
  await form.getByLabel('New password', { exact: true }).fill('short');
  await form.getByLabel('Confirm new password').fill('short');
  await form.getByRole('button', { name: 'Set password' }).click();
  await expect(form.locator('#admin-new-password-error')).toHaveText('Password must be at least 8 characters');

  await form.getByLabel('New password', { exact: true }).fill('Admin5Set');
  await form.getByLabel('Confirm new password').fill('Admin5Set');
  await form.getByRole('button', { name: 'Set password' }).click();
  await expect(page.getByRole('status').filter({ hasText: `Password updated for ${username}` })).toBeVisible();
  await logout(page);

  // Old password fails, new one works
  expect((await request.post('/api/auth/login', { data: { identifier: username, password: PASSWORD } })).status()).toBe(401);
  await login(page, username, 'Admin5Set');
});
