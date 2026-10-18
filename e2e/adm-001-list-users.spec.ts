import { expect, test } from '@playwright/test';
import { login } from './helpers';

test('adm-001: admin lists users, searches for one and opens the detail page', async ({ page }) => {
  await login(page, 'admin');
  await expect(page).toHaveURL(/\/admin\/users$/);
  const table = page.getByTestId('user-table');
  await expect(table.getByTestId('user-row-alice')).toBeVisible();
  await expect(table.getByTestId('user-row-staff')).toContainText('staff');

  // Search by username
  await page.getByLabel('Search').fill('bob');
  await page.getByRole('button', { name: 'Apply' }).click();
  await expect(page).toHaveURL(/q=bob/);
  await expect(table.getByTestId('user-row-bob')).toBeVisible();
  await expect(table.getByTestId('user-row-alice')).toHaveCount(0);

  // Filter by role
  await page.getByLabel('Search').fill('');
  await page.getByLabel('Role').selectOption('staff');
  await page.getByRole('button', { name: 'Apply' }).click();
  await expect(table.locator('tbody tr')).toHaveCount(1);
  await expect(table.getByTestId('user-row-staff')).toBeVisible();

  // Open detail
  await table.getByRole('link', { name: 'staff' }).click();
  await expect(page.getByRole('heading', { name: 'staff' })).toBeVisible();
  const detail = page.getByTestId('user-detail');
  await expect(detail).toContainText('staff@example.com');
  await expect(page.getByTestId('detail-role')).toHaveText('staff');
  await expect(page.getByTestId('detail-status')).toHaveText('active');
});
