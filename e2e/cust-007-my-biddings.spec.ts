import { expect, test } from '@playwright/test';
import { PASSWORD, createAuctionViaApi, login, logout, registerViaApi } from './helpers';

test('cust-007: bidder sees each auction with latest bid, highest bid and outcome', async ({ page, browser }) => {
  // Fresh bidder jack with credit, and a rival bidder (bob) in a separate context
  await registerViaApi(page.request, 'jack');
  await login(page, 'jack');
  await page.request.post('/api/credit/topup', { data: { amount: 1000 } });
  await logout(page);

  const rival = await browser.newContext({ baseURL: 'http://localhost:5180' });
  await rival.request.post('/api/auth/login', { data: { identifier: 'bob', password: PASSWORD } });

  await login(page, 'alice');
  const mk = (name: string, extra = {}) => createAuctionViaApi(page.request, { name, initialPrice: 100, minIncrement: 10, ...extra });
  const winning = await mk('Jack Winning');
  const outbid = await mk('Jack Outbid');
  const won = await mk('Jack Won');
  const lost = await mk('Jack Lost');
  const cancelled = await mk('Jack Cancelled');
  await logout(page);

  await login(page, 'jack');
  const bid = (id: number, amount: number) => page.request.post(`/api/auctions/${id}/bids`, { data: { amount } });
  const rivalBid = (id: number, amount: number) => rival.request.post(`/api/auctions/${id}/bids`, { data: { amount } });
  await bid(winning.id, 100);
  await bid(outbid.id, 100);
  await rivalBid(outbid.id, 150);
  await bid(won.id, 100);
  await bid(won.id, 130); // raise own bid: latest bid should be 130
  await bid(lost.id, 100);
  await rivalBid(lost.id, 110);
  await bid(cancelled.id, 100);
  await page.request.post(`/api/dev/auctions/${won.id}/expire`);
  await page.request.post(`/api/dev/auctions/${lost.id}/expire`);
  await rival.close();
  await logout(page);

  await login(page, 'alice');
  expect((await page.request.post(`/api/auctions/${cancelled.id}/cancel`)).status()).toBe(200);
  await logout(page);

  await login(page, 'jack');
  await page.getByRole('link', { name: 'My Biddings' }).click();
  const table = page.getByTestId('my-bids');
  await expect(table.getByRole('row')).toHaveCount(6);

  const expectRow = async (id: number, mine: string, highest: string, status: string) => {
    const row = page.getByTestId(`my-bid-${id}`);
    await expect(row.getByTestId('my-latest')).toHaveText(mine);
    await expect(row.getByTestId('highest')).toHaveText(highest);
    await expect(row.getByTestId('my-status')).toHaveText(status);
  };
  await expectRow(winning.id, '$100.00', '$100.00', 'winning');
  await expectRow(outbid.id, '$100.00', '$150.00', 'outbid');
  await expectRow(won.id, '$130.00', '$130.00', 'won');
  await expectRow(lost.id, '$100.00', '$110.00', 'lost');
  await expectRow(cancelled.id, '$100.00', '$100.00', 'cancelled');

  await page.getByRole('tab', { name: /Won/ }).click();
  await expect(table.getByRole('row')).toHaveCount(2);
  await expect(table).toContainText('Jack Won');

  // Won auction shows jack as winner
  await table.getByRole('link', { name: 'Jack Won' }).click();
  await expect(page.getByTestId('winner')).toHaveText('jack');
});
