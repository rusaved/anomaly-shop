import { expect, test, type Page } from '@playwright/test';
import { collectErrors, open, seedSave, state } from './helpers.ts';

/** M6 «Полировка»: sounds on every action, the new things and their secrets, events 13–15, marks, the shop name. */
type Sounds = Partial<Record<string, number>>;
const sounds = async (page: Page): Promise<Sounds> => ((await state(page)) as unknown as { sounds: Sounds }).sounds;
const incubator = (page: Page) =>
  page.evaluate(() => (window as unknown as { __TEST__: { targets(): { incubators: Array<{ x: number; y: number }> } } }).__TEST__.targets().incubators[0]!);

test('M6-01 the hatch wheel clicks as portraits pass the marker; the result has its rarity sound', async ({ page }) => {
  const errors = collectErrors(page);
  await seedSave(page, { coins: 0, incubators: [{ egg: 'egg_warm', progress: 30, elapsed: 30, waiting: false }] });
  await open(page);
  const t = await incubator(page);
  await page.mouse.click(t.x, t.y);
  await expect(page.locator('[data-hatch-result]')).toBeVisible({ timeout: 8000 });
  const s = await sounds(page);
  // 30 portraits pass in 4–5 s; the click is limited to one per 45 ms, so well over ten of them.
  expect(s.spin ?? 0).toBeGreaterThanOrEqual(10);
  expect((s.hatch ?? 0) + (s.rare ?? 0) + (s.vip ?? 0) + (s.exclusive ?? 0)).toBeGreaterThanOrEqual(1);
  expect(errors).toEqual([]);
});
