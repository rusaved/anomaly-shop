import { expect, test, type Page } from '@playwright/test';
import { collectErrors, open } from './helpers.ts';

/** The third round of fixes of FB (the HQ's third check, 19.10): what it still found. */
type Snap = { coins: number; creatures: unknown[]; upgrades?: unknown };
const snap = (page: Page) => page.evaluate(() => (window as unknown as { __TEST__: { state(): Snap } }).__TEST__.state());

/** п. 1: a run of 8 taps 150, 300 and 500 ms apart right after the egg — on the spot of «Продать сразу», on the strip's lower edge and on
 *  the dim — portrait and sideways: nothing sold, nothing bought, the window stays (the buttons wait for 0.8 s of no taps). */
for (const [w, h] of [[375, 650], [812, 330]] as const)
  for (const where of ['sell', 'strip', 'dim'] as const)
    for (const step of [150, 300, 500])
      test.describe(`Круг правок FB-3 п. 1 ${w}×${h} ${where} ${step} мс`, () => {
        test.use({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true });
        test('a run of taps sells nothing and buys nothing', async ({ page }) => {
          const errors = collectErrors(page);
          await open(page);
          const before = await snap(page);
          const egg = await page.evaluate(() => (window as unknown as { __TEST__: { targets(): { incubators: Array<{ x: number; y: number }> } } }).__TEST__.targets().incubators[0]!);
          await page.touchscreen.tap(egg.x, egg.y);
          await expect(page.locator('[data-overlay=hatch]')).toBeVisible();
          // Where the taps land: «Продать сразу» of the result (the card knows its final place while the strip runs), the strip, the dim.
          const p = await page.evaluate((where) => {
            const card = document.querySelector<HTMLElement>('.card-hatch')!;
            if (where === 'sell') {
              card.classList.add('shown');
              const b = document.querySelector('[data-action=hatch-sell]')!.getBoundingClientRect();
              card.classList.remove('shown');
              return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
            }
            if (where === 'strip') {
              const b = document.querySelector('[data-action=hatch-skip]')!.getBoundingClientRect();
              return { x: b.x + b.width / 2, y: b.bottom - 2 };
            }
            const c = card.getBoundingClientRect();
            return innerWidth > innerHeight ? { x: (c.right + innerWidth) / 2, y: c.y + c.height / 2 } : { x: innerWidth / 2, y: (c.bottom + innerHeight) / 2 - 20 };
          }, where);
          await page.evaluate(() => {
            (window as unknown as { taps: number[] }).taps = [];
            addEventListener('pointerdown', () => (window as unknown as { taps: number[] }).taps.push(performance.now()), true);
          });
          for (let i = 0; i < 8; i++) {
            await page.waitForTimeout(step);
            await page.touchscreen.tap(p.x, p.y);
          }
          await page.waitForTimeout(100);
          const gaps = await page.evaluate(() => (window as unknown as { taps: number[] }).taps.slice(1).map((t, i, a) => t - ((window as unknown as { taps: number[] }).taps[i] ?? t)));
          // The run itself is quicker than the silence the buttons wait for (a slow machine that broke it is no proof).
          expect(Math.max(...gaps)).toBeLessThan(800);
          await expect(page.locator('[data-overlay=hatch]')).toBeVisible();
          const after = await snap(page);
          expect(after.coins).toBe(before.coins);
          expect(after.creatures.length).toBe(before.creatures.length + 1);
          expect(JSON.stringify(after.upgrades)).toBe(JSON.stringify(before.upgrades));
          // After the silence the choice is the player's: «На склад» keeps the pet.
          await page.locator('[data-action=hatch-keep]').click();
          await expect(page.locator('[data-overlay=hatch]')).toBeHidden();
          expect((await snap(page)).coins).toBe(before.coins);
          expect(errors).toEqual([]);
        });
      });
