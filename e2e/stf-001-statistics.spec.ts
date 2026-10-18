import { expect, test } from '@playwright/test';
import { createSoldAuction, login } from './helpers';

test('stf-001: staff filters auctions by date range and status and sees matching rows and count', async ({ page, request }) => {
  const name = `Stats lamp ${Date.now().toString(36)}`;
  const sold = await createSoldAuction(request, name);

  await login(page, 'staff');
  await expect(page).toHaveURL(/\/staff\/statistics$/);
  const filter = page.getByRole('form', { name: 'Statistics filter' });
  const today = await page.evaluate(() => {
    const d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
  });
  await filter.getByLabel('From').fill(today);
  await filter.getByLabel('To').fill(today);
  await filter.getByLabel('Status').selectOption('ended');
  await filter.getByRole('button', { name: 'Show' }).click();

  const row = page.getByTestId(`stat-row-${sold.id}`);
  await expect(row).toContainText(name);
  await expect(row).toContainText('alice');
  await expect(row).toContainText('bob');
  await expect(row).toContainText('$150.00');
  await expect(row).toContainText('$7.50');

  // The count matches the rows shown, and every row is ended
  const rows = page.getByTestId('stat-table').locator('tbody tr');
  const n = await rows.count();
  await expect(page.getByTestId('stat-count')).toHaveText(`${n} auction${n === 1 ? '' : 's'}`);
  await expect(page.getByTestId('stat-summary')).toContainText(`Total (${n})`);
  await expect(page.getByTestId('stat-table').locator('tbody .badge')).toHaveText(Array(n).fill('ended'));

  // Another status excludes it
  await filter.getByLabel('Status').selectOption('cancelled');
  await filter.getByRole('button', { name: 'Show' }).click();
  await expect(row).toHaveCount(0);

  // From after To is rejected
  await filter.getByLabel('From').fill('2030-01-02');
  await filter.getByLabel('To').fill('2030-01-01');
  await filter.getByRole('button', { name: 'Show' }).click();
  await expect(page.getByRole('alert')).toHaveText('From date must be on or before To date');
});
