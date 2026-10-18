import { expect, test } from '@playwright/test';
import { createSoldAuction, login } from './helpers';

test('stf-004: staff see revenue and customer cards for a range with settled sales', async ({ page, request }) => {
  await createSoldAuction(request, `Revenue lamp ${Date.now().toString(36)}`);

  await login(page, 'staff');
  const today = await page.evaluate(() => {
    const d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
  });
  const filter = page.getByRole('form', { name: 'Statistics filter' });
  await filter.getByLabel('From').fill(today);
  await filter.getByLabel('To').fill(today);
  await filter.getByRole('button', { name: 'Show' }).click();

  // The page shows exactly what the API computes for the same range (the API is unit-tested against settlements)
  const tz = await page.evaluate(() => new Date().getTimezoneOffset());
  const qs = `from=${today}&to=${today}&tz=${tz}`;
  const revenue = (await (await page.request.get(`/api/staff/revenue?${qs}`)).json()).revenue;
  const customers = (await (await page.request.get(`/api/staff/customers?${qs}`)).json()).customers;
  expect(revenue.totalCommission).toBeGreaterThanOrEqual(7.5);

  const usd = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  await expect(page.getByTestId('revenue-commission')).toContainText(usd(revenue.totalCommission));
  await expect(page.getByTestId('revenue-sales')).toContainText(usd(revenue.totalSales));
  await expect(page.getByTestId('customers-bidders')).toContainText(String(customers.activeBidders));
  await expect(page.getByTestId('customers-sellers')).toContainText(String(customers.activeSellers));
  await expect(page.getByTestId('customers-registrations')).toContainText(String(customers.registrations));
  await expect(page.getByTestId('top-sellers')).toContainText('alice');
  await expect(page.getByTestId('top-bidders')).toContainText('bob');
  await expect(page.getByTestId('top-sellers').locator('li')).toHaveCount(Math.min(5, customers.topSellers.length));
  await page.getByRole('region', { name: 'Revenue and customers' }).screenshot({ path: 'test-results/stf-004-insights.png' });
});
