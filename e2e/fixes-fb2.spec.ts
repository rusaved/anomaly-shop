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
  // The seller's first line from the pool's start: Math.random is 0 until the lot has opened (a timer could give it back before a slow click).
  await page.evaluate(() => {
    const w = window as unknown as { realRandom?: () => number };
    w.realRandom = Math.random;
    Math.random = () => 0;
  });
  await page.locator('[data-sheet=market] [data-action^="lot-open-"]').first().click();
  await page.evaluate(() => {
    const w = window as unknown as { realRandom?: () => number };
    if (w.realRandom) Math.random = w.realRandom;
  });
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

/** п. 2: the salute of VIP and exclusive — no dark box under the buttons, the screen flash under the window, the light in the pet's tile
 *  (круг правок FB-3: the card itself never repainted), larger the higher the rarity, the rarity word outlined ≥ 4.5:1. */
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
          // Круг правок FB-3 п. 2: the card is never repainted — the light lives in the pet's tile (rays and a core, opaque).
          veil: before.content,
          glow: getComputedStyle(card.querySelector('.hatch-pic')!, '::before').animationName,
          peak: parseFloat(getComputedStyle(card).getPropertyValue('--glow')),
          screenUnder: flash ? Number(getComputedStyle(flash).zIndex) < Number(getComputedStyle(card.parentElement!).zIndex) : true,
          stroke: parseFloat(ws.getPropertyValue('-webkit-text-stroke-width')),
          word: ws.color,
          strokeColor: ws.getPropertyValue('-webkit-text-stroke-color'),
        };
      });
      expect(s.box).toBe('rgba(0, 0, 0, 0)');
      expect(s.veil).toBe('none');
      expect(s.glow).toBe('hatch-glow');
      expect(s.screenUnder).toBe(true);
      expect(s.stroke).toBeGreaterThanOrEqual(3);
      expect(ratio(s.word, s.strokeColor)).toBeGreaterThanOrEqual(4.5);
      peaks.push(s.peak);
      await page.locator('[data-action=hatch-keep]').click();
      await expect(page.locator('[data-overlay=hatch]')).toBeHidden();
    }
    // «Чем круче, тем ярче»: the exclusive light is larger than the VIP one.
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
        // Круг правок FB-3 п. 3: sideways under the pet, left of the buttons (24 px off them), never in the top right corner.
        const pic = await box('.hatch-pic');
        expect(sell.y).toBeGreaterThanOrEqual(pic.y + pic.height - 1);
        expect(sell.x + sell.width + 24).toBeLessThanOrEqual(Math.min(keep.x, range.x) + 0.5);
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

/** п. 5: the bottom of «Лавка» — an affordable price in the accent ≥ 3:1 to the background, the rows one height, the icons one size. */
for (const [w, h] of [[375, 650], [812, 330]] as const)
  test.describe(`Круг правок FB-2 п. 5 ${w}×${h}`, () => {
    test.use({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true });
    test('the upgrade rows: the accent price, one height, one icon size', async ({ page }) => {
      const errors = collectErrors(page);
      await seedSave(page, { coins: 120, upgrades: { showcase: 2, incubator: 1 }, showcase: ['e2e1'] });
      await open(page);
      const rows = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('[data-sheet=home] [data-section=upgrades] .shop-item')]
          .filter((r) => r.offsetParent)
          .map((r) => {
            const btn = r.querySelector<HTMLElement>('.mu-btn')!;
            let bgEl: Element | null = r;
            let bg = 'rgba(0, 0, 0, 0)';
            while (bgEl && (bg = getComputedStyle(bgEl).backgroundColor).endsWith(', 0)')) bgEl = bgEl.parentElement;
            const ring = getComputedStyle(btn).boxShadow.match(/rgba?\([^)]+\)/)?.[0] ?? '';
            const img = r.querySelector<HTMLImageElement>('.mu-pic img');
            return { can: r.classList.contains('can'), h: Math.round(r.getBoundingClientRect().height), ring, color: getComputedStyle(btn).color, bg, img: img?.src ?? '' };
          }),
      );
      expect(rows.length).toBeGreaterThan(2);
      expect(new Set(rows.map((r) => r.h)).size).toBe(1);
      const can = rows.filter((r) => r.can);
      expect(can.length).toBeGreaterThan(0);
      for (const r of can) {
        expect(ratio(r.ring, r.bg)).toBeGreaterThanOrEqual(3);
        expect(ratio(r.color, r.bg)).toBeGreaterThanOrEqual(4.5);
      }
      // One icon size: the drawn part of every icon fills the same share of its square (±8 %).
      const fills = await page.evaluate(async (srcs) => {
        const out: number[] = [];
        for (const src of srcs) {
          const im = new Image();
          im.src = src;
          await im.decode();
          const c = document.createElement('canvas');
          c.width = im.naturalWidth;
          c.height = im.naturalHeight;
          const x = c.getContext('2d')!;
          x.drawImage(im, 0, 0);
          const d = x.getImageData(0, 0, c.width, c.height).data;
          let [l, t, rr, b] = [c.width, c.height, 0, 0];
          for (let y = 0; y < c.height; y++)
            for (let i = 0; i < c.width; i++)
              if (d[(y * c.width + i) * 4 + 3]! > 24) {
                l = Math.min(l, i);
                rr = Math.max(rr, i);
                t = Math.min(t, y);
                b = Math.max(b, y);
              }
          out.push(Math.max(rr - l, b - t) / c.width);
        }
        return out;
      }, rows.map((r) => r.img).filter(Boolean));
      expect(Math.max(...fills) - Math.min(...fills)).toBeLessThanOrEqual(0.08);
      expect(errors).toEqual([]);
    });
  });

/** п. 6: a toast never covers the «‹» row of an inner screen or the first minute's hint and its target; the locked «Пункт» says what
 *  grows there. */
const toastClear = (page: Page) =>
  page.evaluate(() => {
    const t = document.querySelector('.toast')!.getBoundingClientRect();
    const hits = [...document.querySelectorAll('.sheet:not([hidden]) .mu-back, .overlay:not([hidden]) .mu-back, .hint:not([hidden]), .hint-ring:not([hidden]), .is-hinted')]
      .map((e) => e.getBoundingClientRect())
      .filter((r) => r.width > 0 && r.top < t.bottom && r.bottom > t.top && r.left < t.right && r.right > t.left);
    return { hits: hits.length, top: t.top };
  });
for (const [w, h] of [[375, 650], [812, 330]] as const)
  test.describe(`Круг правок FB-2 п. 6 ${w}×${h}`, () => {
    test.use({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true });
    test('a toast clears the «‹» row and the hint; «Пункт» is not blank', async ({ page }) => {
      const errors = collectErrors(page);
      await seedSave(page, { coins: 120, creatures: pets, showcase: [] });
      await open(page);
      await openLot(page, false);
      await page.evaluate(() => (window as unknown as { __TEST__: { toast(t: string): void } }).__TEST__.toast('Новые находки: 2!'));
      await expect(page.locator('.toast')).toBeVisible();
      await page.waitForTimeout(350);
      expect((await toastClear(page)).hits).toBe(0);
      await page.locator('[data-detail=lot] [data-action=lot-back]').click();
      await page.locator('[data-tab=shop]').click();
      await page.locator('[data-sheet=shop] [data-sub=point]').click();
      await expect(page.locator('[data-sheet=shop] [data-point-soon]')).toBeVisible();
      await expect(page.locator('[data-sheet=shop] [data-point-locked]')).toBeVisible();
      expect(await page.locator('[data-sheet=shop] [data-point-steps] .point-step').count()).toBeGreaterThan(2);
      expect(errors).toEqual([]);
    });
    test('a toast in the first minute clears the hint and its target', async ({ page }) => {
      const errors = collectErrors(page);
      await open(page);
      await page.locator('.hint:not([hidden]) [data-hint-text]').waitFor();
      await page.evaluate(() => (window as unknown as { __TEST__: { toast(t: string): void } }).__TEST__.toast('Новые находки: 2!'));
      await expect(page.locator('.toast')).toBeVisible();
      await page.waitForTimeout(350);
      expect((await toastClear(page)).hits).toBe(0);
      expect(errors).toEqual([]);
    });
  });

/** Ревизор удобства круга 2: a run of skip taps 300 ms apart for 3 s — on the dim under the strip (portrait), on the strip's lower edge and on
 *  the dim right of the card (sideways) — never sells the pet, never closes the window, never buys in the shop under it. */
for (const [w, h] of [[375, 650], [812, 330]] as const)
  test.describe(`Круг правок FB-2 серия тапов ${w}×${h}`, () => {
    test.use({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true });
    test('a run of taps while the egg hatches sells nothing', async ({ page }) => {
      const errors = collectErrors(page);
      // A new game: its first egg is ready under the finger (as in the round of fixes FB п. 1).
      await open(page);
      const st = () => page.evaluate(() => (window as unknown as { __TEST__: { state(): { coins: number; creatures: unknown[] } } }).__TEST__.state());
      const before = await st();
      const t = await page.evaluate(() => (window as unknown as { __TEST__: { targets(): { incubators: Array<{ x: number; y: number }> } } }).__TEST__.targets().incubators[0]!);
      await page.touchscreen.tap(t.x, t.y);
      await expect(page.locator('[data-overlay=hatch]')).toBeVisible();
      await page.waitForTimeout(450);
      const strip = (await page.locator('[data-action=hatch-skip]').boundingBox())!;
      const points = w < h ? [[w / 2, h * 0.78]] : [[strip.x + strip.width / 2, strip.y + strip.height - 2], [w - 60, 145]];
      for (let i = 0; i < 10; i++) {
        const [x, y] = points[i % points.length]!;
        await page.touchscreen.tap(x!, y!);
        await page.waitForTimeout(300);
      }
      await expect(page.locator('[data-overlay=hatch]')).toBeVisible();
      const after = await st();
      expect(after.coins).toBe(before.coins);
      expect(after.creatures.length).toBe(before.creatures.length + 1);
      await page.waitForTimeout(700);
      await page.locator('[data-action=hatch-keep]').click();
      await expect(page.locator('[data-overlay=hatch]')).toBeHidden();
      expect(errors).toEqual([]);
    });
  });
