import { expect, type Page } from '@playwright/test';
import { collectErrors, expectInsideViewport, open, seedSave, state } from './helpers.ts';

/** UB-01: one tab bar of labelled tabs, the whole width at the bottom; «Eggs» is home (the shop + its panel); every tab opens its screen.
 * Q-026 B: «Season» stays hidden until the season update. */
const SCREENS = ['market', 'inventory', 'sales', 'chats'] as const;
const TABS = ['market', 'inventory', 'sales', 'eggs', 'chats', 'shop'] as const;

export async function everyTabOpens(page: Page): Promise<void> {
  const errors = collectErrors(page);
  await seedSave(page, { coins: 300 });
  await open(page);
  const vp = page.viewportSize()!;
  await expect(page.locator('[data-tab=season]')).toBeHidden();
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
  // M4-00: one panel model — every tab opens in the same panel as the home «Eggs» (right of the shop on a PC and sideways,
  // above the tab bar on a phone); the shop stays in view; ✕, the active tab and a tap on the shop close it to «Eggs».
  for (const tab of [...SCREENS, 'shop'] as const) {
    await page.locator(`[data-tab=${tab}]`).click();
    await expect(page.locator(`[data-sheet=${tab}]`)).toBeVisible();
    await expect(page.locator('[data-sheet=eggs]')).toBeHidden();
    await expect(page.locator(`[data-tab=${tab}]`)).toHaveAttribute('aria-pressed', 'true');
    await expectInsideViewport(page, [`[data-sheet=${tab}] .sheet-title`, `[data-sheet=${tab}] [data-action=sheet-close]`]);
    const box = (await page.locator(`[data-sheet=${tab}]`).boundingBox())!;
    expect(Math.abs(box.x - home.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(box.y - home.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(box.width - home.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(box.height - home.height)).toBeLessThanOrEqual(1);
    expect(box.y + box.height).toBeLessThanOrEqual(bar.y + 1);
  }
  // Three ways back home, all the same: ✕, the active tab again, a tap on the shop.
  await page.locator('[data-sheet=shop] [data-action=sheet-close]').click();
  await expect(page.locator('[data-sheet=eggs]')).toBeVisible();
  await expect(page.locator('[data-tab=eggs]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('[data-tab=market]').click();
  await page.locator('[data-tab=market]').click();
  await expect(page.locator('[data-sheet=eggs]')).toBeVisible();
  await page.locator('[data-tab=chats]').click();
  await page.locator('[data-action=scene-close]').click({ position: { x: 20, y: vp.width > vp.height ? 200 : 120 } });
  await expect(page.locator('[data-sheet=eggs]')).toBeVisible();
  await expect(page.locator('[data-tab=eggs]')).toHaveAttribute('aria-pressed', 'true');
  expect(errors).toEqual([]);
  expect((await state(page)).controllable).toBe(true);
}
