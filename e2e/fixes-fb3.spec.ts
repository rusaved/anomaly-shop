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

/** The 130 % font the way the check of 07 emulates it: every text of the HTML layer 1.3 times larger. */
const scale130 = (page: Page) =>
  page.evaluate(() => {
    const els = [...document.querySelectorAll<HTMLElement>('#ui *')];
    const sizes = els.map((el) => parseFloat(getComputedStyle(el).fontSize));
    els.forEach((el, i) => (el.style.fontSize = `${Math.round((sizes[i] ?? 16) * 13) / 10}px`));
  });

/** п. 1, 3: «Вылупился!» sideways at 1× and 130 % — fields 16 on every side, the buttons in the right column under the words (the main one at
 *  its left edge), «Продать сразу» 24 px and more off the strip and off the buttons, the price's number no larger than the name. */
for (const big of [false, true])
  test.describe(`Круг правок FB-3 п. 3 812×330${big ? ' 130 %' : ''}`, () => {
    test.use({ viewport: { width: 812, height: 330 }, hasTouch: true, isMobile: true });
    test('«Вылупился!» sideways: fields 16, the buttons right under the words', async ({ page }) => {
      const errors = collectErrors(page);
      await open(page);
      const egg = await page.evaluate(() => (window as unknown as { __TEST__: { targets(): { incubators: Array<{ x: number; y: number }> } } }).__TEST__.targets().incubators[0]!);
      await page.touchscreen.tap(egg.x, egg.y);
      await expect(page.locator('[data-overlay=hatch]')).toBeVisible();
      await page.waitForTimeout(450);
      const strip = (await page.locator('[data-action=hatch-skip]').boundingBox())!;
      await page.locator('[data-action=hatch-skip]').dispatchEvent('click');
      if (big) await scale130(page);
      await page.waitForTimeout(400);
      const g = await page.evaluate(() => {
        const r = (s: string) => document.querySelector(s)!.getBoundingClientRect();
        const card = r('.card-hatch');
        // «Продать сразу» is a line of words: its 44 px target goes into the field, its words keep it.
        const words = document.createRange();
        words.selectNodeContents(document.querySelector('[data-action=hatch-sell]')!);
        const parts = [...['.card-hatch > h2', '.hatch-pic', '[data-hatch-name]', '[data-hatch-range]', '.hatch-buttons'].map(r), words.getBoundingClientRect()];
        const fs = (s: string) => parseFloat(getComputedStyle(document.querySelector(s)!).fontSize);
        return {
          card: { x: card.x, y: card.y, right: card.right, bottom: card.bottom },
          top: Math.min(...parts.map((p) => p.top)),
          bottom: Math.max(...parts.map((p) => p.bottom)),
          left: Math.min(...parts.map((p) => p.left)),
          right: Math.max(...parts.map((p) => p.right)),
          name: r('[data-hatch-name]'),
          range: r('[data-hatch-range]'),
          sell: r('[data-action=hatch-sell]'),
          main: r('.hatch-buttons > .mu-btn'),
          buttons: r('.hatch-buttons'),
          bar: document.getElementById('nav')!.getBoundingClientRect().top,
          price: fs('[data-hatch-range] b'),
          nameFs: fs('[data-hatch-name]'),
          scroll: document.querySelector('.card-hatch')!.scrollHeight - document.querySelector('.card-hatch')!.clientHeight,
        };
      });
      expect(g.top - g.card.y).toBeGreaterThanOrEqual(15);
      expect(g.card.bottom - g.bottom).toBeGreaterThanOrEqual(15);
      expect(g.left - g.card.x).toBeGreaterThanOrEqual(15);
      expect(g.card.right - g.right).toBeGreaterThanOrEqual(15);
      expect(g.card.bottom).toBeLessThanOrEqual(g.bar);
      expect(g.scroll).toBeLessThanOrEqual(1);
      // The buttons right, under the words; the main one at the column's left edge.
      expect(g.buttons.left).toBeGreaterThanOrEqual(g.name.left - 1);
      expect(g.buttons.top).toBeGreaterThanOrEqual(g.range.bottom - 1);
      expect(Math.abs(g.main.left - g.name.left)).toBeLessThanOrEqual(1);
      // «Продать сразу» 24 px off the strip (where it ran) and off the buttons.
      const gap = (a: { left: number; right: number; top: number; bottom: number }, b: { x: number; y: number; width: number; height: number }) =>
        Math.max(b.x - a.right, a.left - (b.x + b.width), b.y - a.bottom, a.top - (b.y + b.height));
      expect(gap(g.sell, strip)).toBeGreaterThanOrEqual(24);
      expect(gap(g.sell, { x: g.buttons.left, y: g.buttons.top, width: g.buttons.width, height: g.buttons.height })).toBeGreaterThanOrEqual(24);
      expect(g.sell.height).toBeGreaterThanOrEqual(44);
      expect(g.price).toBeLessThanOrEqual(g.nameFs);
      expect(errors).toEqual([]);
    });
  });
