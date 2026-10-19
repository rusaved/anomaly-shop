import { expect, test } from '@playwright/test';
import { collectErrors, open, seedSave, state } from './helpers.ts';

/** M3-05, UB-03: the hatch as a case — the strip runs 4–5 s, the creature shows only after it; Take / Sell now / To the shop. */
type S = { coins: number; creatures: unknown[]; shelf: string[]; hatchTiming: { start: number; result: number }; newest: { uid: string; species: string; low: number; high: number; name: string } | null };
const st = (page: import('@playwright/test').Page) => state(page) as unknown as Promise<S>;
const incubator = (page: import('@playwright/test').Page) =>
  page.evaluate(() => (window as unknown as { __TEST__: { targets(): { incubators: Array<{ x: number; y: number }> } } }).__TEST__.targets().incubators[0]!);

test('UB-03 the first egg opens with one tap; the creature is nowhere until the strip stops; a tap skips; three choices', async ({ page }) => {
  const errors = collectErrors(page);
  await open(page);
  const t = await incubator(page);
  await page.mouse.click(t.x, t.y);
  await expect(page.locator('[data-overlay=hatch]')).toBeVisible();
  // During the run: «tap to skip», no result yet, the creature is not on the shelf of the scene nor in «My sales».
  await expect(page.locator('[data-hatch-skip]')).toBeVisible();
  await expect(page.locator('[data-hatch-result]')).toBeHidden();
  const mid = await st(page);
  expect(mid.creatures).toHaveLength(1);
  expect(mid.shelf).toEqual([]);
  // A tap on the strip shows the result at once (a tap, not the one that cracked the egg: UB-10).
  await page.waitForTimeout(450);
  await page.locator('[data-action=hatch-skip]').click();
  await expect(page.locator('[data-hatch-result]')).toBeVisible();
  await expect(page.locator('[data-hatch-skip]')).toBeHidden();
  const s = await st(page);
  // Far sooner than the 4–5 s run (a loaded machine adds its own lag to the 450 ms wait above).
  expect(s.hatchTiming.result - s.hatchTiming.start).toBeLessThan(2500);
  for (const action of ['hatch-keep', 'hatch-sell', 'hatch-shop']) await expect(page.locator(`[data-action=${action}]`)).toBeVisible();
  await expect(page.locator('[data-action=hatch-keep]')).toHaveText(await page.evaluate(() => (window as unknown as { __TEST__: { t(k: string): string } }).__TEST__.t('hatch.keep')));
  // «To the shop»: now it stands on the shelf.
  await page.locator('[data-action=hatch-shop]').click();
  await expect(page.locator('[data-overlay=hatch]')).toBeHidden();
  expect((await st(page)).shelf).toHaveLength(1);
  expect(errors).toEqual([]);
});

test('M3-05 hatch show: 4–5 s, the roll on the card, sell now = the low end', async ({ page }) => {
  const errors = collectErrors(page);
  await seedSave(page, { coins: 0, incubators: [{ egg: 'egg_warm', progress: 30, elapsed: 30, waiting: false }] });
  await open(page);
  const before = await st(page);
  const t = await incubator(page);
  await page.mouse.click(t.x, t.y);
  await expect(page.locator('[data-overlay=hatch]')).toBeVisible();
  await expect(page.locator('[data-hatch-result]')).toBeVisible({ timeout: 8000 });
  const s = await st(page);
  const sec = (s.hatchTiming.result - s.hatchTiming.start) / 1000;
  expect(sec).toBeGreaterThanOrEqual(4);
  expect(sec).toBeLessThanOrEqual(5.5);
  // The card shows the creature the game hatched, the range and «Sell now» at its low end.
  await expect(page.locator('[data-hatch-name]')).toHaveText(s.newest!.name);
  await expect(page.locator('[data-hatch-range]')).toContainText(/\d/);
  await expect(page.locator('[data-action=hatch-sell]')).toHaveAttribute('data-price', String(s.newest!.low));
  // FB-15, круг правок п. 1: the buttons take a tap 0.5 s after the result shows (feel.json hatchLockSec; a double tap of the skip never sells).
  await page.waitForTimeout(650);
  await page.locator('[data-action=hatch-sell]').click();
  await expect(page.locator('[data-overlay=hatch]')).toBeHidden();
  await expect.poll(async () => (await st(page)).coins).toBe(before.coins + s.newest!.low);
  expect(errors).toEqual([]);
});
