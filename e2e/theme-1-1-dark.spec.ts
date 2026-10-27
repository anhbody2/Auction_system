import { expect, request as playwrightRequest, test, type Page } from '@playwright/test';
import { PASSWORD, createAuctionViaApi, login } from './helpers';

const TAG = `dk${Date.now().toString(36)}`;

/**
 * Contrast audit run in the page: every visible element with its own text is checked against the first opaque
 * background behind it (WCAG AA: 4.5:1, or 3:1 for large text). Elements under a gradient / image background or
 * a faded (disabled) ancestor are skipped, as WCAG exempts disabled controls.
 */
async function contrastFailures(page: Page) {
  return page.evaluate(() => {
    const parse = (c: string) => {
      const m = c.match(/rgba?\(([^)]+)\)/);
      if (!m) return null;
      const [r, g, b, a = 1] = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
      return { r, g, b, a };
    };
    const lum = ({ r, g, b }: { r: number; g: number; b: number }) => {
      const f = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const failures: string[] = [];
    for (const el of Array.from(document.body.querySelectorAll<HTMLElement>('*'))) {
      const own = Array.from(el.childNodes).some((n) => n.nodeType === Node.TEXT_NODE && n.textContent!.trim());
      if (!own || el.closest('svg, option, [hidden]')) continue;
      const rect = el.getBoundingClientRect();
      const st = getComputedStyle(el);
      if (rect.width === 0 || rect.height === 0 || st.visibility === 'hidden' || el.classList.contains('sr-only')) continue;
      let bg: { r: number; g: number; b: number; a: number } | null = null;
      let skip = false;
      for (let n: HTMLElement | null = el; n; n = n.parentElement) {
        const s = getComputedStyle(n);
        if (Number(s.opacity) < 1 || s.backgroundImage !== 'none') {
          skip = true;
          break;
        }
        const c = parse(s.backgroundColor);
        if (c && c.a >= 0.99) {
          bg = c;
          break;
        }
      }
      if (skip || !bg) continue;
      const fg = parse(st.color)!;
      const [hi, lo] = [lum(fg), lum(bg)].sort((x, y) => y - x);
      const ratio = (hi + 0.05) / (lo + 0.05);
      const size = parseFloat(st.fontSize);
      const large = size >= 24 || (size >= 18.66 && Number(st.fontWeight) >= 700);
      if (ratio < (large ? 3 : 4.5)) failures.push(`${el.tagName.toLowerCase()}.${el.className} "${el.textContent!.trim().slice(0, 30)}" ${ratio.toFixed(2)}`);
    }
    return failures;
  });
}

const bodyLuminance = (page: Page) =>
  page.evaluate(() => {
    const [r, g, b] = getComputedStyle(document.body).backgroundColor.match(/\d+/g)!.map(Number);
    const f = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  });

test('theme-1.1: pages are dark and their text passes WCAG AA contrast', async ({ page, baseURL }) => {
  const alice = await playwrightRequest.newContext({ baseURL });
  expect((await alice.post('/api/auth/login', { data: { identifier: 'alice', password: PASSWORD } })).status()).toBe(200);
  const lot = await createAuctionViaApi(alice, { name: `Dark lamp ${TAG}`, initialPrice: 10 });
  const done = await createAuctionViaApi(alice, { name: `Dark vase ${TAG}`, initialPrice: 10 });
  await alice.post(`/api/dev/auctions/${done.id}/expire`);
  await alice.dispose();

  // Guest homepage: live and completed cards, chips, sort, top bar
  await page.goto('/');
  await expect(page.getByTestId(`auction-card-${lot.id}`)).toBeVisible();
  expect(await bodyLuminance(page)).toBeLessThan(0.05);
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe('dark');
  expect(await contrastFailures(page), 'guest home').toEqual([]);

  // Customer: bid strip (leading and none), lot page with bid panel and history, dashboard, credit, bid history
  await login(page, 'bob');
  expect((await page.request.post(`/api/auctions/${lot.id}/bids`, { data: { amount: 10 } })).status()).toBe(201);
  for (const [name, url, ready] of [
    ['customer home', '/', `auction-card-${lot.id}`],
    ['lot page', `/auctions/${lot.id}`, 'place-bid'],
    ['ended lot', `/auctions/${done.id}`, 'countdown'],
  ] as const) {
    await page.goto(url);
    await expect(page.getByTestId(ready).first()).toBeVisible();
    expect(await bodyLuminance(page), name).toBeLessThan(0.05);
    expect(await contrastFailures(page), name).toEqual([]);
  }
  for (const [name, url] of [
    ['dashboard', '/dashboard'],
    ['credit', '/credit'],
    ['bid history', '/my-bids'],
    ['profile', '/profile'],
  ] as const) {
    await page.goto(url);
    await expect(page.getByRole('heading').first()).toBeVisible();
    await expect(page.getByText(/^Loading/)).toHaveCount(0);
    expect(await contrastFailures(page), name).toEqual([]);
  }

  // Form fields are dark with light text
  const input = await page.evaluate(() => {
    const el = document.createElement('input');
    document.body.append(el);
    const s = getComputedStyle(el);
    const out = { bg: s.backgroundColor, color: s.color };
    el.remove();
    return out;
  });
  expect(input.bg).not.toBe('rgb(255, 255, 255)');
  expect(input.color).toBe('rgb(230, 238, 244)');
});

test('theme-1.1: staff and admin pages pass the same contrast audit', async ({ page }) => {
  for (const [who, urls] of [
    ['staff', ['/staff/statistics', '/staff/auctions', '/staff/goods', '/staff/credit']],
    ['admin', ['/admin/users', '/admin/permissions']],
  ] as const) {
    await page.context().clearCookies();
    await login(page, who);
    for (const url of urls) {
      await page.goto(url);
      await expect(page.getByRole('heading').first()).toBeVisible();
      await expect(page.getByText(/^Loading/)).toHaveCount(0);
      expect(await bodyLuminance(page), url).toBeLessThan(0.05);
      expect(await contrastFailures(page), url).toEqual([]);
    }
  }
});

test('theme-1.1: login and register forms pass the contrast audit', async ({ page }) => {
  for (const url of ['/login', '/register']) {
    await page.goto(url);
    await expect(page.getByRole('heading').first()).toBeVisible();
    expect(await contrastFailures(page), url).toEqual([]);
  }
  // The audit itself catches dark-on-dark text.
  await page.evaluate(() => {
    const p = document.createElement('p');
    p.id = 'planted';
    p.textContent = 'Planted low contrast';
    p.style.color = '#1e2d36';
    document.querySelector('main, .container, body')!.append(p);
  });
  expect(await contrastFailures(page)).toEqual([expect.stringContaining('Planted low contrast')]);
});
