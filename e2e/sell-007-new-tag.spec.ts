import { expect, test, type Page } from '@playwright/test';
import { createAuctionViaApi, login } from './helpers';

const TAG = Date.now().toString(36);

const card = (page: Page, id: number) => page.getByTestId(`auction-card-${id}`);
const myRow = (page: Page, name: string) => page.getByRole('row', { name: new RegExp(name) });

test("sell-007: a new auction shows the 'New' tag on the home card, My auctions and its page until it starts", async ({ page }) => {
  await login(page, 'alice');
  const name = `Fresh Teapot ${TAG}`;
  const auction = await createAuctionViaApi(page.request, {
    name,
    startTime: new Date(Date.now() + 60_000).toISOString(),
    duration: { value: 1, unit: 'hours' },
  });
  const raw = async () => (await (await page.request.get(`/api/dev/auctions/${auction.id}/raw`)).json()).status;
  expect(await raw()).toBe('upcoming');

  // Home card
  await page.goto('/');
  await expect(card(page, auction.id).getByTestId('new-tag')).toHaveText('New');
  // My auctions
  await page.goto('/my-auctions');
  await expect(myRow(page, name).getByTestId('new-tag')).toHaveText('New');
  // Auction page
  await page.goto(`/auctions/${auction.id}`);
  await expect(page.getByTestId('new-tag')).toHaveText('New');

  // The start comes 3 s from now: the open page drops the tag live when the countdown reaches zero.
  await page.request.post(`/api/dev/auctions/${auction.id}/start-in`, { data: { seconds: 3 } });
  await page.reload();
  await expect(page.getByTestId('new-tag')).toHaveText('New');
  await expect(page.getByTestId('new-tag')).toHaveCount(0, { timeout: 10_000 });
  await expect(page.getByTestId('status')).toHaveText('active');
  // The start job (every 1 s in e2e) updates the stored status.
  await expect.poll(raw, { timeout: 15_000 }).toBe('active');

  // Gone from the API and the other two pages as well.
  const api = await (await page.request.get(`/api/auctions/${auction.id}`)).json();
  expect(api.auction).toMatchObject({ status: 'active', isNew: false });
  await page.goto('/');
  await expect(card(page, auction.id)).toBeVisible();
  await expect(card(page, auction.id).getByTestId('new-tag')).toHaveCount(0);
  await page.goto('/my-auctions');
  await expect(myRow(page, name)).toBeVisible();
  await expect(myRow(page, name).getByTestId('new-tag')).toHaveCount(0);
});
