import { expect, type Page } from '@playwright/test';
import { collectErrors, expectInsideViewport, open, state } from './helpers.ts';

/** M3-03: the genre-standard frame — seven tabs open their screens in 375×812, 812×375 and 1280×720; the shop stays in view; M0–M2 still work. */
const SHEETS = ['market', 'inventory', 'sales', 'eggs', 'chats', 'season'] as const;

export async function everyTabOpens(page: Page): Promise<void> {
  const errors = collectErrors(page);
  await open(page);
  for (const tab of SHEETS) {
    await page.locator(`[data-tab=${tab}]`).click();
    await expect(page.locator(`[data-sheet=${tab}]`)).toBeVisible();
    await expectInsideViewport(page, [`[data-sheet=${tab}] .sheet-title`, `[data-sheet=${tab}] [data-action=sheet-close]`]);
    // The shop scene stays in view next to or above the sheet.
    const sheet = (await page.locator(`[data-sheet=${tab}]`).boundingBox())!;
    const vp = page.viewportSize()!;
    expect(vp.width > vp.height ? sheet.x : sheet.y).toBeGreaterThan(100);
  }
  await page.locator('[data-sheet=season] [data-action=sheet-close]').click();
  for (const tab of SHEETS) await expect(page.locator(`[data-sheet=${tab}]`)).toBeHidden();
  // Shop tab = the shop upgrades until M5 (Q-021 B); the balance opens it too.
  await page.locator('[data-tab=shop]').click();
  await expect(page.locator('[data-overlay=upgrades]')).toBeVisible();
  expect(errors).toEqual([]);
  expect((await state(page)).controllable).toBe(true);
}
