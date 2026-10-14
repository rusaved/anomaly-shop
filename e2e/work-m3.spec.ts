import { expect, test } from '@playwright/test';
import { collectErrors, open, seedSave, state } from './helpers.ts';

/** M3-12: «Side job» — a tap on the bowl gives «+N» and coins. */
test('M3-12 side job: a tap gives +N', async ({ page }) => {
  const errors = collectErrors(page);
  await seedSave(page, { coins: 0, flags: { ftue_starter: true, ftue_done: true, ftue_fed: true, ftue_bought: true, showcase_m3: true } });
  await open(page);
  await page.locator('[data-action=work]').click();
  await expect(page.locator('[data-overlay=work]')).toBeVisible();
  await page.locator('[data-action=work-tap]').click();
  await expect(page.locator('.work-float').first()).toHaveText(/^\+\d/);
  await expect.poll(async () => ((await state(page)) as unknown as { coins: number }).coins).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});
