import { expect, test, type Page, type Request } from '@playwright/test';
import { createAuctionViaApi, login, logout, registerViaApi, topUpViaApi } from './helpers';

/** Credit refetches the page could make: the user (/api/auth/me) or the credit summary. Streams are not counted. */
const isCreditFetch = (r: Request) => {
  const path = new URL(r.url()).pathname;
  return r.method() === 'GET' && !path.endsWith('/events') && (path === '/api/auth/me' || path.startsWith('/api/me') || path === '/api/credit');
};

async function signIn(page: Page, username: string) {
  await registerViaApi(page.request, username);
  await login(page, username);
  await topUpViaApi(page.request, 1000);
  // A full load, so the header picks up the top-up.
  await page.goto('/dashboard');
  await expect(page.getByTestId('header-credit')).toHaveText('$1,000.00');
}

test('crd-003: credit stays put while bidding; locked credit follows bids and outbids; credit changes when the auction finishes', async ({ page, browser }) => {
  await registerViaApi(page.request, 'cs_seller');
  await login(page, 'cs_seller');
  const auction = await createAuctionViaApi(page.request, { name: 'Stable Credit Lamp', initialPrice: 100 });
  await logout(page);

  const bobContext = await browser.newContext();
  const carolContext = await browser.newContext();
  const bob = await bobContext.newPage();
  const carol = await carolContext.newPage();
  await signIn(bob, 'cs_bob');
  await signIn(carol, 'cs_carol');

  const bobFetches: string[] = [];
  bob.on('request', (r) => isCreditFetch(r) && bobFetches.push(r.url()));
  let carolLoads = 0;
  let bobLoads = 0;

  // bob bids $100: locked goes up at once, credit stays, nothing is refetched
  await bob.goto(`/auctions/${auction.id}`);
  await expect(bob.getByTestId('current-price')).toHaveText('$100.00'); // starting price
  bob.on('load', () => bobLoads++);
  bobFetches.length = 0;
  await bob.getByRole('button', { name: 'Place bid' }).click();
  await expect(bob.getByTestId('bid-count')).toHaveText('1');
  await expect(bob.getByTestId('header-locked')).toHaveText('$100.00');
  await expect(bob.getByTestId('header-credit')).toHaveText('$1,000.00');
  // Client-side navigation to the dashboard (no page load)
  await bob.getByRole('link', { name: 'Dashboard' }).click();
  await expect(bob.getByTestId('dashboard-credit')).toHaveText('$1,000.00');
  await expect(bob.getByTestId('dashboard-locked')).toHaveText('$100.00');
  expect(bobFetches).toEqual([]);

  // carol outbids bob: bob's locked credit drops without a reload, his credit stays
  await carol.goto(`/auctions/${auction.id}`);
  await expect(carol.getByTestId('next-min-bid')).toHaveText('$110.00');
  carol.on('load', () => carolLoads++);
  await carol.getByRole('button', { name: 'Place bid' }).click();
  await expect(carol.getByTestId('header-locked')).toHaveText('$110.00');
  await expect(carol.getByTestId('header-credit')).toHaveText('$1,000.00');
  await expect(bob.getByTestId('header-locked')).toHaveText('$0.00');
  await expect(bob.getByTestId('dashboard-locked')).toHaveText('$0.00');
  await expect(bob.getByTestId('header-credit')).toHaveText('$1,000.00');
  await expect(bob.getByTestId('dashboard-credit')).toHaveText('$1,000.00');
  expect(bobFetches).toEqual([]);

  // The auction finishes (close job): carol's credit drops by the price without a manual reload
  await carol.request.post(`/api/dev/auctions/${auction.id}/expire`);
  await expect(carol.getByTestId('header-credit')).toHaveText('$890.00', { timeout: 15_000 });
  await expect(carol.getByTestId('header-locked')).toHaveText('$0.00');
  // bob lost: his figures are fetched again and stay the same
  await expect.poll(() => bobFetches.length, { timeout: 15_000 }).toBeGreaterThan(0);
  await expect(bob.getByTestId('header-credit')).toHaveText('$1,000.00');
  await expect(bob.getByTestId('header-locked')).toHaveText('$0.00');

  expect(carolLoads).toBe(0);
  expect(bobLoads).toBe(0);
  await bobContext.close();
  await carolContext.close();
});
