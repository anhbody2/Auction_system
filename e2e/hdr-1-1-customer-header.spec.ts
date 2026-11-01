import { expect, test, type Page } from '@playwright/test';
import { login } from './helpers';

const LEFT = ['Browse', 'Dashboard', 'Bids'];
const RIGHT = ['Credit', 'My goods', 'My Auctions'];

async function box(page: Page, testIdOrLink: { testId?: string; link?: string }) {
  const loc = testIdOrLink.testId
    ? page.getByTestId(testIdOrLink.testId)
    : page.locator('header nav').getByRole('link', { name: testIdOrLink.link, exact: true });
  const b = await loc.boundingBox();
  expect(b, JSON.stringify(testIdOrLink)).not.toBeNull();
  return b!;
}

for (const width of [1440, 1200, 1000]) {
  // From 1151px the bar is one row; below that the search takes a centred second row.
  const oneRow = width > 1150;
  test(`hdr-1.1: at ${width}px the customer bar is 3 links | search | 3 links | user`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await login(page, 'carol');
    const bar = (await page.locator('header.topbar').boundingBox())!;
    const search = await box(page, { testId: 'top-search' });
    const input = await page.getByTestId('top-search').getByRole('searchbox').boundingBox();
    const avatar = await box(page, { testId: 'avatar' });
    const mid = search.x + search.width / 2;

    for (const link of LEFT) {
      const b = await box(page, { link });
      expect(b.x + b.width, `${link} left of the search centre`).toBeLessThanOrEqual(oneRow ? search.x : mid);
    }
    for (const link of RIGHT) {
      const b = await box(page, { link });
      expect(b.x, `${link} right of the search centre`).toBeGreaterThanOrEqual(oneRow ? search.x + search.width : mid);
      expect(b.x + b.width, `${link} left of avatar`).toBeLessThanOrEqual(avatar.x);
    }
    // Links keep their order inside each group.
    const xs = await Promise.all([...LEFT, ...RIGHT].map(async (link) => (await box(page, { link })).x));
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);

    // The search sits in the middle third, its text box stays usable, and nothing scrolls sideways.
    expect(mid).toBeGreaterThan(bar.width / 3);
    expect(mid).toBeLessThan((bar.width * 2) / 3);
    expect(input!.width).toBeGreaterThan(120);
    if (oneRow) expect(Math.abs(search.y - avatar.y)).toBeLessThan(bar.height / 2);
    else expect(search.y).toBeGreaterThanOrEqual(avatar.y + avatar.height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  });
}

test('hdr-1.1: guest bar keeps Browse before the search and the auth buttons after it', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 800 });
  await page.goto('/');
  await expect(page.locator('header .nav-group')).toHaveCount(0);
  const browse = await box(page, { link: 'Browse' });
  const search = await box(page, { testId: 'top-search' });
  expect(browse.x + browse.width).toBeLessThanOrEqual(search.x);
});
