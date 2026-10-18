import { expect, test } from '@playwright/test';
import { createSoldAuction, login } from './helpers';

const localIso = (offsetDays: number) => {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
};

test('stf-003: charts show auctions per day by status and sale value; empty range shows the empty state', async ({ page, request }) => {
  await createSoldAuction(request, `Chart lamp ${Date.now().toString(36)}`);

  await login(page, 'staff');
  const filter = page.getByRole('form', { name: 'Statistics filter' });
  // Fix the browser clock's notion of "today" to the test process: same machine, same zone.
  await filter.getByLabel('From').fill(localIso(-6));
  await filter.getByLabel('To').fill(localIso(0));
  await filter.getByLabel('Status').selectOption('all');
  await filter.getByRole('button', { name: 'Show' }).click();

  const statusChart = page.getByTestId('chart-status');
  await expect(statusChart).toBeVisible();
  await expect(statusChart.getByRole('list', { name: /legend/ })).toHaveText(/Upcoming.*Active.*Ended.*Cancelled/);
  // 7 days -> 7 focusable day targets; today's column has an Ended count of at least 1
  const dayTargets = statusChart.getByRole('button');
  await expect(dayTargets).toHaveCount(7);
  const todayTarget = dayTargets.last();
  await expect(todayTarget).toHaveAttribute('aria-label', /Ended [1-9]\d*/);
  await todayTarget.hover();
  await expect(page.getByTestId('chart-status-tooltip')).toContainText('Ended');

  // Sale value chart: today's value includes the $150 sale
  const valueTargets = page.getByTestId('chart-value').getByRole('button');
  await expect(valueTargets.last()).toHaveAttribute('aria-label', /Sale value \$\d/);
  const todaysValue = await valueTargets.last().getAttribute('aria-label');
  expect(todaysValue).not.toMatch(/Sale value \$0$/);

  // Counts in the chart add up to the list count
  const chartTotal = await statusChart.locator('details tbody tr').evaluateAll((rows) =>
    rows.reduce((sum, r) => sum + [...r.querySelectorAll('td')].slice(1).reduce((s, td) => s + Number(td.textContent), 0), 0),
  );
  await expect(page.getByTestId('stat-count')).toHaveText(new RegExp(`^${chartTotal} auctions?$`));

  await page.getByTestId('chart-status').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/stf-003-charts.png', fullPage: true });

  // A range with no auctions shows the empty state instead of charts
  await filter.getByLabel('From').fill('2001-01-01');
  await filter.getByLabel('To').fill('2001-01-07');
  await filter.getByRole('button', { name: 'Show' }).click();
  await expect(page.getByTestId('chart-empty')).toBeVisible();
  await expect(page.getByTestId('chart-status')).toHaveCount(0);
});
