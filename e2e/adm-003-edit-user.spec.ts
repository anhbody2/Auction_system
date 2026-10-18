import { expect, test } from '@playwright/test';
import { login, registerViaApi } from './helpers';

test('adm-003: admin edits a user role and the list shows it; own role is fixed', async ({ page, request }) => {
  const username = `edit_${Date.now().toString(36)}`;
  await registerViaApi(request, username);

  await login(page, 'admin');
  await page.getByLabel('Search').fill(username);
  await page.getByRole('button', { name: 'Apply' }).click();
  await expect(page.getByTestId(`user-row-${username}`)).toContainText('customer');
  await page.getByRole('link', { name: username }).click();

  const form = page.getByRole('form', { name: 'Edit user' });
  await form.getByLabel('Full name').fill('Edited Name');
  await form.getByLabel('Role').selectOption('staff');
  await form.getByLabel('Status').selectOption('active');
  await form.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'User updated' })).toBeVisible();
  await expect(page.getByTestId('detail-role')).toHaveText('staff');
  await expect(page.getByTestId('user-detail')).toContainText('Edited Name');

  await page.getByRole('link', { name: 'All users' }).click();
  await page.getByLabel('Search').fill(username);
  await page.getByRole('button', { name: 'Apply' }).click();
  await expect(page.getByTestId(`user-row-${username}`).getByTestId('user-role')).toHaveText('staff');

  // Editing yourself: role and status are disabled
  await page.getByLabel('Search').fill('admin');
  await page.getByRole('button', { name: 'Apply' }).click();
  await page.getByTestId('user-row-admin').getByRole('link', { name: 'admin' }).click();
  await expect(form.getByLabel('Role')).toBeDisabled();
  await expect(form.getByLabel('Status')).toBeDisabled();
});
