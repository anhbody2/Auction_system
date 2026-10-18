import { expect, test, type Page } from '@playwright/test';
import { logout, PASSWORD } from './helpers';

async function loginOnPage(page: Page, identifier: string) {
  await page.goto('/login');
  await page.getByLabel('Username or email').fill(identifier);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByTestId('current-user')).toHaveText(identifier);
}

test('sec-001: customer, staff and admin use one login page and land on their own home', async ({ page }) => {
  const nav = page.locator('header nav');

  // Staff -> statistics page, only staff links
  await loginOnPage(page, 'staff');
  await expect(page).toHaveURL(/\/staff\/statistics$/);
  await expect(page.getByRole('heading', { name: 'Auction statistics' })).toBeVisible();
  await expect(page.getByTestId('current-role')).toHaveText('staff');
  await expect(nav.getByRole('link', { name: 'Statistics' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Users' })).toHaveCount(0);
  await expect(nav.getByRole('link', { name: 'My Biddings' })).toHaveCount(0);
  await logout(page);

  // Admin -> user management, only admin links
  await loginOnPage(page, 'admin');
  await expect(page).toHaveURL(/\/admin\/users$/);
  await expect(page.getByRole('heading', { name: 'User management' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Users' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Statistics' })).toHaveCount(0);
  await logout(page);

  // Customer -> existing dashboard, no Staff or Admin links
  await loginOnPage(page, 'carol');
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('heading', { name: /^Welcome, / })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Dashboard' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Statistics' })).toHaveCount(0);
  await expect(nav.getByRole('link', { name: 'Users' })).toHaveCount(0);

  // A customer opening a staff or admin URL sees the not-allowed page
  await page.goto('/staff/statistics');
  await expect(page.getByTestId('not-allowed')).toBeVisible();
  await page.goto('/admin/users');
  await expect(page.getByTestId('not-allowed')).toBeVisible();
});
