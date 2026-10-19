import { expect, test, type Page } from '@playwright/test';
import { collectErrors, open, state } from './helpers.ts';

/** The round of fixes of FB (the HQ pre-check, 19.10): what the producer's phone showed after the milestone. */
type Box = { x: number; y: number; width: number; height: number };
const incubator = (page: Page) =>
  page.evaluate(() => (window as unknown as { __TEST__: { targets(): { incubators: Array<{ x: number; y: number }> } } }).__TEST__.targets().incubators[0]!);
const center = (b: Box) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });
const inside = (p: { x: number; y: number }, b: Box, pad = 0) => p.x >= b.x - pad && p.x <= b.x + b.width + pad && p.y >= b.y - pad && p.y <= b.y + b.height + pad;
/** The gap between two boxes (0 when they touch or overlap). */
const gap = (a: Box, b: Box) => Math.hypot(Math.max(0, b.x - (a.x + a.width), a.x - (b.x + b.width)), Math.max(0, b.y - (a.y + a.height), a.y - (b.y + b.height)));

async function doubleTapSkip(page: Page): Promise<void> {
  const errors = collectErrors(page);
  await open(page);
  const t = await incubator(page);
  await page.touchscreen.tap(t.x, t.y);
  await expect(page.locator('[data-overlay=hatch]')).toBeVisible();
  await page.waitForTimeout(450);
  // Where a player taps to skip: the running strip and «тап — пропустить».
  const strip = (await page.locator('[data-action=hatch-skip]').boundingBox())!;
  const hint = (await page.locator('[data-hatch-skip]').boundingBox())!;
  // Two quick taps on the hint: the first skips, the second lands while the result's buttons still wait.
  await page.touchscreen.tap(center(hint).x, center(hint).y);
  await page.waitForTimeout(120);
  await page.touchscreen.tap(center(hint).x, center(hint).y);
  await expect(page.locator('[data-hatch-result]')).toBeVisible();
  // Past the lock the same points hold the pet and its rarity word — still no choice.
  await page.waitForTimeout(700);
  await page.touchscreen.tap(center(hint).x, center(hint).y);
  await page.touchscreen.tap(center(strip).x, center(strip).y);
  await page.waitForTimeout(300);
  await expect(page.locator('[data-overlay=hatch]')).toBeVisible();
  await expect(page.locator('[data-hatch-result]')).toBeVisible();
  const s = (await state(page)) as unknown as { coins: number; creatures: unknown[]; shelf: unknown[] };
  expect(s.coins).toBe(0);
  expect(s.creatures).toHaveLength(1);
  expect(s.shelf).toEqual([]);
  // «Продать сразу» is in neither skip point and 24 px or more from «На витрину».
  const sell = (await page.locator('[data-action=hatch-sell]').boundingBox())!;
  const shop = (await page.locator('[data-action=hatch-shop]').boundingBox())!;
  expect(inside(center(hint), sell, 8)).toBe(false);
  expect(inside(center(strip), sell, 8)).toBe(false);
  expect(gap(sell, hint)).toBeGreaterThan(0);
  expect(gap(sell, shop)).toBeGreaterThanOrEqual(23.5);
  // The buttons work after the lock.
  await page.locator('[data-action=hatch-keep]').click();
  await expect(page.locator('[data-overlay=hatch]')).toBeHidden();
  expect(errors).toEqual([]);
}

test.describe('Круг правок FB п. 1 portrait 375×650', () => {
  test.use({ viewport: { width: 375, height: 650 }, hasTouch: true, isMobile: true });
  test('an egg → two quick taps on the strip → the pet is not sold, «Вылупился!» stays', ({ page }) => doubleTapSkip(page));

  test('the buttons of the result take no press for 0.5 s after it shows', async ({ page }) => {
    await open(page);
    const t = await incubator(page);
    await page.touchscreen.tap(t.x, t.y);
    await page.waitForTimeout(450);
    await page.locator('[data-action=hatch-skip]').dispatchEvent('click');
    await expect(page.locator('[data-action=hatch-shop]')).toHaveAttribute('aria-disabled', 'true');
    await page.locator('[data-action=hatch-shop]').dispatchEvent('click');
    await page.locator('[data-action=hatch-sell]').dispatchEvent('click');
    await expect(page.locator('[data-overlay=hatch]')).toBeVisible();
    await expect(page.locator('[data-action=hatch-shop]')).toHaveAttribute('aria-disabled', 'false');
    await page.locator('[data-action=hatch-shop]').click();
    await expect(page.locator('[data-overlay=hatch]')).toBeHidden();
    expect(((await state(page)) as unknown as { shelf: unknown[] }).shelf).toHaveLength(1);
  });
});

test.describe('Круг правок FB п. 1 sideways 812×330', () => {
  test.use({ viewport: { width: 812, height: 330 }, hasTouch: true, isMobile: true });
  test('an egg → two quick taps on the strip → the pet is not sold, «Вылупился!» stays', ({ page }) => doubleTapSkip(page));
});
