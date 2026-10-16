import { expect, test } from '@playwright/test';
import { createAuctionViaApi, login, logout } from './helpers';

test('bid-002: bidder posts a message visible to others; empty message rejected', async ({ page }) => {
  await login(page, 'alice');
  const auction = await createAuctionViaApi(page.request, { name: 'Chatty Guitar' });
  await logout(page);

  await login(page, 'bob');
  await page.goto(`/auctions/${auction.id}`);

  // Empty rejected (client) and whitespace rejected (server)
  await page.getByRole('button', { name: 'Post message' }).click();
  await expect(page.getByRole('alert')).toHaveText('Message cannot be empty');
  const blank = await page.request.post(`/api/auctions/${auction.id}/messages`, { data: { content: '   ' } });
  expect(blank.status()).toBe(400);

  // Post -> appears with author and time
  await page.getByLabel('Write a message').fill('Does it come with a case?');
  await page.getByRole('button', { name: 'Post message' }).click();
  const item = page.getByTestId('messages').getByRole('listitem').first();
  await expect(item).toContainText('bob');
  await expect(item).toContainText('Does it come with a case?');
  await expect(item).toContainText(new Date().getFullYear().toString());
  await logout(page);

  // Another customer sees it
  await login(page, 'carol');
  await page.goto(`/auctions/${auction.id}`);
  await expect(page.getByTestId('messages')).toContainText('Does it come with a case?');
});
