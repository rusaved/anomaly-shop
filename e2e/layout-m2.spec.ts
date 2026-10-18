import { expect, test } from '@playwright/test';
import { collectErrors, expectInsideViewport, open, seedSave } from './helpers.ts';

/** M2-04: back after two hours with helpers — the «while you were away» window tells what the shop did. */
test('M2-04 away window after two hours with the helpers', async ({ page }) => {
  const errors = collectErrors(page);
  await seedSave(page, {
    savedAt: Date.now() - 2 * 3600 * 1000,
    upgrades: { helper_feed: 1, helper_sell: 1, helper_courier: 1 },
    stats: { deals: 40, coinsEarned: 3000, hatched: 42, taps: 100, levelUps: 3, haggles: 1 },
  });
  await open(page, '?mock_device=mobile');
  await expect(page.locator('[data-overlay=away]')).toBeVisible();
  await expectInsideViewport(page, ['[data-overlay=away] .card', '[data-overlay=away] [data-action=away-ok]']);
  await expect(page.locator('[data-away-coins]')).toContainText(/\+\d/);
  await page.locator('[data-action=away-ok]').tap();
  await expect(page.locator('[data-overlay=away]')).toBeHidden();
  expect(errors).toEqual([]);
});
