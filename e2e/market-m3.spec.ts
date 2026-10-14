import { expect, test } from '@playwright/test';
import { collectErrors, open, seedSave } from './helpers.ts';

/** M3-09: the market — lots with a verdict and a range bar, the timer and «Don't wait», a lot card opens. */
test('M3-09 market: lots, timer, don\'t wait, a lot card opens', async ({ page }) => {
  const errors = collectErrors(page);
  await seedSave(page, { coins: 5000, flags: { ftue_starter: true, ftue_done: true, ftue_fed: true, ftue_bought: true, showcase_m3: true } });
  await open(page);
  await page.evaluate(() => (window as unknown as { __TEST__: { runSim(s: number): number } }).__TEST__.runSim(1));
  await page.locator('[data-tab=market]').click();
  const lots = page.locator('[data-sheet=market] .card-lot');
  await expect(lots.first()).toBeVisible();
  expect(await lots.count()).toBeGreaterThan(0);
  await expect(page.locator('[data-market-timer]')).toContainText(/\d:\d\d/);
  const first = await lots.first().getAttribute('data-lot');
  await page.locator('[data-action=market-refresh]').click();
  await expect(lots.first()).not.toHaveAttribute('data-lot', first ?? '');
  // UB-02: a lot is a detail — a panel from the right.
  await lots.first().click();
  await expect(page.locator('[data-overlay=lot] [data-action=lot-buy]')).toBeVisible();
  await expect(page.locator('[data-overlay=lot] .chat-item-name')).not.toBeEmpty();
  expect(errors).toEqual([]);
});
