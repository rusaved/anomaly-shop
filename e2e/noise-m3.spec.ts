import { expect, test } from '@playwright/test';
import { collectErrors, open, seedSave } from './helpers.ts';

/** M3-18: less noise — over 60 game seconds there is never more than one text on screen; the ticker keeps quiet without a reason. */
test('M3-18 one text at a time; the ticker is quiet without a reason', async ({ page }) => {
  const errors = collectErrors(page);
  await seedSave(page, { coins: 5000, flags: { ftue_starter: true, ftue_done: true, ftue_fed: true, ftue_bought: true, showcase_m3: true } });
  await open(page);
  // At the start nothing new happened: the ticker is hidden.
  await page.waitForTimeout(1500);
  await expect(page.locator('[data-news]')).toBeHidden();
  // Many things at once: several toasts asked for in one go still come one by one.
  await page.evaluate(() => {
    const api = (window as unknown as { __TEST__: { setTimeScale(k: number): void; toast(text: string): void } }).__TEST__;
    for (const s of ['one', 'two', 'three']) api.toast(s);
    api.setTimeScale(3);
  });
  let most = 0;
  for (let i = 0; i < 80; i++) {
    most = Math.max(most, await page.locator('.toast:not(.out)').count());
    await page.waitForTimeout(250);
  }
  expect(most).toBe(1);
  expect(errors).toEqual([]);
});
