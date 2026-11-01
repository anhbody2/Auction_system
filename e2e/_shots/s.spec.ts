import { test } from '@playwright/test';
import { login, openRoleNav } from '../helpers';
for (const [role, width] of [['admin', 1440], ['staff', 1000]] as const)
  test(`${role} ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 420 });
    await login(page, role);
    await page.screenshot({ path: `C:/Users/VUTUAN~1/AppData/Local/Temp/claude/e--Auction-system/168a877b-2904-4399-970b-c836dbb39892/scratchpad/d-${role}-${width}.png` });
    await openRoleNav(page);
    await page.screenshot({ path: `C:/Users/VUTUAN~1/AppData/Local/Temp/claude/e--Auction-system/168a877b-2904-4399-970b-c836dbb39892/scratchpad/d-${role}-${width}-open.png` });
  });
