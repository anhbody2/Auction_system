import { expect, request as playwrightRequest, test, type APIRequestContext } from '@playwright/test';
import { PASSWORD, createAuctionViaApi, login } from './helpers';

const TAG = `bp${Date.now().toString(36)}`;

async function apiAs(baseURL: string | undefined, identifier: string): Promise<APIRequestContext> {
  const ctx = await playwrightRequest.newContext({ baseURL });
  expect((await ctx.post('/api/auth/login', { data: { identifier, password: PASSWORD } })).status()).toBe(200);
  return ctx;
}

test('ui-1b.2: bid panel countdown, quick buttons, Enter to bid, inline errors, live outbid notice', async ({ page, browser, baseURL }) => {
  const alice = await apiAs(baseURL, 'alice');
  const auction = await createAuctionViaApi(alice, { name: `Panel clock ${TAG}`, initialPrice: 100 });
  await alice.dispose();

  // Guest: header and a log-in button instead of the form
  await page.goto(`/auctions/${auction.id}`);
  await expect(page.getByTestId('current-price')).toHaveText('$100.00');
  await expect(page.getByRole('link', { name: 'Log in to bid' })).toBeVisible();
  await expect(page.getByTestId('bid-input')).toHaveCount(0);

  await login(page, 'bob');
  await expect(async () => {
    await page.goto(`/auctions/${auction.id}`);
    await expect(page.getByTestId('bid-input')).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 15_000 });

  // Countdown pill with seconds, ticking
  const countdown = page.getByTestId('countdown');
  await expect(countdown).toHaveText(/^Ends in \d+m \d+s$/);
  const first = await countdown.textContent();
  await expect(countdown).not.toHaveText(first!, { timeout: 3000 });
  await expect(page.getByTestId('price-change')).toHaveCount(0);
  await expect(page.getByTestId('next-min-bid')).toHaveText('$100.00');

  // No bids: quick amounts start at the starting price; a quick button fills the input and the button label
  await expect(page.getByTestId('quick-bid-1')).toHaveText('$100.00');
  await expect(page.getByTestId('quick-bid-5')).toHaveText('$140.00');
  await page.getByTestId('quick-bid-2').click();
  await expect(page.getByTestId('bid-input')).toHaveValue('110');
  await expect(page.getByTestId('place-bid')).toHaveText('Place bid $110.00');

  // Client pre-checks with the server wording: below minimum, over available credit
  await page.getByTestId('bid-input').fill('99');
  await page.getByTestId('place-bid').click();
  await expect(page.getByTestId('bid-error')).toHaveText('Bid must be at least $100.00');
  await page.getByTestId('bid-input').fill('9999999');
  await expect(page.getByTestId('bid-input')).toHaveValue('9,999,999');
  await page.getByTestId('place-bid').click();
  await expect(page.getByTestId('bid-error')).toHaveText('Bid exceeds your available credit');

  // Enter places the bid; success message while leading; % change appears
  await page.getByTestId('bid-input').fill('120');
  await page.getByTestId('bid-input').press('Enter');
  await expect(page.getByTestId('bid-ok')).toHaveText("You're the highest bidder.");
  await expect(page.getByTestId('bid-error')).toHaveCount(0);
  await expect(page.getByTestId('current-price')).toHaveText('$120.00');
  await expect(page.getByTestId('price-change')).toHaveText('+20%');
  await expect(page.getByTestId('bid-count')).toHaveText('1');
  // Quick amounts now step from the highest bid with the $10 increment
  await expect(page.getByTestId('quick-bid-1')).toHaveText('$130.00');
  await expect(page.getByTestId('quick-bid-5')).toHaveText('$170.00');

  // Another bidder outbids: the success message becomes an outbid notice without a reload
  await page.evaluate(() => ((window as unknown as { __ui1b2: boolean }).__ui1b2 = true));
  const carolCtx = await browser.newContext();
  const carol = await carolCtx.newPage();
  await login(carol, 'carol');
  await carol.goto(`/auctions/${auction.id}`);
  await carol.getByTestId('quick-bid-1').click();
  await carol.getByTestId('place-bid').click();
  await expect(carol.getByTestId('bid-ok')).toBeVisible();
  await expect(page.getByTestId('outbid-notice')).toHaveText("You've been outbid.");
  await expect(page.getByTestId('bid-ok')).toHaveCount(0);
  await expect(page.getByTestId('current-price')).toHaveText('$130.00');
  expect(await page.evaluate(() => (window as unknown as { __ui1b2?: boolean }).__ui1b2)).toBe(true);
  await carolCtx.close();

  // ?bid=1 focuses the input
  await page.goto(`/auctions/${auction.id}?bid=1`);
  await expect(page.getByTestId('bid-input')).toBeFocused();
});

test('ui-1b.2: a raised own bid is not refused by the client for credit it already holds; 375px fits', async ({ page, baseURL }) => {
  const alice = await apiAs(baseURL, 'alice');
  const auction = await createAuctionViaApi(alice, { name: `Panel raise ${TAG}`, initialPrice: 10 });
  await alice.dispose();
  await login(page, 'carol');
  // After login(): it waits for the username, which is hidden next to the avatar at 375px.
  await page.setViewportSize({ width: 375, height: 800 });
  await expect(async () => {
    await page.goto(`/auctions/${auction.id}`);
    await expect(page.getByTestId('bid-input')).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 15_000 });
  const me = (await (await page.request.get('/api/auth/me')).json()).user as { creditBalance: number; heldBalance: number };
  const available = me.creditBalance - me.heldBalance;
  // Bid ~60% of the available credit, then raise by one step: the raise is more than the credit left free
  // (~40%) but fits once the old hold is released, as the server does.
  const first = Math.floor(available * 0.6);
  test.skip(first < 30, 'carol needs some available credit');
  await page.getByTestId('bid-input').fill(String(first));
  await page.getByTestId('place-bid').click();
  await expect(page.getByTestId('bid-ok')).toBeVisible();
  // One ladder step up (bid-004).
  const inc = first < 50 ? 1 : first < 100 ? 2.5 : first < 1000 ? 10 : 100;
  await page.getByTestId('bid-input').fill(String(first + inc));
  await page.getByTestId('place-bid').click();
  await expect(page.getByTestId('bid-error')).toHaveCount(0);
  await expect(page.getByTestId('bid-ok')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
});
