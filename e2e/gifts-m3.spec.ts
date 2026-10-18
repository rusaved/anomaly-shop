import { expect, test } from '@playwright/test';
import { collectErrors, open, seedSave, state } from './helpers.ts';

/** M3-11: «Gifts» — today's gift once and kept after F5; the review gives the golden egg once (mock SDK). */
type S = { coins: number };

test('M3-11 gifts: the daily gift and the review egg once, kept after a reload', async ({ page }) => {
  const errors = collectErrors(page);
  await seedSave(page, { coins: 0, flags: { ftue_starter: true, ftue_done: true, ftue_fed: true, ftue_bought: true, showcase_m3: true } });
  await open(page);
  await expect(page.locator('[data-action=gifts] [data-gifts-dot]')).toBeVisible();
  await page.locator('[data-action=gifts]').click();
  await expect(page.locator('[data-overlay=gifts]')).toBeVisible();
  await page.locator('[data-action=gift-daily]').click();
  await expect.poll(async () => ((await state(page)) as unknown as S).coins).toBeGreaterThan(0);
  await expect(page.locator('[data-action=gift-daily]')).toHaveCount(0);
  // MU-09: «За отзыв» opens the review window of the 07 style; «Оценить» there asks the platform.
  await page.locator('[data-action=gift-review]').click();
  await expect(page.locator('[data-overlay=rate]')).toBeVisible();
  await expect(page.locator('[data-overlay=gifts]')).toBeVisible();
  await page.locator('[data-overlay=rate] [data-action=rate-send]').click();
  await expect(page.locator('[data-overlay=rate]')).toBeHidden();
  await expect(page.locator('[data-action=gift-review]')).toHaveCount(0);
  const coins = ((await state(page)) as unknown as S).coins;
  await page.waitForTimeout(400);
  await page.reload();
  await page.waitForFunction(() => (window as unknown as { __TEST__?: { state(): { controllable: boolean } } }).__TEST__?.state().controllable);
  await page.locator('[data-action=gifts]').click();
  await expect(page.locator('[data-action=gift-daily]')).toHaveCount(0);
  await expect(page.locator('[data-action=gift-review]')).toHaveCount(0);
  expect(((await state(page)) as unknown as S).coins).toBe(coins);
  expect(errors).toEqual([]);
});
