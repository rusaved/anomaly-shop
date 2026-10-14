import { expect, type Page } from '@playwright/test';
import { collectErrors, open, seedSave, state } from './helpers.ts';

/** UB-02: windows by importance — a tab changes the screen, a button opens a panel from the right, a popup is for what matters; one at a time. */
const visibleWindows = (page: Page) => page.locator('.overlay:not([hidden]):not(.under)');

export async function windowsByImportance(page: Page): Promise<void> {
  const errors = collectErrors(page);
  await seedSave(page, { coins: 5000, flags: { ftue_starter: true, ftue_done: true, ftue_fed: true, ftue_bought: true, showcase_m3: true }, showcase: ['e2e1'] });
  await open(page);
  const vp = page.viewportSize()!;
  // A button opens a panel from the right (a detail: the egg card), the home list stays where it was.
  await page.locator('[data-action=egg-card-egg_basic]').click();
  const card = page.locator('[data-overlay=egg-card]');
  await expect(card).toBeVisible();
  await expect(card).toHaveAttribute('data-kind', 'panel');
  const box = (await card.locator('.card').boundingBox())!;
  expect(box.x + box.width).toBeGreaterThanOrEqual(vp.width - 1);
  // One window at a time: the shop upgrades replace the egg card.
  await page.locator('[data-tab=shop]').click();
  await expect(page.locator('[data-overlay=upgrades]')).toBeVisible();
  await expect(card).toBeHidden();
  await expect(visibleWindows(page)).toHaveCount(1);
  // A tab works from a panel: the screen changes, the panel closes.
  await page.locator('[data-tab=market]').click();
  await expect(page.locator('[data-sheet=market]')).toBeVisible();
  await expect(visibleWindows(page)).toHaveCount(0);
  // A tap outside closes a panel: the lot card of the market.
  await page.locator('[data-sheet=market] .card-lot:not(.sold)').first().click();
  await expect(page.locator('[data-overlay=lot]')).toBeVisible();
  const lot = (await page.locator('[data-overlay=lot] .card').boundingBox())!;
  // The opening tap itself never closes a window (UB-10: 0.4 s guard against the touch ghost click); a player's next tap does.
  await page.waitForTimeout(450);
  // Outside the card: above it in portrait, left of it in landscape.
  if (vp.width > vp.height) await page.mouse.click(lot.x / 2, lot.y + lot.height / 2);
  else await page.mouse.click(vp.width / 2, Math.max(70, lot.y / 2));
  await expect(page.locator('[data-overlay=lot]')).toBeHidden();
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
  await page.locator('[data-tab=market]').click();
  // The hint at the shop does not show over another screen either: only the market's own one (UB-06), at a thing on that screen.
  await expect(page.locator('.hint')).toHaveAttribute('data-hint', 'tab');
  await page.waitForTimeout(350);
  await page.locator('[data-tab=market]').click();
  await expect(page.locator('.hint')).toBeHidden();
  await page.locator('[data-tab=eggs]').click();
  await expect(page.locator('.hint [data-hint-text]')).toBeVisible();
  expect(errors).toEqual([]);
}
