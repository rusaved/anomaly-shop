import { expect, test, type Page } from '@playwright/test';
import { collectErrors, open, seedSave, state } from './helpers.ts';
import { closeAll, FRAMES_SAVE, OPENERS } from './frames-shared.ts';

/**
 * F «Первая минута и яйца» (Ресейл 15): the live pass of the producer's phone sideways (815×290 with the browser's panel, 812×330,
 * 880×405) — when a buyer wrote, a «+» took the pet's place under the finger and the next feeding tap opened «Кого выставить · На складе
 * пусто · Купить яйцо» with no coins. Every check here taps like a finger.
 */
const PANEL = { width: 815, height: 290 };
const TALL = { width: 812, height: 330 };
const PHONE = { width: 880, height: 405 };
const SIZES = [PANEL, TALL, PHONE];

type T = { __TEST__: { grant(n: number): void; runSim(s: number): number; setTimeScale(k: number): void; targets(): { incubators: Array<{ x: number; y: number }>; slots: Array<{ x: number; y: number }> } | null; t(k: string): string } };
const navTop = async (page: Page) => (await page.locator('#nav').boundingBox())!.y;
/** The first visible match: its box and what a tap at its middle reaches if not itself. */
async function box(page: Page, sel: string) {
  const b = await page.evaluate((q) => {
    const el = [...document.querySelectorAll<HTMLElement>(q)].find((e) => e.offsetParent !== null);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    const covered = hit && hit !== el && !el.contains(hit) && !hit.contains(el) ? (hit as HTMLElement).className || hit.tagName : '';
    return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, covered };
  }, sel);
  expect(b, `${sel} on screen`).not.toBeNull();
  return b!;
}
/** Whole over the tab bar (less the fade of a list sideways) and nothing on its middle. */
async function whole(page: Page, sel: string, fade = 14) {
  const b = await box(page, sel);
  expect(b.bottom, `${sel} over the tab bar`).toBeLessThanOrEqual((await navTop(page)) - fade + 0.5);
  expect(b.covered, `${sel} not covered`).toBe('');
  return b;
}
/** A shop with coins, time stopped, no window open; `patch` over the saved shop of the shots. */
async function rich(page: Page, patch: Record<string, unknown> = {}): Promise<void> {
  await seedSave(page, { ...FRAMES_SAVE, ...patch });
  await open(page);
  await page.evaluate(() => {
    (window as unknown as T).__TEST__.runSim(1);
    (window as unknown as T).__TEST__.setTimeScale(0);
  });
  await closeAll(page);
}
const egging = { egg: 'egg_basic', startedAt: 0, progress: 0, elapsed: 0, waiting: false, careFed: 1 };
/** «Мои яйца» of two eggs (one row before F-02) and of four (three incubators with eggs and the gift: two rows before F-02). */
const MY_ROWS = {
  1: {},
  2: { incubators: [egging, egging, egging], upgrades: { ...FRAMES_SAVE.upgrades, incubator: 2 } },
} as const;
const targets = async (page: Page) => (await page.evaluate(() => (window as unknown as T).__TEST__.targets()))!;

for (const size of SIZES) {
  const tag = `${size.width}x${size.height}`;
  test.describe(`${tag} first minute`, () => {
    test.use({ viewport: size, isMobile: true, hasTouch: true });

    test(`F-01 feeding taps while a buyer writes open no window; the empty place at 0 coins gives a hint, not «Купить яйцо» @ ${tag}`, async ({ page }) => {
      test.setTimeout(120_000);
      const errors = collectErrors(page);
      await open(page);
      const egg = (await targets(page)).incubators[0]!;
      await page.touchscreen.tap(egg.x, egg.y);
      await page.locator('[data-overlay=hatch] [data-action=hatch-shop]').click({ timeout: 10_000 });
      await expect(page.locator('[data-overlay=hatch]')).toBeHidden();
      const pet = (await targets(page)).slots[0]!;
      const sales = page.locator('[data-sheet=sales]');
      const badge = page.locator('[data-tab=chats] [data-badge]');
      // Feeding: a tap every 120 ms on the pet until the buyer writes and a little past it (the place turns into a «+» under the finger).
      let after = 0;
      for (let i = 0; i < 400 && after < 3; i++) {
        await page.touchscreen.tap(pet.x, pet.y);
        await page.waitForTimeout(120);
        if (await badge.isVisible()) after++;
        expect(await sales.isVisible(), `tap ${i}: no «Кого выставить»`).toBe(false);
      }
      expect(after, 'a buyer wrote').toBeGreaterThan(0);
      // The place is free now; the taps of the moment it changed opened nothing.
      await expect(page.locator('[data-shelf-plus] .shelf-free').first()).toBeVisible();
      const s = await state(page);
      expect(s.coins, "less than the cheapest egg").toBeLessThan(10);
      // A deliberate tap on the «+» later: nothing to put and nothing to buy with — a short hint what to do, no dead end.
      await page.waitForTimeout(500);
      await page.touchscreen.tap(pet.x, pet.y);
      await page.waitForTimeout(400);
      expect(await sales.isVisible()).toBe(false);
      const hint = await page.evaluate(() => (window as unknown as T).__TEST__.t('sales.hint.talking'));
      await expect(page.locator('.toasts').getByText(hint)).toBeVisible();
      expect(errors).toEqual([]);
    });
    test(`F-01 with coins: a tap in the 400 ms after the place freed opens nothing, a later tap opens «Кого выставить» @ ${tag}`, async ({ page }) => {
      test.setTimeout(120_000);
      const errors = collectErrors(page);
      await open(page);
      const egg = (await targets(page)).incubators[0]!;
      await page.touchscreen.tap(egg.x, egg.y);
      await page.locator('[data-overlay=hatch] [data-action=hatch-shop]').click({ timeout: 10_000 });
      await page.evaluate(() => (window as unknown as T).__TEST__.grant(100));
      const pet = (await targets(page)).slots[0]!;
      const sales = page.locator('[data-sheet=sales]');
      // The moment the place frees, a press on its «+» 50 ms later (a feeding tap that did not stop yet) — in the page, on time.
      await page.evaluate(() => {
        const plus = document.querySelector('[data-shelf-plus]')!;
        const n = plus.childElementCount;
        new MutationObserver((_, o) => {
          if (plus.childElementCount <= n) return;
          o.disconnect();
          window.setTimeout(() => {
            plus.querySelector<HTMLElement>('.shelf-free')!.click();
            (window as unknown as { __pressed: boolean }).__pressed = true;
          }, 50);
        }).observe(plus, { childList: true });
      });
      for (let i = 0; i < 400 && !(await page.evaluate(() => Boolean((window as unknown as { __pressed?: boolean }).__pressed))); i++) {
        await page.touchscreen.tap(pet.x, pet.y);
        await page.waitForTimeout(100);
      }
      await page.waitForTimeout(150);
      expect(await sales.isVisible(), 'a press at once opens nothing').toBe(false);
      // A deliberate tap later opens the pick (with coins it leads to an egg).
      await page.waitForTimeout(500);
      await page.touchscreen.tap(pet.x, pet.y);
      await expect(sales).toBeVisible();
      expect(errors).toEqual([]);
    });
  });
}

for (const size of SIZES) {
  const tag = `${size.width}x${size.height}`;
  test.describe(`${tag} eggs`, () => {
    test.use({ viewport: size, isMobile: true, hasTouch: true });
    for (const rows of [1, 2] as const) {
      test(`F-02 «Яйца» with ${rows === 1 ? 2 : 4} eggs of «Мои яйца»: «▶ Реклама: яйцо» whole and out of the lower third @ ${tag}`, async ({ page }) => {
        const errors = collectErrors(page);
        await rich(page, MY_ROWS[rows]);
        await page.locator('[data-tab=eggs]').click();
        await page.waitForTimeout(400);
        // Sideways the eggs of «Мои яйца» stand in one row at any count; from the third on they scroll sideways.
        const my = await page.evaluate(() => {
          const cards = [...document.querySelectorAll<HTMLElement>('[data-sheet=eggs] [data-section=my] > *')];
          return { n: cards.length, rows: new Set(cards.map((e) => Math.round(e.getBoundingClientRect().top))).size };
        });
        expect(my.n, 'eggs of «Мои яйца»').toBe(rows === 1 ? 2 : 4);
        expect(my.rows, 'one row').toBe(1);
        if (rows === 2) {
          // The last egg scrolls into sight, and a new render (the eggs warm on) keeps the row where the player left it.
          const row = page.locator('[data-sheet=eggs] [data-section=my]');
          await row.evaluate((e) => e.scrollTo({ left: e.scrollWidth }));
          await page.evaluate(() => (window as unknown as T).__TEST__.runSim(5));
          await page.waitForTimeout(1200);
          expect(await row.evaluate((e) => e.scrollLeft)).toBeGreaterThan(0);
          const last = await row.evaluate((e) => {
            const r = e.lastElementChild!.getBoundingClientRect();
            const box = e.getBoundingClientRect();
            return r.right <= box.right + 0.5 && r.left >= box.left - 0.5;
          });
          expect(last, 'the last egg whole in sight').toBe(true);
          await page.screenshot({ path: `test-results/f02-${tag}.png` });
        }
        const ad = await whole(page, '[data-sheet=eggs] [data-action^=ad-egg-]');
        expect(ad.bottom, '«▶ Реклама: яйцо» out of the lower third').toBeLessThanOrEqual((size.height * 2) / 3 + 0.5);
        expect(errors).toEqual([]);
      });
    }
  });
}

for (const size of SIZES) {
  const tag = `${size.width}x${size.height}`;
  test.describe(`${tag} egg card`, () => {
    test.use({ viewport: size, isMobile: true, hasTouch: true });
    test(`F-03 the egg card: «Купить», «×3» and «×5» whole over the tab bar, nothing on them @ ${tag}`, async ({ page }) => {
      const errors = collectErrors(page);
      await rich(page);
      await OPENERS['detail:egg-card']!(page);
      await page.waitForTimeout(400);
      for (const n of [1, 3, 5]) await whole(page, `[data-detail=egg-card] [data-action=egg-buy-${n}]`, 0);
      expect(errors).toEqual([]);
    });
  });
}
