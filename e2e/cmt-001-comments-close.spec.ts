import { expect, test } from '@playwright/test';
import { createAuctionViaApi, login, logout } from './helpers';

const inMinutes = (m: number) => new Date(Date.now() + m * 60_000).toISOString();

test('cmt-001: comments close when the auction ends; earlier comments stay visible', async ({ page, browser }) => {
  await login(page, 'alice');
  const auction = await createAuctionViaApi(page.request, { name: 'Talkative Radio' });
  await logout(page);

  // bob comments on the active auction
  await login(page, 'bob');
  await page.goto(`/auctions/${auction.id}`);
  await page.getByLabel('Write a message').fill('Does the radio still work?');
  await page.getByRole('button', { name: 'Post message' }).click();
  await expect(page.getByTestId('messages')).toContainText('Does the radio still work?');
  await expect(page.getByTestId('comments-closed')).toHaveCount(0);

  // A guest watching the page at the same time
  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();
  await guest.goto(`/auctions/${auction.id}`);
  await expect(guest.getByRole('link', { name: 'Log in to comment' })).toBeVisible();
  await expect(guest.getByTestId('messages')).toContainText('Does the radio still work?');

  let loads = 0;
  page.on('load', () => loads++);

  // The auction ends while both pages are open: the box closes without a reload
  await page.request.post(`/api/dev/auctions/${auction.id}/expire`);
  await expect(page.getByTestId('comments-closed')).toHaveText('Comments are closed', { timeout: 15_000 });
  await expect(page.getByLabel('Write a message')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Post message' })).toHaveCount(0);
  await expect(page.getByTestId('messages')).toContainText('Does the radio still work?');
  expect(loads).toBe(0);

  await expect(guest.getByTestId('comments-closed')).toHaveText('Comments are closed', { timeout: 15_000 });
  await expect(guest.getByRole('link', { name: 'Log in to comment' })).toHaveCount(0);
  await expect(guest.getByTestId('messages')).toContainText('Does the radio still work?');
  // And after a fresh load
  await guest.reload();
  await expect(guest.getByTestId('comments-closed')).toBeVisible();
  await expect(guest.getByTestId('messages')).toContainText('Does the radio still work?');
  await guestContext.close();

  // The server refuses a late comment
  const late = await page.request.post(`/api/auctions/${auction.id}/messages`, { data: { content: 'Too late?' } });
  expect(late.status()).toBe(400);
  expect((await late.json()).error).toBe('Comments are closed for this auction');
});

test('cmt-001: comments are open on an upcoming auction', async ({ page }) => {
  await login(page, 'alice');
  const auction = await createAuctionViaApi(page.request, { name: 'Future Radio', startTime: inMinutes(60), duration: { value: 1, unit: 'hours' } });
  await logout(page);

  await login(page, 'carol');
  await page.goto(`/auctions/${auction.id}`);
  await expect(page.getByTestId('status')).toHaveText('upcoming');
  await expect(page.getByTestId('comments-closed')).toHaveCount(0);
  await page.getByLabel('Write a message').fill('When does bidding start?');
  await page.getByRole('button', { name: 'Post message' }).click();
  await expect(page.getByTestId('messages')).toContainText('When does bidding start?');
});
