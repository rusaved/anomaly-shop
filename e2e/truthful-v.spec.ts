import { expect, test, type Page } from '@playwright/test';
import { collectErrors, open, seedSave } from './helpers.ts';
import { closeAll, FRAMES_SAVE } from './frames-shared.ts';

/**
 * V «Выход на VK и ОК» (Ресейл 16), V-01 — the rest of the pass of «Ресейл 15» (Q-064 п. 1, 2) on the phone sideways (815×290 with the
 * browser's panel, 812×330, 880×405): a long feeding series with coins opens no «Кого выставить» when the buyer takes the pet; a ready gift
 * egg stands first in «Мои яйца»; the hint «Покупатель пишет…» leaves «Подработка» free. Every check taps like a finger.
 */
const SIZES = [
  { width: 815, height: 290 },
  { width: 812, height: 330 },
  { width: 880, height: 405 },
];
type T = { __TEST__: { grant(n: number): void; runSim(s: number): number; setTimeScale(k: number): void; targets(): { incubators: Array<{ x: number; y: number }>; slots: Array<{ x: number; y: number }> } | null; t(k: string): string } };
const targets = async (page: Page) => (await page.evaluate(() => (window as unknown as T).__TEST__.targets()))!;

/** From a fresh save: the first egg hatched into the shop, the pet on the shelf; its place under the finger. */
async function firstPet(page: Page, coins: number) {
  await open(page);
  const egg = (await targets(page)).incubators[0]!;
  await page.touchscreen.tap(egg.x, egg.y);
  await page.locator('[data-overlay=hatch] [data-action=hatch-shop]').click({ timeout: 10_000 });
  await expect(page.locator('[data-overlay=hatch]')).toBeHidden();
  if (coins) await page.evaluate((n) => (window as unknown as T).__TEST__.grant(n), coins);
  return (await targets(page)).slots[0]!;
}

for (const size of SIZES) {
  const tag = `${size.width}x${size.height}`;
  test.describe(`${tag} V-01`, () => {
    test.use({ viewport: size, isMobile: true, hasTouch: true });

    for (const run of [1, 2, 3, 4]) {
      test(`V-01 feeding with 10+ coins through the buyer's taking: the series opens no «Кого выставить» (run ${run}) @ ${tag}`, async ({ page }) => {
        test.setTimeout(120_000);
        const errors = collectErrors(page);
        const pet = await firstPet(page, 50);
        // The gaps between the finger's taps as the page sees them (a busy machine stretches them).
        await page.evaluate(() => {
          const w = window as unknown as { __gap: number; __last: number };
          w.__gap = 0;
          w.__last = 0;
          window.addEventListener('pointerdown', () => {
            const t = performance.now();
            if (w.__last) w.__gap = Math.max(w.__gap, t - w.__last);
            w.__last = t;
          }, true);
        });
        const sales = page.locator('[data-sheet=sales]');
        // A tap every ~150 ms until the buyer writes and ~2 s past it (the place is a «+» under the finger by then); one round trip a tap.
        const look = () =>
          page.evaluate(() => ({
            badge: Boolean(document.querySelector<HTMLElement>('[data-tab=chats] [data-badge]')?.offsetParent),
            sales: Boolean(document.querySelector<HTMLElement>('[data-sheet=sales]')?.offsetParent),
            gap: (window as unknown as { __gap: number }).__gap,
          }));
        let after = 0;
        for (let i = 0; i < 500 && after < 14; i++) {
          await page.touchscreen.tap(pet.x, pet.y);
          await page.waitForTimeout(120);
          const now = await look();
          if (after || now.badge) after++;
          expect(now.sales, `tap ${i}: no «Кого выставить» (the longest gap between taps ${Math.round(now.gap)} ms)`).toBe(false);
        }
        expect(after, 'a buyer wrote').toBeGreaterThan(0);
        await expect(page.locator('[data-shelf-plus] .shelf-free').first()).toBeVisible();
        // The finger stops; a fresh tap later is deliberate and opens the pick.
        await page.waitForTimeout(1500);
        await page.touchscreen.tap(pet.x, pet.y);
        await expect(sales).toBeVisible();
        expect(errors).toEqual([]);
      });
    }

    test(`V-01 the hint «Покупатель пишет…» leaves «Подработка» free @ ${tag}`, async ({ page }) => {
      test.setTimeout(120_000);
      const errors = collectErrors(page);
      const pet = await firstPet(page, 0);
      const badge = page.locator('[data-tab=chats] [data-badge]');
      for (let i = 0; i < 500 && !(await badge.isVisible()); i++) {
        await page.touchscreen.tap(pet.x, pet.y);
        await page.waitForTimeout(150);
      }
      await page.waitForTimeout(1000);
      await page.touchscreen.tap(pet.x, pet.y);
      const hint = await page.evaluate(() => (window as unknown as T).__TEST__.t('sales.hint.talking'));
      const toast = page.locator('.toasts').getByText(hint);
      await expect(toast).toBeVisible();
      await page.waitForTimeout(300);
      const work = page.locator('.stage-work').first();
      await expect(work).toBeVisible();
      const [a, b] = [(await toast.boundingBox())!, (await work.boundingBox())!];
      const meets = a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
      await page.screenshot({ path: `test-results/v01-toast-${tag}.png` });
      expect(meets, `toast ${JSON.stringify(a)} off «Подработка» ${JSON.stringify(b)}`).toBe(false);
      // A tap on «Подработка» while the hint shows reaches it.
      await work.tap();
      await expect(page.locator('[data-overlay=work]')).toBeVisible();
      expect(errors).toEqual([]);
    });

    test(`V-01 a ready gift egg stands first in «Мои яйца» even after the row was scrolled @ ${tag}`, async ({ page }) => {
      const errors = collectErrors(page);
      const egging = { egg: 'egg_basic', startedAt: 0, progress: 0, elapsed: 0, waiting: false, careFed: 1 };
      // The gift egg comes back in 20 s of play; three eggs warm in the incubators.
      await seedSave(page, { ...FRAMES_SAVE, freeIn: { egg_gift: 20 }, incubators: [egging, egging, egging], upgrades: { ...FRAMES_SAVE.upgrades, incubator: 2 } });
      await open(page);
      await page.evaluate(() => (window as unknown as T).__TEST__.setTimeScale(0));
      await closeAll(page);
      await page.locator('[data-tab=eggs]').click();
      await page.waitForTimeout(400);
      const row = page.locator('[data-sheet=eggs] [data-section=my]');
      await row.evaluate((e) => e.scrollTo({ left: e.scrollWidth }));
      // Time runs until the gift egg is ready.
      expect(await row.evaluate((e) => e.scrollLeft), 'scrolled away').toBeGreaterThan(0);
      await page.evaluate(() => (window as unknown as T).__TEST__.runSim(30));
      const take = page.locator('[data-sheet=eggs] [data-section=my] [data-action^=egg-free-]');
      await expect(take).toHaveAttribute('aria-disabled', 'false', { timeout: 5000 });
      await page.waitForTimeout(600);
      const first = await row.evaluate((e) => (e.firstElementChild as HTMLElement).querySelector('[data-action^=egg-free-]') !== null);
      expect(first, 'the gift egg first in the row').toBe(true);
      const sight = await row.evaluate((e) => {
        const r = e.querySelector('[data-action^=egg-free-]')!.getBoundingClientRect();
        const box = e.getBoundingClientRect();
        return r.left >= box.left - 0.5 && r.right <= box.right + 0.5;
      });
      expect(sight, '«Забрать» in sight without scrolling').toBe(true);
      expect(errors).toEqual([]);
    });
  });
}
