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

/** WCAG contrast of two CSS colors. */
const ratio = (a: string, b: string): number => {
  const lum = (c: string) =>
    (c.match(/[\d.]+/g) ?? [])
      .slice(0, 3)
      .map((v) => Number(v) / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
      .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i]!, 0);
  const [x, y] = [lum(a), lum(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

/** п. 2: the salute of VIP and exclusive — no dark box under the buttons, the screen flash under the window, the card's own flash under
 *  its words and brighter the higher the rarity, the rarity word outlined ≥ 4.5:1. */
test.describe('Круг правок FB-2 п. 2 375×650', () => {
  test.use({ viewport: { width: 375, height: 650 }, hasTouch: true, isMobile: true });
  test('the salute brightens the card and keeps its words readable', async ({ page }) => {
    const errors = collectErrors(page);
    await seedSave(page, { coins: 120, creatures: pets, showcase: [] });
    await open(page);
    const peaks: number[] = [];
    for (const uid of ['p4', 'p5']) {
      await page.evaluate((id) => (window as unknown as { __TEST__: { hatch(id: string): boolean } }).__TEST__.hatch(id), uid);
      await page.waitForTimeout(400);
      await page.locator('[data-action=hatch-skip]').click();
      await page.waitForTimeout(60);
      const s = await page.evaluate(() => {
        const card = document.querySelector<HTMLElement>('.overlay[data-overlay=hatch] > .card')!;
        const word = card.querySelector<HTMLElement>('.rar-word')!;
        const before = getComputedStyle(card, '::before');
        const ws = getComputedStyle(word);
        const flash = document.querySelector<HTMLElement>('.burst-flash');
        return {
          rarity: card.dataset.rarity,
          box: getComputedStyle(card.querySelector('.hatch-buttons')!).backgroundColor,
          blend: before.mixBlendMode,
          peak: Number(getComputedStyle(card).getPropertyValue('--flash-peak')),
          screenUnder: flash ? Number(getComputedStyle(flash).zIndex) < Number(getComputedStyle(card.parentElement!).zIndex) : true,
          stroke: parseFloat(ws.getPropertyValue('-webkit-text-stroke-width')),
          word: ws.color,
          strokeColor: ws.getPropertyValue('-webkit-text-stroke-color'),
        };
      });
      expect(s.box).toBe('rgba(0, 0, 0, 0)');
      expect(s.blend).toBe('screen');
      expect(s.screenUnder).toBe(true);
      expect(s.stroke).toBeGreaterThanOrEqual(3);
      expect(ratio(s.word, s.strokeColor)).toBeGreaterThanOrEqual(4.5);
      peaks.push(s.peak);
      await page.waitForTimeout(700);
      await page.locator('[data-action=hatch-keep]').click();
      await expect(page.locator('[data-overlay=hatch]')).toBeHidden();
    }
    // «Чем круче, тем ярче»: the exclusive flash is brighter than the VIP one.
    expect(peaks[1]!).toBeGreaterThan(peaks[0]!);
    expect(errors).toEqual([]);
  });
});

/** п. 3: the lot in portrait at 130 % — ≥ 100 px of the seller's lines in sight, the greeting and «Отдам за N» whole over the answers,
 *  the pet whole under «‹». */
test.describe('Круг правок FB-2 п. 3 375×650 130 %', () => {
  test.use({ viewport: { width: 375, height: 650 }, hasTouch: true, isMobile: true });
  test('the lot in portrait: the lines whole over the answers', async ({ page }) => {
    const errors = collectErrors(page);
    await seedSave(page, { coins: 120, creatures: pets, showcase: [] });
    await open(page);
    await openLot(page, true);
    await page.waitForTimeout(300);
    const g = await page.evaluate(() => {
      const r = (s: string) => document.querySelector(s)!.getBoundingClientRect();
      const lines = r('[data-detail=lot] .chat-lines');
      const answers = r('[data-detail=lot] .lot-buttons');
      const bubbles = [...document.querySelectorAll('[data-detail=lot] .chat-lines > .bubble')].map((e) => e.getBoundingClientRect());
      return {
        room: answers.top - Math.max(lines.top, r('[data-detail=lot] .lot-pet').bottom),
        whole: bubbles.every((b) => b.top >= r('[data-detail=lot] .lot-pet').bottom - 1 && b.bottom <= answers.top + 1),
        pet: r('[data-detail=lot] .lot-pet').top >= r('[data-detail=lot] .mu-back').bottom - 1,
      };
    });
    expect(g.room).toBeGreaterThanOrEqual(100);
    expect(g.whole).toBe(true);
    expect(g.pet).toBe(true);
    expect(errors).toEqual([]);
  });
});

/** п. 4: «Продать сразу» — portrait a quiet line under «На склад»; sideways under the price, not in the window's top right corner (✕ of the
 *  other windows); a full shelf makes «На склад» the main choice. */
for (const [w, h] of [[375, 650], [812, 330]] as const)
  test.describe(`Круг правок FB-2 п. 4 ${w}×${h}`, () => {
    test.use({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true });
    test('«Продать сразу» away from the strip and the corner; a full shelf — «На склад» main', async ({ page }) => {
      const errors = collectErrors(page);
      await seedSave(page, { coins: 120, creatures: pets, showcase: ['p0', 'p1'], upgrades: {} });
      await open(page);
      const hatch = (uid: string) => page.evaluate((id) => (window as unknown as { __TEST__: { hatch(id: string): boolean } }).__TEST__.hatch(id), uid);
      expect(await hatch('p2')).toBe(true);
      await page.waitForTimeout(400);
      await page.locator('[data-action=hatch-skip]').click();
      await page.waitForTimeout(700);
      const box = async (sel: string) => (await page.locator(sel).boundingBox())!;
      const [sell, keep, card, range] = await Promise.all([
        box('[data-action=hatch-sell]'),
        box('[data-action=hatch-keep]'),
        box('[data-overlay=hatch] > .card'),
        box('[data-hatch-range]'),
      ]);
      if (w < h) expect(sell.y).toBeGreaterThanOrEqual(keep.y + keep.height + 7.5);
      else {
        expect(sell.y).toBeGreaterThanOrEqual(range.y + range.height - 1);
        expect(sell.y + sell.height).toBeLessThanOrEqual(keep.y);
        expect(sell.y).toBeGreaterThan(card.y + 44);
      }
      for (const b of [sell, keep]) expect(b.y + b.height).toBeLessThanOrEqual(card.y + card.height);
      // The shelf of the seed: 2 places, both taken — «На склад» is the main one, «На витрину» is dark.
      const full = await page.evaluate(() => (window as unknown as { __TEST__: { state(): { shelf: unknown[] } } }).__TEST__.state().shelf.length);
      await expect(page.locator('[data-action=hatch-keep]')).toHaveClass(full >= 2 ? /\bmain\b/ : /^(?!.*\bmain\b)/);
      await page.locator('[data-action=hatch-keep]').click();
      await expect(page.locator('[data-overlay=hatch]')).toBeHidden();
      expect(errors).toEqual([]);
    });
  });
