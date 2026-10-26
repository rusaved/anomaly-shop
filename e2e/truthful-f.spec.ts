import { expect, test, type Page } from '@playwright/test';
import { collectErrors, open, state } from './helpers.ts';

/**
 * F «Первая минута и яйца» (Ресейл 15): the live pass of the producer's phone sideways (815×290 with the browser's panel, 812×330,
 * 880×405) — when a buyer wrote, a «+» took the pet's place under the finger and the next feeding tap opened «Кого выставить · На складе
 * пусто · Купить яйцо» with no coins. Every check here taps like a finger.
 */
const PANEL = { width: 815, height: 290 };
const TALL = { width: 812, height: 330 };
const PHONE = { width: 880, height: 405 };
const SIZES = [PANEL, TALL, PHONE];

type T = { __TEST__: { grant(n: number): void; targets(): { incubators: Array<{ x: number; y: number }>; slots: Array<{ x: number; y: number }> } | null; t(k: string): string } };
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
