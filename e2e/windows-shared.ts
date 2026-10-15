import { expect, type Page } from '@playwright/test';
import { collectErrors, open, seedSave, state } from './helpers.ts';

/** UB-02: windows by importance — a tab changes the screen, a button opens a panel from the right, a popup is for what matters; one at a time. */
const visibleWindows = (page: Page) => page.locator('.overlay:not([hidden]):not(.under)');

export async function windowsByImportance(page: Page): Promise<void> {
  const errors = collectErrors(page);
  await seedSave(page, { coins: 5000, flags: { ftue_starter: true, ftue_done: true, ftue_fed: true, ftue_bought: true, showcase_m3: true }, showcase: ['e2e1'] });
  await open(page);
  const vp = page.viewportSize()!;
  // M4-00: a detail is an inner page of its tab (the egg card in «Eggs»): «Back» returns to the list, the list keeps its scroll.
  await page.locator('[data-action=egg-card-egg_basic]').click();
  const card = page.locator('[data-detail=egg-card]');
  await expect(card).toBeVisible();
  const box = (await card.boundingBox())!;
  const home = (await page.locator('[data-sheet=eggs]').boundingBox())!;
  // Inside the very panel of the tab (its padding aside), the shop stays in view beside or above it.
  expect(box.x).toBeGreaterThanOrEqual(home.x - 1);
  expect(box.x + box.width).toBeLessThanOrEqual(home.x + home.width + 1);
  expect(box.y).toBeGreaterThanOrEqual(home.y - 1);
  expect(vp.width > vp.height ? home.x : home.y).toBeGreaterThan(100);
  await card.locator('[data-action=egg-back]').click();
  await expect(card).toBeHidden();
  await expect(page.locator('[data-sheet=eggs] [data-section]').first()).toBeVisible();
  // A tab works from anywhere: the shop upgrades replace the egg list in the same panel; no window opens for them.
  await page.locator('[data-action=egg-card-egg_basic]').click();
  await page.locator('[data-tab=shop]').click();
  await expect(page.locator('[data-sheet=shop]')).toBeVisible();
  await expect(card).toBeHidden();
  await expect(visibleWindows(page)).toHaveCount(0);
  // The market lot is an inner page too: «Back» to the lots; a tap on the shop closes the tab to home «Eggs».
  await page.locator('[data-tab=market]').click();
  await expect(page.locator('[data-sheet=market]')).toBeVisible();
  await page.locator('[data-sheet=market] .card-lot:not(.sold)').first().click();
  await expect(page.locator('[data-detail=lot]')).toBeVisible();
  await page.locator('[data-detail=lot] [data-action=lot-back]').click();
  await expect(page.locator('[data-detail=lot]')).toBeHidden();
  await expect(page.locator('[data-sheet=market] .card-lot').first()).toBeVisible();
  await page.locator('[data-sheet=market] .card-lot:not(.sold)').first().click();
  await expect(page.locator('[data-detail=lot]')).toBeVisible();
  const stage = (await page.locator('[data-action=scene-close]').boundingBox())!;
  await page.mouse.click(stage.x + 12, stage.y + stage.height * 0.6);
  await expect(page.locator('[data-sheet=eggs]')).toBeVisible();
  await expect(page.locator('[data-tab=eggs]')).toHaveAttribute('aria-pressed', 'true');
  // Coming back to the market: its list, not the old lot (an inner page closes when the tab is left).
  await page.locator('[data-tab=market]').click();
  await expect(page.locator('[data-detail=lot]')).toBeHidden();
  await page.locator('[data-tab=eggs]').click();
  // A popup (a gift) — a tab works from it too, and a tap outside closes it.
  await page.locator('[data-action=gifts]').click();
  await expect(page.locator('[data-overlay=gifts]')).toBeVisible();
  await expect(page.locator('[data-overlay=gifts]')).toHaveAttribute('data-kind', 'popup');
  await page.locator('[data-tab=eggs]').click();
  await expect(page.locator('[data-overlay=gifts]')).toBeHidden();
  await expect(page.locator('[data-sheet=eggs]')).toBeVisible();
  await page.locator('[data-action=gifts]').click();
  await page.waitForTimeout(450);
  await page.mouse.click(8, vp.height / 2);
  await expect(page.locator('[data-overlay=gifts]')).toBeHidden();
  // The pause: a tab closes it and the game runs again.
  await page.locator('[data-action=pause]').click();
  await expect(page.locator('[data-overlay=pause]')).toBeVisible();
  expect((await state(page)).pause).toContain('menu');
  await page.locator('[data-tab=chats]').click();
  await expect(page.locator('[data-overlay=pause]')).toBeHidden();
  expect((await state(page)).pause).not.toContain('menu');
  expect(errors).toEqual([]);
}

/** UB-02: a hint never lies over a window (the first minute's «Tap the egg» while a window is open). */
export async function hintsNotOverWindows(page: Page): Promise<void> {
  const errors = collectErrors(page);
  await open(page);
  await expect(page.locator('.hint [data-hint-text]')).toBeVisible();
  await page.locator('[data-action=gifts]').click();
  await expect(page.locator('[data-overlay=gifts]')).toBeVisible();
  await expect(page.locator('.hint')).toBeHidden();
  // Q-026 B: at the very start only the home tab is open — the tab brings the hint back after the window closes.
  await page.locator('[data-tab=eggs]').click();
  await expect(page.locator('[data-overlay=gifts]')).toBeHidden();
  await expect(page.locator('.hint [data-hint-text]')).toBeVisible();
  // M4-00: the hint is the one caption at the shop — the shop's own signs keep quiet meanwhile.
  expect(((await state(page)) as unknown as { captions: string[] }).captions.length).toBeLessThanOrEqual(1);
  expect(errors).toEqual([]);
}
