import { expect, type Page } from '@playwright/test';
import { collectErrors, open, seedSave, state } from './helpers.ts';

/** UB-02, MU-02, MU-09: windows by importance — a tab changes the screen, an inner page has «‹», a popup is a 343 px card; one at a time. */
const visibleWindows = (page: Page) => page.locator('.overlay:not([hidden]):not(.under)');

export async function windowsByImportance(page: Page): Promise<void> {
  const errors = collectErrors(page);
  await seedSave(page, { coins: 5000, flags: { ftue_starter: true, ftue_done: true, ftue_fed: true, ftue_bought: true, showcase_m3: true }, showcase: ['e2e1'] });
  await open(page);
  const vp = page.viewportSize()!;
  // MU-02: a detail is an inner page of its tab (the egg card in «Яйца»), the whole screen under the top bar; «‹» returns to the list.
  await page.locator('[data-tab=eggs]').click();
  await page.locator('[data-sheet=eggs] [data-action=egg-card-egg_basic]').click();
  const card = page.locator('[data-detail=egg-card]');
  await expect(card).toBeVisible();
  const box = (await card.boundingBox())!;
  const sheet = (await page.locator('[data-sheet=eggs]').boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(sheet.x - 1);
  expect(box.x + box.width).toBeLessThanOrEqual(sheet.x + sheet.width + 1);
  await card.locator('[data-action=egg-back]').click();
  await expect(card).toBeHidden();
  await expect(page.locator('[data-sheet=eggs] [data-section]').first()).toBeVisible();
  // A tab works from anywhere: the store replaces the egg card; no window opens for it.
  await page.locator('[data-sheet=eggs] [data-action=egg-card-egg_basic]').click();
  await page.locator('[data-tab=shop]').click();
  await expect(page.locator('[data-sheet=shop]')).toBeVisible();
  await expect(card).toBeHidden();
  await expect(visibleWindows(page)).toHaveCount(0);
  // The market lot is an inner page too: «‹» to the lots; the active tab again closes it as well (07 rule 12).
  await page.locator('[data-tab=market]').click();
  await expect(page.locator('[data-sheet=market]')).toBeVisible();
  await page.locator('[data-sheet=market] .card-lot:not(.sold) [data-action^=lot-open-]').first().click();
  await expect(page.locator('[data-detail=lot]')).toBeVisible();
  await page.locator('[data-detail=lot] [data-action=lot-back]').click();
  await expect(page.locator('[data-detail=lot]')).toBeHidden();
  await expect(page.locator('[data-sheet=market] .card-lot').first()).toBeVisible();
  await page.locator('[data-sheet=market] .card-lot:not(.sold) [data-action^=lot-open-]').first().click();
  await expect(page.locator('[data-detail=lot]')).toBeVisible();
  await page.locator('[data-tab=market]').click();
  await expect(page.locator('[data-detail=lot]')).toBeHidden();
  // «Подарки» — a screen with its ✕ (MU-08); a tab closes it too.
  await page.locator('[data-tab=home]').click();
  await page.locator('[data-action=gifts]').click();
  await expect(page.locator('[data-overlay=gifts]')).toBeVisible();
  await expect(page.locator('[data-overlay=gifts]')).toHaveAttribute('data-kind', 'screen');
  await page.locator('[data-tab=eggs]').click();
  await expect(page.locator('[data-overlay=gifts]')).toBeHidden();
  await expect(page.locator('[data-sheet=eggs]')).toBeVisible();
  await page.locator('[data-action=gifts]').click();
  await page.locator('[data-overlay=gifts] [data-action=gifts-close]').click();
  await expect(page.locator('[data-overlay=gifts]')).toBeHidden();
  // A popup (the pause, 343 px in the centre): a tap outside closes it, a tab too, and the game runs again.
  await page.locator('[data-action=pause]').click();
  await expect(page.locator('[data-overlay=pause]')).toBeVisible();
  expect((await page.locator('[data-overlay=pause] .card').boundingBox())!.width).toBeLessThanOrEqual(344);
  expect((await state(page)).pause).toContain('menu');
  await page.waitForTimeout(450);
  await page.mouse.click(4, vp.height / 2);
  await expect(page.locator('[data-overlay=pause]')).toBeHidden();
  await page.locator('[data-action=pause]').click();
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
  // Q-026 B: at the very start «Лавка» and «Яйца» are open — the home tab brings the hint back after the window closes.
  await page.locator('[data-tab=home]').click();
  await expect(page.locator('[data-overlay=gifts]')).toBeHidden();
  await expect(page.locator('.hint [data-hint-text]')).toBeVisible();
  // M4-00: the hint is the one caption at the shop — the shop's own signs keep quiet meanwhile.
  expect(((await state(page)) as unknown as { captions: string[] }).captions.length).toBeLessThanOrEqual(1);
  expect(errors).toEqual([]);
}
