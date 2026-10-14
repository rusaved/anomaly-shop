import { expect, type Page } from '@playwright/test';
import { collectErrors, expectInsideViewport, open, state } from './helpers.ts';

/** UB-01: one tab bar of seven labelled tabs, the whole width at the bottom; «Eggs» is home (the shop + its panel); every tab opens its screen. */
const SCREENS = ['market', 'inventory', 'sales', 'chats', 'season'] as const;
const TABS = ['market', 'inventory', 'sales', 'eggs', 'chats', 'shop', 'season'] as const;

export async function everyTabOpens(page: Page): Promise<void> {
  const errors = collectErrors(page);
  await open(page);
  const vp = page.viewportSize()!;
  // The bar: the whole width, at the bottom, seven visible labels (UB-07: 12 px at least).
  const bar = (await page.locator('#nav').boundingBox())!;
  expect(bar.x).toBeLessThanOrEqual(0.5);
  expect(bar.width).toBeGreaterThanOrEqual(vp.width - 1);
  expect(bar.y + bar.height).toBeGreaterThanOrEqual(vp.height - 1);
  for (const tab of TABS) {
    const label = page.locator(`[data-tab=${tab}] .nav-label:visible`);
    await expect(label).toHaveCount(1);
    expect((await label.innerText()).trim().length).toBeGreaterThan(0);
    expect(await label.evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(12);
  }
  // Home: the egg screen next to the shop; no panel of the first loop (deal card, egg buttons) anywhere.
  await expect(page.locator('[data-tab=eggs]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-sheet=eggs]')).toBeVisible();
  await expect(page.locator('#panel, .deal, [data-action=sell], [data-action=haggle], [data-action=buy-egg]')).toHaveCount(0);
  const home = (await page.locator('[data-sheet=eggs]').boundingBox())!;
  expect(vp.width > vp.height ? home.x : home.y).toBeGreaterThan(100);
  for (const tab of SCREENS) {
    await page.locator(`[data-tab=${tab}]`).click();
    await expect(page.locator(`[data-sheet=${tab}]`)).toBeVisible();
    await expect(page.locator('[data-sheet=eggs]')).toBeHidden();
    await expect(page.locator(`[data-tab=${tab}]`)).toHaveAttribute('aria-pressed', 'true');
    await expectInsideViewport(page, [`[data-sheet=${tab}] .sheet-title`]);
    // A screen of its own: everything between the top bar and the tab bar.
    const screen = (await page.locator(`[data-sheet=${tab}]`).boundingBox())!;
    expect(screen.width).toBeGreaterThanOrEqual(vp.width - 1);
    expect(screen.y + screen.height).toBeLessThanOrEqual(bar.y + 1);
  }
  // Shop tab = the shop upgrades until M5 (Q-021 B): a panel over the home screen, the shop stays in view (UB-04).
  await page.locator('[data-tab=shop]').click();
  await expect(page.locator('[data-overlay=upgrades]')).toBeVisible();
  await expect(page.locator('[data-sheet=eggs]')).toBeVisible();
  const panel = (await page.locator('[data-overlay=upgrades]').boundingBox())!;
  expect(vp.width > vp.height ? panel.x : panel.y).toBeGreaterThan(100);
  await page.locator('[data-tab=eggs]').click();
  await expect(page.locator('[data-overlay=upgrades]')).toBeHidden();
  await expect(page.locator('[data-tab=eggs]')).toHaveAttribute('aria-pressed', 'true');
  expect(errors).toEqual([]);
  expect((await state(page)).controllable).toBe(true);
}
