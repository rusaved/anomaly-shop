import { expect, test, type Page } from '@playwright/test';
import { collectErrors, open, seedSave, state } from './helpers.ts';

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

/** п. 2: the upgrades are rows without a fill (a 1 px line, the icon 40 without a tile), only a price the coins cover is filled; one look in «Лавка» and «Магазин»;
 * the shelf places in the room are 44 px or more, 8 px apart, a «+» is the place itself (inside the shelf). */
async function rowsLook(page: Page, sheet: 'home' | 'shop') {
  return page.evaluate((id) => {
    const rows = [...document.querySelectorAll<HTMLElement>(`[data-sheet=${id}] [data-section=upgrades] .shop-item`)].filter((r) => r.offsetParent);
    const cs = (el: Element) => getComputedStyle(el);
    return rows.map((r) => {
      const pic = r.querySelector<HTMLElement>('.mu-pic');
      const btn = r.querySelector<HTMLElement>('.mu-btn')!;
      return {
        bg: cs(r).backgroundColor,
        line: cs(r).borderBottomWidth,
        pic: pic ? `${Math.round(pic.getBoundingClientRect().width)}:${cs(pic).backgroundColor}` : 'none',
        can: r.classList.contains('can'),
        price: cs(btn).backgroundColor,
      };
    });
  }, sheet);
}
const NONE = 'rgba(0, 0, 0, 0)';
for (const [w, h] of [[375, 650], [812, 330]] as const)
  test.describe(`Круг правок FB п. 2 ${w}×${h}`, () => {
    test.use({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true });
    test('the upgrades: rows without a fill, only an affordable price filled — the same in «Лавка» and «Магазин»; the shelf places 44+ px, 8 px apart', async ({ page }) => {
      const errors = collectErrors(page);
      await seedSave(page, { coins: 120, upgrades: { showcase: 2, incubator: 1 }, showcase: ['e2e1'] });
      await open(page);
      const home = await rowsLook(page, 'home');
      await page.locator('[data-tab=shop]').click();
      const shop = await rowsLook(page, 'shop');
      for (const rows of [home, shop]) {
        expect(rows.length).toBeGreaterThan(1);
        for (const r of rows) {
          expect(r.bg).toBe(NONE);
          expect(r.line).toBe('1px');
          expect(r.pic).toBe(`40:${NONE}`);
          expect(r.price === NONE).toBe(!r.can);
        }
        expect(rows.some((r) => r.can) && rows.some((r) => !r.can)).toBe(true);
      }
      // One look: the same rows (and the same filled prices) in both places.
      expect(shop.slice(0, home.length)).toEqual(home);
      await page.locator('[data-tab=home]').click();
      const plus = page.locator('.shelf-free');
      await expect(plus.first()).toBeVisible();
      const t = (await page.evaluate(() => (window as unknown as { __TEST__: { targets(): { slots: Array<{ x: number; y: number }> } } }).__TEST__.targets().slots))!;
      const boxes = await plus.evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => ({ x: r.x, y: r.y, width: r.width, height: r.height })));
      for (const b of boxes) {
        expect(b.width).toBeGreaterThanOrEqual(44);
        expect(b.height).toBeGreaterThanOrEqual(44);
        // The «+» is its place: its centre is the place's centre (inside the shelf frame).
        expect(t.some((s) => Math.abs(s.x - center(b).x) <= 1 && Math.abs(s.y - center(b).y) <= 1)).toBe(true);
      }
      const step = Math.abs(t[1]!.x - t[0]!.x);
      expect(step - boxes[0]!.width).toBeGreaterThanOrEqual(7.5);
      expect(step - boxes[0]!.width).toBeLessThanOrEqual(8.5);
      expect(errors).toEqual([]);
    });
  });
