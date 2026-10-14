import { expect, test } from '@playwright/test';
import { collectErrors, open, seedSave, state } from './helpers.ts';

/** M3-05: the hatch show — 4–5 s of portraits, the result is the game's roll, «Sell now» pays the low end of the range. */
type S = { coins: number; hatchTiming: { start: number; result: number }; newest: { uid: string; species: string; low: number; high: number; name: string } | null };

test('M3-05 hatch show: 4–5 s, the roll on the card, sell now = the low end', async ({ page }) => {
  const errors = collectErrors(page);
  await seedSave(page, { coins: 0, incubators: [{ egg: 'egg_warm', progress: 30, elapsed: 30, waiting: false }] });
  await open(page);
  const before = (await state(page)) as unknown as S;
  const t = await page.evaluate(() => (window as unknown as { __TEST__: { targets(): { incubators: Array<{ x: number; y: number }> } } }).__TEST__.targets().incubators[0]!);
  await page.mouse.click(t.x, t.y);
  await expect(page.locator('[data-overlay=hatch]')).toBeVisible();
  await expect(page.locator('[data-hatch-result]')).toBeVisible({ timeout: 8000 });
  const s = (await state(page)) as unknown as S;
  const sec = (s.hatchTiming.result - s.hatchTiming.start) / 1000;
  expect(sec).toBeGreaterThanOrEqual(4);
  expect(sec).toBeLessThanOrEqual(5.5);
  // The card shows the creature the game hatched, the range and «Sell now» at its low end.
  await expect(page.locator('[data-hatch-name]')).toHaveText(s.newest!.name);
  await expect(page.locator('[data-hatch-range]')).toContainText(/\d/);
  await expect(page.locator('[data-action=hatch-sell]')).toHaveAttribute('data-price', String(s.newest!.low));
  await page.locator('[data-action=hatch-sell]').click();
  await expect(page.locator('[data-overlay=hatch]')).toBeHidden();
  await expect.poll(async () => ((await state(page)) as unknown as S).coins).toBe(before.coins + s.newest!.low);
  expect(errors).toEqual([]);
});
