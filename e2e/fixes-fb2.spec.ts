import { expect, test, type Page } from '@playwright/test';
import { collectErrors, open, seedSave } from './helpers.ts';

/** The second round of fixes of FB (the HQ re-check, 19.10): what the re-check still found. */
type Box = { x: number; y: number; width: number; height: number };
/** The 130 % font the way the check of 07 emulates it: every text of the HTML layer 1.3 times larger. */
const scale130 = (page: Page) =>
  page.evaluate(() => {
    const fresh = [...document.querySelectorAll<HTMLElement>('#ui *')].filter((el) => !el.dataset.mu130);
    const sizes = fresh.map((el) => parseFloat(getComputedStyle(el).fontSize));
    fresh.forEach((el, i) => {
      el.dataset.mu130 = '1';
      el.style.fontSize = `${Math.round((sizes[i] ?? 16) * 13) / 10}px`;
    });
  });
const pets = ['kettle', 'cloudcat', 'lampbug', 'jellytoast', 'shroom', 'moon_donut'].map((species, i) => ({ uid: `p${i}`, species, level: 1, fed: 0, hatchedAt: 0, age: 0 }));
const overlap = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/** Opens the first lot with the longest seller greeting (the pool's first line). */
async function openLot(page: Page, big: boolean): Promise<void> {
  await page.locator('[data-tab=market]').click();
  await page.evaluate(() => {
    const real = Math.random;
    Math.random = () => 0;
    setTimeout(() => (Math.random = real), 0);
  });
  await page.locator('[data-sheet=market] [data-action^="lot-open-"]').first().click();
  if (big) await scale130(page);
  await page.waitForTimeout(400);
}

/** п. 1, 6: the lot sideways — «Заберу сейчас» whole, ≥ 8 px under the bar and off the pet; the seller's first line and «Отдам за N» whole. */
for (const big of [false, true])
  test.describe(`Круг правок FB-2 п. 1 812×330${big ? ' 130 %' : ''}`, () => {
    test.use({ viewport: { width: 812, height: 330 }, hasTouch: true, isMobile: true });
    test('the lot sideways: the main button and the lines whole', async ({ page }) => {
      const errors = collectErrors(page);
      await seedSave(page, { coins: 120, creatures: pets, showcase: [] });
      await open(page);
      await openLot(page, big);
      const g = await page.evaluate(() => {
        const r = (s: string) => {
          const b = document.querySelector(s)!.getBoundingClientRect();
          return { x: b.x, y: b.y, width: b.width, height: b.height };
        };
        const lines = r('[data-detail=lot] .chat-lines');
        const bubbles = [...document.querySelectorAll('[data-detail=lot] .chat-lines > .bubble')].map((e) => e.getBoundingClientRect());
        return {
          hud: r('.hud'),
          back: r('[data-detail=lot] .mu-back'),
          pet: r('[data-detail=lot] .lot-pet'),
          main: r('[data-action=lot-buy]'),
          box: r('[data-detail=lot] .lot-buttons'),
          bar: document.getElementById('nav')!.getBoundingClientRect().top,
          lines,
          whole: bubbles.every((b) => b.top >= lines.y - 1 && b.bottom <= lines.y + lines.height + 1),
        };
      });
      expect(g.main.y - (g.hud.y + g.hud.height)).toBeGreaterThanOrEqual(8);
      expect(g.main.y).toBeGreaterThanOrEqual(g.box.y - 1);
      expect(g.main.y + g.main.height).toBeLessThanOrEqual(g.bar);
      expect(overlap(g.main, g.pet)).toBe(false);
      expect(overlap(g.main, g.back)).toBe(false);
      expect(g.whole).toBe(true);
      expect(errors).toEqual([]);
    });
  });
