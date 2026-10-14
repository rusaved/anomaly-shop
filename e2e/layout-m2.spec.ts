import { expect, test } from '@playwright/test';
import { collectErrors, expectInsideViewport, expectNoPageScroll, open, seedSave } from './helpers.ts';

/** M2-13 on the phone projects (375×812 and 812×375): the «Next» card is seen past the first minute and moves on when reached. */
test('M2-13 the Next card: inside the viewport, one goal, a flash and the next one when reached', async ({ page }) => {
  const errors = collectErrors(page);
  await seedSave(page);
  await open(page, '?mock_device=mobile');
  await expectNoPageScroll(page);
  await expectInsideViewport(page, ['[data-action=next]', '[data-action=upgrades]', '[data-action=sell]', '[data-action=buy-egg]']);
  const card = page.locator('[data-action=next]');
  await expect(card).toHaveCount(1);
  const before = await card.locator('b').textContent();
  expect(before?.length).toBeGreaterThan(0);
  await expect(card.locator('[data-next-left]')).toContainText(/\d/);
  await page.evaluate(() => (window as unknown as { __TEST__: { grant(n: number): void } }).__TEST__.grant(60));
  await expect(card).toHaveClass(/flash/);
  await expect(card.locator('b')).not.toHaveText(before ?? '');
  await card.tap();
  await expect(page.locator('[data-overlay=upgrades]')).toBeVisible();
  expect(errors).toEqual([]);
});

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
