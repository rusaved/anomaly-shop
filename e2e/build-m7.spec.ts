import { expect, test } from '@playwright/test';
import { collectErrors, open, seedSave } from './helpers.ts';

/** M7 «Сборка»: the release candidate's own checks. */
const BLANK = 'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7#';

test('M7-00 the pictures held back for the first screen are all drawn right after it, on every tab', async ({ page }) => {
  const errors = collectErrors(page);
  // A shop well into the game: every tab is open and has pictures.
  await seedSave(page, { coins: 1000, flags: { ftue_starter: true, ftue_done: true, ftue_fed: true, ftue_bought: true }, stats: { deals: 8, coinsEarned: 300, hatched: 10, taps: 100, levelUps: 3, haggles: 1 } });
  await open(page);
  const blanks = () => page.evaluate((b) => [...document.querySelectorAll('img')].filter((i) => (i.getAttribute('src') ?? '').includes(b)).length, BLANK);
  await expect.poll(blanks, { timeout: 5000 }).toBe(0);
  for (const tab of await page.locator('.nav-tab:visible').all()) {
    await tab.click();
    await page.waitForTimeout(300);
    expect(await blanks()).toBe(0);
  }
  expect(await page.locator('.nav-tab:visible').count()).toBeGreaterThanOrEqual(5);
  expect(errors).toEqual([]);
});
