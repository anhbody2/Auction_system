import { expect, test } from '@playwright/test';
import { PASSWORD, createAuctionViaApi, login, registerViaApi } from './helpers';

test('adm-004: admin deletes a user through the confirm step; a seller with an open auction is refused', async ({ page, request }) => {
  const username = `del_${Date.now().toString(36)}`;
  await registerViaApi(request, username);

  // alice sells an open auction, so she cannot be deleted
  await request.post('/api/auth/login', { data: { identifier: 'alice', password: PASSWORD } });
  await createAuctionViaApi(request);
  await request.post('/api/auth/logout');

  await login(page, 'admin');
  const row = page.getByTestId(`user-row-${username}`);
  await expect(row).toBeVisible();

  // Cancelling the confirmation keeps the user
  await row.getByRole('button', { name: `Delete ${username}` }).click();
  await row.getByRole('button', { name: 'Keep' }).click();
  await expect(row).toBeVisible();

  // Confirming deletes and the row disappears
  await row.getByRole('button', { name: `Delete ${username}` }).click();
  await row.getByRole('button', { name: 'Yes, delete' }).click();
  await expect(page.getByRole('status').filter({ hasText: `User ${username} deleted` })).toBeVisible();
  await expect(row).toHaveCount(0);

  // Refused with a reason
  const alice = page.getByTestId('user-row-alice');
  await alice.getByRole('button', { name: 'Delete alice' }).click();
  await alice.getByRole('button', { name: 'Yes, delete' }).click();
  await expect(page.getByRole('status').filter({ hasText: /Cannot delete alice: they have \d+ open auction/ })).toBeVisible();
  await expect(alice).toBeVisible();

  // No delete button on your own row
  await expect(page.getByTestId('user-row-admin').getByRole('button', { name: /Delete/ })).toHaveCount(0);

  // The deleted user cannot log in
  const res = await request.post('/api/auth/login', { data: { identifier: username, password: PASSWORD } });
  expect(res.status()).toBe(401);
});
