import { expect, test } from '@playwright/test';
import { createAuctionViaApi, login, logout } from './helpers';

test('guest-002: guest sees live, upcoming and just-completed auctions with countdowns; only logged-in users can bid', async ({ page }) => {
  // Arrange as alice / bob
  await login(page, 'alice');
  const soon = (m: number) => new Date(Date.now() + m * 60_000).toISOString();
  const live = await createAuctionViaApi(page.request, { name: 'Home Live Kettle', initialPrice: 30 });
  const upcoming = await createAuctionViaApi(page.request, { name: 'Home Soon Kettle', startTime: soon(60), duration: { value: 1, unit: 'hours' } });
  const done = await createAuctionViaApi(page.request, { name: 'Home Done Kettle', initialPrice: 30 });
  await logout(page);
  await login(page, 'bob');
  await page.request.post(`/api/auctions/${done.id}/bids`, { data: { amount: 30 } });
  await page.request.post(`/api/dev/auctions/${done.id}/expire`);
  await logout(page);

  // 1. Homepage as a guest
  await page.goto('/');
  await expect(page.getByTestId('current-user')).toHaveCount(0);

  // 2-3. All auctions present in their sections, with time info
  const liveCard = page.getByTestId('section-live').getByTestId(`auction-card-${live.id}`);
  await expect(liveCard).toContainText('Home Live Kettle');
  await expect(liveCard.getByTestId('countdown')).toHaveText(/\d+m \d+s left|\d+h \d+m \d+s left/);
  const first = await liveCard.getByTestId('countdown').textContent();
  await expect(liveCard.getByTestId('countdown')).not.toHaveText(first!, { timeout: 3000 }); // ticking

  const soonCard = page.getByTestId('section-upcoming').getByTestId(`auction-card-${upcoming.id}`);
  await expect(soonCard.getByTestId('countdown')).toHaveText(/^Starts in /);

  const doneCard = page.getByTestId('section-completed').getByTestId(`auction-card-${done.id}`);
  await expect(doneCard.getByTestId('countdown')).toHaveText(/^Ended /);
  await expect(doneCard).toContainText('Won by bob');
  await expect(doneCard).toContainText('$30.00');

  // Just-completed auction is view-only
  await doneCard.click();
  await expect(page.getByText('This auction has ended and no longer accepts bids.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Place bid' })).toHaveCount(0);

  // 4. Only logged-in users can bid
  await page.goto(`/auctions/${live.id}`);
  await expect(page.getByRole('button', { name: 'Place bid' })).toHaveCount(0);
  const guestBid = await page.request.post(`/api/auctions/${live.id}/bids`, { data: { amount: 30 } });
  expect(guestBid.status()).toBe(401);
  await page.getByRole('link', { name: 'Log in to bid' }).click();
  await page.getByLabel('Username or email').fill('carol');
  await page.getByLabel('Password', { exact: true }).fill('Password123!');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(new RegExp(`/auctions/${live.id}$`));
  await page.getByRole('button', { name: 'Place bid' }).click();
  await expect(page.getByTestId('current-price')).toHaveText('$30.00');
});
