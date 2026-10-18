import { expect, test } from '@playwright/test';
import { collectErrors, open, seedSave } from './helpers.ts';

/** M3-09, MU-10: the market — lots 2 in a row with their rarity and verdict, the timer, a lot page opens; «Купить» buys below the market. */
test('M3-09 market: lots, timer, a lot page opens, a quick buy', async ({ page }) => {
  const errors = collectErrors(page);
  await seedSave(page, { coins: 5000, flags: { ftue_starter: true, ftue_done: true, ftue_fed: true, ftue_bought: true, showcase_m3: true } });
  await open(page);
  await page.evaluate(() => (window as unknown as { __TEST__: { runSim(s: number): number } }).__TEST__.runSim(1));
  await page.locator('[data-tab=market]').click();
  const lots = page.locator('[data-sheet=market] .card-lot');
  await expect(lots.first()).toBeVisible();
  expect(await lots.count()).toBeGreaterThan(0);
  await expect(page.locator('[data-market-timer]')).toContainText(/\d:\d\d/);
  // MU-01: every lot shows its rarity (the frame and the badge).
  for (const lot of await lots.all()) await expect(lot.locator('.rar-badge[data-rarity]')).toBeVisible();
  // A quick «Купить» (below or at the market) buys at once.
  const quick = page.locator('[data-sheet=market] [data-action^=lot-quick-]').first();
  if (await quick.isVisible()) {
    const before = ((await page.evaluate(() => (window as unknown as { __TEST__: { state(): { creatures: unknown[] } } }).__TEST__.state())) as { creatures: unknown[] }).creatures.length;
    await quick.click();
    await expect.poll(async () => ((await page.evaluate(() => (window as unknown as { __TEST__: { state(): { creatures: unknown[] } } }).__TEST__.state())) as { creatures: unknown[] }).creatures.length).toBe(before + 1);
  }
  // The lot page with the seller chat (MU-11).
  await page.locator('[data-sheet=market] .card-lot:not(.sold) [data-action^=lot-open-]').first().click();
  await expect(page.locator('[data-detail=lot] [data-action=lot-buy]')).toBeVisible();
  await expect(page.locator('[data-detail=lot] .lot-pet .mu-name')).not.toBeEmpty();
  expect(errors).toEqual([]);
});
