import { expect, test, type Page } from '@playwright/test';
import { login, logout } from './helpers';

const KEY = 'auction:lastActivity';
// fe/src/idle.ts ACTIVITY_THROTTLE_MS is 1 s: wait past it so every input can be seen on its own.
const PAST_THROTTLE_MS = 1100;

const lastActivity = (page: Page) => page.evaluate((key) => Number(localStorage.getItem(key) ?? 0), KEY);

/** Runs `input` after the throttle window and expects the shared activity time to move forward. */
async function expectAdvances(page: Page, label: string, input: () => Promise<void>) {
  const before = await lastActivity(page);
  await page.waitForTimeout(PAST_THROTTLE_MS);
  await input();
  await expect.poll(() => lastActivity(page), { message: label }).toBeGreaterThan(before);
}

test.use({ hasTouch: true });

test('sec-004: the idle hook records mouse, key, scroll and touch activity while signed in, and stops on logout', async ({ page }) => {
  await page.goto('/');
  // Guests are not tracked.
  expect(await lastActivity(page)).toBe(0);

  await login(page, 'alice');
  // Signing in counts as activity.
  await expect.poll(() => lastActivity(page)).toBeGreaterThan(0);

  // A page with no input does not advance it.
  const quiet = await lastActivity(page);
  await page.waitForTimeout(2 * PAST_THROTTLE_MS);
  expect(await lastActivity(page)).toBe(quiet);

  // The page must be able to scroll for a real scroll event.
  await page.evaluate(() => {
    document.body.style.minHeight = '4000px';
  });

  await expectAdvances(page, 'mousemove', async () => {
    await page.mouse.move(40, 40);
    await page.mouse.move(200, 220, { steps: 5 });
  });
  await expectAdvances(page, 'mousedown', async () => {
    await page.mouse.move(5, 300);
    await page.mouse.down();
    await page.mouse.up();
  });
  await expectAdvances(page, 'keydown', () => page.keyboard.press('Shift'));
  await expectAdvances(page, 'scroll', () => page.mouse.wheel(0, 600));
  await expectAdvances(page, 'touchstart', () => page.touchscreen.tap(10, 400));

  // Logging out stops the tracker: input no longer writes.
  await logout(page);
  const stopped = await lastActivity(page);
  await page.waitForTimeout(PAST_THROTTLE_MS);
  await page.mouse.move(100, 100);
  await page.mouse.move(300, 300, { steps: 5 });
  await page.keyboard.press('Shift');
  await page.waitForTimeout(300);
  expect(await lastActivity(page)).toBe(stopped);
});
