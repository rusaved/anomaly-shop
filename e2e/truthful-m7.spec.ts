import { expect, test, type Page } from '@playwright/test';
import { collectErrors, open, seedSave, state } from './helpers.ts';

/** M7-01, SND-03: a full-screen ad holds the game and its sound while it is on, both come back after it (the truthful stand). */
type T = { __TEST__: { runSim(s: number): number } };
type Sound = { sound: { suspended: boolean; context: string } };
const sound = async (page: Page) => ((await state(page)) as unknown as Sound).sound;

test('SND-03 a full-screen ad pauses the game and the sound; after it both go on', async ({ page }) => {
  const errors = collectErrors(page);
  await seedSave(page);
  await open(page, '?mock_fullscreen=tap&mock_ad_ms=1500');
  await page.evaluate(() => (window as unknown as T).__TEST__.runSim(181));
  await page.locator('[data-action=gifts]').click();
  await page.locator('[data-action=gifts-close]').click();
  await expect(page.locator('#__ya_mock_ad__[data-kind=fullscreen]')).toBeVisible();
  const during = await state(page);
  expect(during.pause.length).toBeGreaterThan(0);
  expect((await sound(page)).suspended).toBe(true);
  await expect(page.locator('#__ya_mock_ad__')).toBeHidden({ timeout: 5000 });
  await expect.poll(async () => (await state(page)).pause, { timeout: 3000 }).toEqual([]);
  expect((await sound(page)).suspended).toBe(false);
  expect(errors).toEqual([]);
});
