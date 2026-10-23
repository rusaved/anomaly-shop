import { expect, test, type Page } from '@playwright/test';
import { open, readability, seedSave } from './helpers.ts';

// M5-04, M5-02 on the phone (both orientations): «Акции» and the ad buttons read and tap — text ≥ 12 px, buttons ≥ 44 px,
// nothing covered or cut (UB-07); the store only with ?payments=1 (game.json keeps it off till «Сборка»).
type T = { __TEST__: { runSim(s: number): number } };
const runSim = (page: Page, s: number): Promise<number> => page.evaluate((x) => (window as unknown as T).__TEST__.runSim(x), s);

test('M5-04 «Акции» on the phone: every pack readable, its price button whole', async ({ page }) => {
  await seedSave(page);
  await open(page, '?payments=1');
  await runSim(page, 181);
  await page.locator('[data-tab=shop]').click();
  await page.locator('[data-sheet=shop] [data-sub=deals]').click();
  const box = page.locator('[data-section=deals]');
  await expect(box.locator('[data-store=starter]')).toBeVisible();
  for (const id of ['starter', 'season', 'mega', 'coins_s', 'coins_m', 'coins_l', 'no_ads']) {
    const b = box.locator(`[data-action=store-buy-${id}]`);
    await b.scrollIntoViewIfNeeded();
    const r = (await b.boundingBox())!;
    expect(r.height).toBeGreaterThanOrEqual(44);
    const vp = page.viewportSize()!;
    expect(r.x).toBeGreaterThanOrEqual(0);
    expect(r.x + r.width).toBeLessThanOrEqual(vp.width + 0.5);
    const rr = await readability(page);
    expect([...rr.small, ...rr.tiny, ...rr.covered, ...rr.cut]).toEqual([]);
  }
});

test('M5-02 ad buttons on the phone: the egg cards, the market and the gifts tile read and tap', async ({ page }) => {
  await seedSave(page, { stats: { deals: 30, coinsEarned: 5000, hatched: 20, taps: 300, levelUps: 6, haggles: 2, xp: 400 } });
  await open(page);
  await page.locator('[data-tab=eggs]').click();
  const egg = page.locator('[data-sheet=eggs] [data-action=ad-egg-ad_gold]');
  await egg.scrollIntoViewIfNeeded();
  expect((await egg.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  let r = await readability(page);
  expect([...r.small, ...r.tiny, ...r.covered, ...r.cut]).toEqual([]);
  await page.locator('[data-tab=market]').click();
  await expect(page.locator('[data-sheet=market] [data-action=ad-skip]')).toBeVisible();
  r = await readability(page);
  expect([...r.small, ...r.tiny, ...r.covered, ...r.cut]).toEqual([]);
  await page.locator('[data-action=gifts]').click();
  r = await readability(page);
  expect([...r.small, ...r.tiny, ...r.covered, ...r.cut]).toEqual([]);
  const boost = page.locator('[data-action=ad-boost]');
  await boost.scrollIntoViewIfNeeded();
  const box = (await boost.boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(44);
  // Scrolled to it: the button itself is on top at its centre (the rows above may slide under the title — that is scrolling).
  const top = await page.evaluate(({ x, y }) => (document.elementFromPoint(x, y) as HTMLElement | null)?.closest('[data-action]')?.getAttribute('data-action'), { x: box.x + box.width / 2, y: box.y + box.height / 2 });
  expect(top).toBe('ad-boost');
});
