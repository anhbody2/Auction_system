import { expect, type Page } from '@playwright/test';

export const PASSWORD = 'Password123!';

export async function login(page: Page, identifier: string, password = PASSWORD) {
  await page.goto('/login');
  await page.getByLabel('Username or email').fill(identifier);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByTestId('current-user')).toBeVisible();
}

export async function logout(page: Page) {
  await page.getByRole('button', { name: 'Log out' }).click();
  await expect(page).toHaveURL(/\/login$/);
}
