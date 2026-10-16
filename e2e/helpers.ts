import { expect, type APIRequestContext, type Page } from '@playwright/test';

export const PASSWORD = 'Password123!';

export async function login(page: Page, identifier: string, password = PASSWORD) {
  await page.goto('/login');
  await page.getByLabel('Username or email').fill(identifier);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByTestId('current-user')).toBeVisible();
}

/** Creates a fresh account through the API (so tests that mutate credentials don't touch seed users). */
export async function registerViaApi(request: APIRequestContext, username: string, password = PASSWORD) {
  const res = await request.post('/api/auth/register', {
    data: {
      fullName: `${username} Test`,
      username,
      email: `${username}@example.com`,
      phone: '0900000000',
      password,
      confirmPassword: password,
    },
  });
  expect(res.status()).toBe(201);
}

export async function logout(page: Page) {
  await page.getByRole('button', { name: 'Log out' }).click();
  await expect(page).toHaveURL(/\/login$/);
}
