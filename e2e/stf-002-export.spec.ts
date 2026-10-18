import ExcelJS from 'exceljs';
import { expect, test } from '@playwright/test';
import { createSoldAuction, login } from './helpers';

test('stf-002: staff export the filtered list and an auctions_<from>_<to>.xlsx file downloads', async ({ page, request }) => {
  const name = `Export lamp ${Date.now().toString(36)}`;
  await createSoldAuction(request, name);

  await login(page, 'staff');
  const filter = page.getByRole('form', { name: 'Statistics filter' });
  const today = await page.evaluate(() => {
    const d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
  });
  await filter.getByLabel('From').fill(today);
  await filter.getByLabel('To').fill(today);
  await filter.getByLabel('Status').selectOption('ended');
  await filter.getByRole('button', { name: 'Show' }).click();
  await expect(page.getByTestId('stat-table')).toContainText(name);
  const shown = await page.getByTestId('stat-table').locator('tbody tr').count();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Export to Excel' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(`auctions_${today}_${today}.xlsx`);

  // The file holds a header, the same rows the table shows, and the total
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(await download.path());
  const ws = wb.getWorksheet('Auctions')!;
  expect(ws.getRow(1).getCell(2).value).toBe('Title');
  const titles: string[] = [];
  for (let i = 2; i < 2 + shown; i++) titles.push(String(ws.getRow(i).getCell(2).value));
  expect(titles).toContain(name);
  expect(ws.getRow(2 + shown).getCell(2).value).toBe(`Total: ${shown} auction${shown === 1 ? '' : 's'}`);
});
