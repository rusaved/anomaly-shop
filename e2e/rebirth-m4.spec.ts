import { expect, test } from '@playwright/test';
import { collectErrors, open, seedSave, state } from './helpers.ts';

/** M4-06: the move to a new city — the «Next» card says it is ready, a popup asks, «Move» starts the shop over in city 2; the collection stays. */
test('M4-06 rebirth: ready → the popup asks → a new city, the collection stays', async ({ page }) => {
  const errors = collectErrors(page);
  await seedSave(page, {
    coins: 4000,
    stats: { deals: 200, coinsEarned: 100_000, hatched: 210, taps: 900, levelUps: 50, haggles: 4, xp: 400 },
    collection: { kettle: { seen: 3, hatched: 3, sold: 3 } },
  });
  await open(page);
  const next = page.locator('[data-action=next]');
  await expect(next).toHaveAttribute('data-kind', 'rebirth');
  await next.click();
  const win = page.locator('[data-overlay=rebirth]');
  await expect(win).toBeVisible();
  await expect(win.locator('[data-rebirth-mult]')).toContainText('1,25');
  // «Later» keeps everything as it was.
  await win.locator('[data-action=rebirth-later]').click();
  await expect(win).toBeHidden();
  expect(((await state(page)) as unknown as { city: number }).city).toBe(1);
  // The seller level panel has the way to the new city too.
  await page.locator('[data-action=reputation]').click();
  await page.locator('[data-action=rep-city]').click();
  await expect(win).toBeVisible();
  await win.locator('[data-action=rebirth-move]').click();
  await expect(win).toBeHidden();
  const s = (await state(page)) as unknown as { city: number; coins: number; upgrades: Record<string, number> };
  expect(s.city).toBe(2);
  expect(s.coins).toBe(50);
  expect(s.upgrades).toEqual({});
  await page.locator('[data-tab=inventory]').click();
  await page.locator('[data-sheet=inventory] [data-sub=collection]').click();
  await expect(page.locator('[data-species=kettle]')).toHaveAttribute('data-status', 'sold');
  expect(errors).toEqual([]);
});
