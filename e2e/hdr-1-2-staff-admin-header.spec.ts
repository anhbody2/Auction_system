import { expect, test, type Page } from '@playwright/test';
import { login, openRoleNav } from './helpers';

// Seeded default grants (be/src/lib/permissions.ts), in nav order.
const ROLE_LINKS = {
  staff: ['Statistics', 'Manage auctions', 'Goods', 'Credit management'],
  admin: ['Manage auctions', 'Goods', 'Credit management', 'Users', 'Permissions'],
};

async function box(page: Page, testIdOrLink: { testId?: string; link?: string }) {
  const loc = testIdOrLink.testId
    ? page.getByTestId(testIdOrLink.testId)
    : page.locator('header nav').getByRole('link', { name: testIdOrLink.link, exact: true });
  const b = await loc.boundingBox();
  expect(b, JSON.stringify(testIdOrLink)).not.toBeNull();
  return b!;
}

for (const role of ['staff', 'admin'] as const) {
  for (const width of [1440, 1200, 1000]) {
    // hdr-1.4: within the body column the role links do not fit beside a usable search, so they fold into one
    // "Dashboard" menu and the bar stays one row: Browse | search | Dashboard | role pill, avatar.
    test(`hdr-1.2: at ${width}px the ${role} bar is Browse | search | Dashboard menu | user`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await login(page, role);
      const bar = (await page.locator('header.topbar').boundingBox())!;
      const search = await box(page, { testId: 'top-search' });
      const input = await page.getByTestId('top-search').getByRole('searchbox').boundingBox();
      const dashboard = await box(page, { testId: 'nav-dashboard' });
      const pill = await box(page, { testId: 'current-role' });
      const browse = await box(page, { link: 'Browse' });
      const mid = search.x + search.width / 2;

      await expect(page.locator('header .nav-left').getByRole('link')).toHaveText(['Browse']);
      expect(browse.x + browse.width, 'Browse left of the search').toBeLessThanOrEqual(search.x);
      expect(dashboard.x, 'Dashboard right of the search').toBeGreaterThanOrEqual(search.x + search.width);
      expect(dashboard.x + dashboard.width, 'Dashboard left of the role pill').toBeLessThanOrEqual(pill.x);
      expect(Math.abs(search.y + search.height / 2 - (dashboard.y + dashboard.height / 2)), 'one row').toBeLessThan(bar.height / 2);
      expect(mid).toBeGreaterThan(bar.width / 3);
      expect(mid).toBeLessThan((bar.width * 2) / 3);
      expect(input!.width).toBeGreaterThan(200);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);

      // The menu lists every role link in order, below the toggle, inside the window.
      await expect(page.getByTestId('nav-dashboard-menu')).toBeHidden();
      await openRoleNav(page);
      const menu = page.getByTestId('nav-dashboard-menu');
      await expect(menu.getByRole('link')).toHaveText(ROLE_LINKS[role]);
      const m = (await menu.boundingBox())!;
      expect(m.y).toBeGreaterThanOrEqual(dashboard.y + dashboard.height - 1);
      expect(m.x + m.width).toBeLessThanOrEqual(width);
    });
  }
}

test('hdr-1.2: a Dashboard menu link opens the page, marks the toggle active and closes the menu', async ({ page }) => {
  await login(page, 'staff');
  await openRoleNav(page);
  await page.getByTestId('nav-dashboard-menu').getByRole('link', { name: 'Manage auctions' }).click();
  await expect(page.getByRole('heading', { name: 'Auction management' })).toBeVisible();
  await expect(page.getByTestId('nav-dashboard-menu')).toBeHidden();
  await expect(page.getByTestId('nav-dashboard')).toHaveClass(/active/);
  // Escape and an outside click close it too.
  await openRoleNav(page);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('nav-dashboard-menu')).toBeHidden();
  await openRoleNav(page);
  await page.locator('main').click({ position: { x: 5, y: 5 } });
  await expect(page.getByTestId('nav-dashboard-menu')).toBeHidden();
});

test('hdr-1.2: at 375px the admin folding menu holds Browse and every role link flat, search on its own row', async ({ page }) => {
  await login(page, 'admin');
  await page.setViewportSize({ width: 375, height: 800 });
  const nav = page.locator('header nav');
  await expect(nav).toBeHidden();
  await expect(page.getByTestId('nav-dashboard')).toHaveCount(0);
  await page.getByTestId('nav-toggle').click();
  await expect(nav.getByRole('link')).toHaveText(['Browse', ...ROLE_LINKS.admin]);
  const search = await box(page, { testId: 'top-search' });
  expect(search.width).toBeGreaterThan(300);
  // The header itself fits; the admin landing page's user table has its own (pre-existing) width.
  expect(await page.locator('header.topbar').evaluate((h) => h.scrollWidth)).toBeLessThanOrEqual(375);
});

test('hdr-1.2: role links stay permission-driven: staff sees no admin or customer links', async ({ page }) => {
  await login(page, 'staff');
  await openRoleNav(page);
  const nav = page.locator('header nav');
  await expect(nav.getByRole('link', { name: 'Statistics', exact: true })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Users', exact: true })).toHaveCount(0);
  await expect(nav.getByRole('link', { name: 'Permissions', exact: true })).toHaveCount(0);
  await expect(nav.getByRole('link', { name: 'Bids', exact: true })).toHaveCount(0);
});
