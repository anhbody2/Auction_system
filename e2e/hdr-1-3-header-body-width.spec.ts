import { expect, test, type Page } from '@playwright/test';
import { login } from './helpers';

/** The page body column's content edges: main.container minus its 1rem side padding. */
async function bodyEdges(page: Page) {
  return page.locator('main.container').evaluate((m) => {
    const r = m.getBoundingClientRect();
    const pad = parseFloat(getComputedStyle(m).paddingLeft);
    return { left: r.left + pad, right: r.right - pad };
  });
}

async function headerEdges(page: Page, last: string) {
  const brand = (await page.locator('header .brand').boundingBox())!;
  const end = (await page.locator(last).boundingBox())!;
  return { left: brand.x, right: end.x + end.width };
}

for (const width of [1920, 1440, 1100]) {
  for (const who of ['guest', 'carol', 'staff', 'admin'] as const) {
    test(`hdr-1.3: at ${width}px the ${who} header content lines up with the body column`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      if (who === 'guest') await page.goto('/');
      else await login(page, who);
      // The header background still spans the whole window.
      const bar = (await page.locator('header.topbar').boundingBox())!;
      expect(bar.x).toBe(0);
      expect(bar.width).toBe(width);

      const body = await bodyEdges(page);
      const head = await headerEdges(page, who === 'guest' ? 'header .userbox a:last-child' : '[data-testid=avatar]');
      expect(Math.abs(head.left - body.left), 'brand on the body left edge').toBeLessThanOrEqual(1);
      expect(Math.abs(head.right - body.right), 'last header item on the body right edge').toBeLessThanOrEqual(1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    });
  }
}
