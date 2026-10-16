import { expect, test } from '@playwright/test';
import { login } from './helpers';

test('cust-002: customer views, edits and persists profile; invalid email rejected', async ({ page }) => {
  await login(page, 'carol');
  await page.getByRole('link', { name: 'Profile' }).click();

  // Current details displayed
  await expect(page.getByLabel('Full name')).toHaveValue('Carol Customer');
  await expect(page.getByLabel('Email')).toHaveValue('carol@example.com');

  // Edit and save
  await page.getByLabel('Full name').fill('Carol Edited');
  await page.getByLabel('Phone').fill('+84 900 111 222');
  await page.getByLabel('Address').fill('42 Auction Ave');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Profile saved' })).toBeVisible();

  // Reload -> persisted
  await page.reload();
  await expect(page.getByLabel('Full name')).toHaveValue('Carol Edited');
  await expect(page.getByLabel('Phone')).toHaveValue('+84 900 111 222');
  await expect(page.getByLabel('Address')).toHaveValue('42 Auction Ave');

  // Malformed email -> validation error, nothing saved
  await page.getByLabel('Email').fill('carol-at-example');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Enter a valid email address')).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Email')).toHaveValue('carol@example.com');
});
