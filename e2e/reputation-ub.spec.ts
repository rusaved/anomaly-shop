import { expect, test } from '@playwright/test';
import { collectErrors, open, seedSave, sellInChat, translated } from './helpers.ts';

/** UB-08: the seller level grows from deals — the chip in the top bar, the flash and a toast on a new level, the panel of what opens. */
const runSim = (page: import('@playwright/test').Page, sec: number) => page.evaluate((s) => (window as unknown as { __TEST__: { runSim(s: number): number } }).__TEST__.runSim(s), sec);

test('UB-08 a deal brings the seller level up: the chip flashes, a toast, the panel lists what opens', async ({ page }) => {
  const errors = collectErrors(page);
  // Two deals behind: one more makes level 2 (content/reputation.json levels).
  await seedSave(page, { coins: 0, stats: { deals: 2, coinsEarned: 60, hatched: 3, taps: 30, levelUps: 1, haggles: 0 }, flags: { ftue_starter: true, ftue_done: true, ftue_fed: true, ftue_bought: true, showcase_m3: true }, showcase: [] });
  await open(page);
  const chip = page.locator('[data-hud=level]');
  await expect(chip).toBeVisible();
  await expect(chip.locator('[data-level]')).toHaveText('1');
  // List a creature, a buyer writes, sell from the chat.
  await page.locator('[data-tab=sales]').click();
  await page.locator('[data-sheet=sales] [data-action=sale-add]').click();
  await page.locator('[data-detail=sale] [data-action=sale-list-e2e1]').click();
  await runSim(page, 25);
  await sellInChat(page);
  await expect(chip.locator('[data-level]')).toHaveText('2');
  await expect(chip).toHaveClass(/rep-up/);
  await expect(page.locator('[data-toast]').filter({ hasText: (await translated(page, 'rep.up')).replace('{n}!', '') }).first()).toBeVisible();
  // The panel: the level, its points, the next levels and what they open.
  await chip.click();
  const panel = page.locator('[data-overlay=reputation]');
  await expect(panel).toBeVisible();
  await expect(panel.locator('.rep-title')).toContainText('2');
  await expect(panel.locator('.rep-row').first()).toHaveAttribute('data-rep-level', '3');
  expect(await panel.locator('.rep-row').count()).toBeGreaterThan(1);
  // A tab closes it (UB-02).
  await page.locator('[data-tab=eggs]').click();
  await expect(panel).toBeHidden();
  expect(errors).toEqual([]);
});
