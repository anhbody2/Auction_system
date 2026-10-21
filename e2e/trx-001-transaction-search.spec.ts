import { expect, test, type Page } from '@playwright/test';
import { createAuctionViaApi, login, logout, registerViaApi } from './helpers';

const TAG = Date.now().toString(36);

const pad = (n: number) => String(n).padStart(2, '0');
const localDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return localDay(d);
};

const rowIds = (page: Page) => page.locator('[data-testid^="tx-"] td:first-child').allTextContents();

async function search(page: Page, fields: Partial<Record<'Name' | 'Transaction ID' | 'Min amount' | 'Max amount' | 'From', string>>) {
  const form = page.getByRole('search', { name: 'Search transactions' });
  await form.getByRole('button', { name: 'Clear' }).click();
  for (const [label, value] of Object.entries(fields)) await form.getByLabel(label, { exact: true }).fill(value);
  await form.getByRole('button', { name: 'Search' }).click();
}

test('trx-001: a customer searches transactions by id, name, amount range and all together; old dates are refused', async ({ page }) => {
  const seller = `trx_seller_${TAG}`;
  const bidder = `trx_bidder_${TAG}`;
  await registerViaApi(page.request, seller);
  await registerViaApi(page.request, bidder);
  await login(page, seller);
  const lamp = `Search Lamp ${TAG}`;
  const auction = await createAuctionViaApi(page.request, { name: lamp, initialPrice: 40 });
  await logout(page);

  await login(page, bidder);
  const tx = async (path: string, amount: number) =>
    (await (await page.request.post(path, { data: { amount } })).json()) as { transactions: { id: number; amount: number; transactionType: string }[] };
  await tx('/api/credit/topup', 50);
  await tx('/api/credit/topup', 200);
  const last = await tx('/api/credit/topup', 75);
  expect((await page.request.post(`/api/auctions/${auction.id}/bids`, { data: { amount: 40 } })).status()).toBe(201);
  const ledger = last.transactions;
  const id200 = String(ledger.find((t) => Number(t.amount) === 200)!.id);
  const id75 = String(ledger.find((t) => Number(t.amount) === 75)!.id);

  await page.goto('/credit');
  // Default: last 30 days, all 4 rows (3 top-ups + the bid hold)
  await expect(page.getByTestId('tx-total')).toHaveText('4 transactions · page 1 of 1');
  const form = page.getByRole('search', { name: 'Search transactions' });
  await expect(form.getByLabel('From', { exact: true })).toHaveValue(daysAgo(30));
  await expect(form.getByLabel('From', { exact: true })).toHaveAttribute('min', daysAgo(30));

  // By id
  await search(page, { 'Transaction ID': id200 });
  await expect(page.getByTestId('tx-total')).toHaveText('1 transaction · page 1 of 1');
  expect(await rowIds(page)).toEqual([id200]);

  // By name (auction name)
  await search(page, { Name: lamp });
  await expect(page.getByTestId('tx-total')).toHaveText('1 transaction · page 1 of 1');
  await expect(page.getByTestId('transactions')).toContainText('hold');

  // By amount range: $60 - $250 -> the 200 and 75 top-ups
  await search(page, { 'Min amount': '60', 'Max amount': '250' });
  await expect(page.getByTestId('tx-total')).toHaveText('2 transactions · page 1 of 1');
  expect((await rowIds(page)).sort()).toEqual([id200, id75].sort());

  // Min only (blank max = no upper limit)
  await search(page, { 'Min amount': '100' });
  await expect(page.getByTestId('tx-total')).toHaveText('1 transaction · page 1 of 1');

  // All three together
  await search(page, { Name: 'top up', 'Min amount': '60', 'Max amount': '250', 'Transaction ID': id75 });
  await expect(page.getByTestId('tx-total')).toHaveText('1 transaction · page 1 of 1');
  expect(await rowIds(page)).toEqual([id75]);
  await search(page, { Name: lamp, 'Transaction ID': id75 });
  await expect(page.getByTestId('tx-empty')).toHaveText('No transactions match.');

  // Out-of-range date and a min below $1: messages, no search
  await search(page, { From: daysAgo(40) });
  await expect(form.getByRole('alert')).toHaveText('Date must be within the last 30 days');
  await form.getByRole('button', { name: 'Clear' }).click();
  await form.getByLabel('Min amount', { exact: true }).fill('0.5');
  await form.getByRole('button', { name: 'Search' }).click();
  await expect(form.getByRole('alert')).toHaveText('Minimum amount must be at least $1');

  // Clear resets to the default listing
  await form.getByRole('button', { name: 'Clear' }).click();
  await expect(form.getByRole('alert')).toHaveCount(0);
  await expect(page.getByTestId('tx-total')).toHaveText('4 transactions · page 1 of 1');
});
