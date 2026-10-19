import { expect, test, type Page } from '@playwright/test';
import { collectErrors, open, seedSave } from './helpers.ts';

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

/** п. 4: a row the scroll edge cuts is drawn whole — its name, its words and its price under the edge, never a lone icon («Магазин»,
 *  «Пункт», «Продажи», «Яйца», «Находки», «Коллекция»; portrait and sideways). */
for (const [w, h] of [[375, 650], [812, 330]] as const)
  test.describe(`Круг правок FB-3 п. 4 ${w}×${h}`, () => {
    test.use({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true });
    test('a row cut by the scroll edge is whole', async ({ page }) => {
      const errors = collectErrors(page);
      await seedSave(page, { coins: 120, upgrades: { showcase: 2, incubator: 1 } });
      await open(page);
      let cut = 0;
      for (const [tab, sub] of [['shop', ''], ['shop', 'point'], ['sales', ''], ['eggs', ''], ['inventory', 'finds'], ['inventory', 'collection']] as const) {
        await page.locator(`[data-tab=${tab}]`).click();
        if (sub) await page.locator(`[data-sheet=${tab}] [data-sub=${sub}]`).click();
        await page.waitForTimeout(300);
        const r = await page.evaluate((tab) => {
          const list = document.querySelector<HTMLElement>(`[data-sheet=${tab}] > .sheet-body`)!;
          const bottom = list.getBoundingClientRect().bottom;
          const cards = [...list.querySelectorAll<HTMLElement>('.mu-card')].filter((c) => c.offsetParent !== null);
          const edge = cards.filter((c) => {
            const b = c.getBoundingClientRect();
            return b.top < bottom - 1 && b.bottom > bottom + 1;
          });
          return {
            hidden: cards.flatMap((c) => [...c.querySelectorAll<HTMLElement>('*')]).filter((el) => getComputedStyle(el).visibility === 'hidden').length,
            edge: edge.length,
          };
        }, tab);
        expect(r.hidden, `${tab} ${sub}`).toBe(0);
        cut += r.edge;
      }
      // The check saw rows under the edge, not only whole screens.
      expect(cut).toBeGreaterThan(0);
      expect(errors).toEqual([]);
    });
  });

/** п. 5: a toast — portrait over the tab bar, off the scene's incubators and the hint's hand; over an inner screen off its «‹» row and
 *  segments (portrait and sideways); a tap on the toast is its own — it closes, nothing under it is bought. */
const toastHits = (page: Page) =>
  page.evaluate(() => {
    const t = document.querySelector('.toast')!.getBoundingClientRect();
    const sel = '.sheet:not([hidden]) .mu-back, .sheet:not([hidden]) .mu-seg, .hint:not([hidden]), .hint-ring, .is-hinted, .tap-finger:not([hidden])';
    const hits = [...document.querySelectorAll(sel)]
      .map((e) => e.getBoundingClientRect())
      .filter((r) => r.width > 0 && r.top < t.bottom && r.bottom > t.top && r.left < t.right && r.right > t.left).length;
    return { hits, top: t.top, bottom: t.bottom, x: t.x + t.width / 2, y: t.y + t.height / 2, bar: document.getElementById('nav')!.getBoundingClientRect().top };
  });
const say = (page: Page, text: string) => page.evaluate((t) => (window as unknown as { __TEST__: { toast(t: string): void } }).__TEST__.toast(t), text);
for (const [w, h] of [[375, 650], [812, 330]] as const)
  test.describe(`Круг правок FB-3 п. 5 ${w}×${h}`, () => {
    test.use({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true });
    test('a toast clears the scene, the hint, «‹» and the segments; a tap on it is its own', async ({ page }) => {
      const errors = collectErrors(page);
      // The first minute: the hint and its hand on the first egg.
      await open(page);
      await page.locator('.hint:not([hidden]) [data-hint-text]').waitFor();
      await say(page, 'Новые находки: 2!');
      await expect(page.locator('.toast')).toBeVisible();
      await page.waitForTimeout(400);
      let t = await toastHits(page);
      expect(t.hits).toBe(0);
      if (w < h) {
        // Portrait: over the tab bar, under the scene's incubators.
        expect(t.bar - t.bottom).toBeGreaterThanOrEqual(8);
        expect(t.bar - t.bottom).toBeLessThanOrEqual(60);
        const eggs = await page.evaluate(() => (window as unknown as { __TEST__: { targets(): { incubators: Array<{ x: number; y: number }> } } }).__TEST__.targets().incubators);
        for (const e of eggs) expect(e.y < t.top - 30 || e.y > t.bottom + 30).toBe(true);
      }
      // An inner screen: the segments of «Склад» and the «‹» row of a lot.
      await page.goto('about:blank');
      await seedSave(page, { coins: 500, upgrades: { showcase: 2, incubator: 1 } });
      await open(page);
      await page.locator('[data-tab=inventory]').click();
      await say(page, 'Новые находки: 3!');
      await page.waitForTimeout(400);
      expect((await toastHits(page)).hits).toBe(0);
      await page.waitForTimeout(2600);
      await page.locator('[data-tab=market]').click();
      await page.locator('[data-sheet=market] [data-action^="lot-open-"]').first().click();
      await say(page, 'Новые находки: 4!');
      await page.waitForTimeout(400);
      expect((await toastHits(page)).hits).toBe(0);
      await page.waitForTimeout(2600);
      // A tap on the toast over «Лавка»'s list: the toast goes, the coins stay.
      await page.locator('[data-tab=home]').click();
      await say(page, 'Новые находки: 5!');
      await page.waitForTimeout(400);
      t = await toastHits(page);
      const before = await snap(page);
      await page.touchscreen.tap(t.x, t.y);
      // (the game's own toasts may queue after it — this one goes.)
      await expect(page.locator('.toast', { hasText: '5!' })).toHaveCount(0, { timeout: 1500 });
      const after = await snap(page);
      expect(after.coins).toBe(before.coins);
      expect(JSON.stringify(after.upgrades)).toBe(JSON.stringify(before.upgrades));
      expect(errors).toEqual([]);
    });
  });

/** sRGB contrast of two CSS colors (rgb()/rgba() as the browser computes them). */
const ratio = (a: string, b: string): number => {
  const lum = (c: string) => {
    const [r, g, bl] = (c.match(/[\d.]+/g) ?? ['0', '0', '0']).slice(0, 3).map((x) => Number(x) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * bl!;
  };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x! + 0.05) / (y! + 0.05);
};

/** п. 6: the small ones — the lot sideways (the main button at the column's left edge), the closed «Пункт» (short words, no ★, its steps
 *  ≥ 4.5:1 and opaque), the bell, the mat and the sign of one visible mass, an empty level dot ≥ 3:1, «Покорми его тапами» off the
 *  incubator, a ready gift egg gets the «new egg» hint. */
test.describe('Круг правок FB-3 п. 6 812×330', () => {
  test.use({ viewport: { width: 812, height: 330 }, hasTouch: true, isMobile: true });
  test('the lot sideways: the main button at the left edge of its column', async ({ page }) => {
    const errors = collectErrors(page);
    await seedSave(page, { coins: 120 });
    await open(page);
    await page.locator('[data-tab=market]').click();
    await page.locator('[data-sheet=market] [data-action^="lot-open-"]').first().click();
    await page.waitForTimeout(300);
    const g = await page.evaluate(() => {
      const r = (s: string) => document.querySelector(s)!.getBoundingClientRect();
      return { main: r('[data-action=lot-buy]').left, col: r('[data-detail=lot] .lot-buttons').left, answer: r('[data-detail=lot] .lot-buttons > .mu-btn:not(.main)').left };
    });
    expect(Math.abs(g.main - g.col)).toBeLessThanOrEqual(1);
    expect(Math.abs(g.main - g.answer)).toBeLessThanOrEqual(1);
    expect(errors).toEqual([]);
  });
});
for (const [w, h] of [[375, 650], [812, 330]] as const)
  test.describe(`Круг правок FB-3 п. 6 ${w}×${h}`, () => {
    test.use({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true });
    test('«Пункт» closed, the icons of one mass, the empty dots ≥ 3:1', async ({ page }) => {
      const errors = collectErrors(page);
      await seedSave(page, { coins: 120, upgrades: { showcase: 2, incubator: 1 } });
      await open(page);
      await page.locator('[data-tab=shop]').click();
      await page.waitForTimeout(300);
      // The level dots: an empty one is a ring ≥ 3:1 to the background.
      const dots = await page.evaluate(() => {
        const dot = document.querySelector<HTMLElement>('[data-sheet=shop] .lvl-dots i:not(.on)')!;
        // A mixed color computes as color(srgb r g b) in 0…1, a plain one as rgb().
        const shadow = getComputedStyle(dot).boxShadow;
        const srgb = shadow.match(/color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)/);
        return srgb ? `rgb(${srgb.slice(1, 4).map((v) => Math.round(Number(v) * 255)).join(', ')})` : shadow.match(/rgba?\([^)]*\)/)![0];
      });
      expect(ratio(dots, 'rgb(42, 33, 64)')).toBeGreaterThanOrEqual(3);
      // The bell, the mat and the sign: their drawn pixels within 1.6 times of one another.
      const mass = await page.evaluate(async () => {
        const out: number[] = [];
        for (const name of ['Колокольчик', 'Коврик', 'Вывеска']) {
          const row = [...document.querySelectorAll<HTMLElement>('[data-sheet=shop] .shop-item')].find((r) => r.querySelector('.mu-name')?.textContent === name);
          const img = row?.querySelector<HTMLImageElement>('img');
          if (!img) continue;
          await img.decode().catch(() => {});
          const c = document.createElement('canvas');
          c.width = img.naturalWidth;
          c.height = img.naturalHeight;
          const x = c.getContext('2d')!;
          x.drawImage(img, 0, 0);
          const d = x.getImageData(0, 0, c.width, c.height).data;
          let n = 0;
          for (let i = 3; i < d.length; i += 4) if (d[i]! > 200) n++;
          out.push(n / (c.width * c.height));
        }
        return out;
      });
      expect(mass).toHaveLength(3);
      expect(Math.max(...mass) / Math.min(...mass)).toBeLessThanOrEqual(1.6);
      // The closed «Пункт»: short words without ★, its steps opaque, their words ≥ 4.5:1.
      await page.locator('[data-sheet=shop] [data-sub=point]').click();
      await page.waitForTimeout(300);
      const p = await page.evaluate(() => {
        const step = document.querySelector<HTMLElement>('[data-sheet=shop] .point-step')!;
        return {
          soon: document.querySelector('[data-sheet=shop] [data-point-soon]')!.textContent ?? '',
          locked: document.querySelector('[data-sheet=shop] [data-point-locked]')!.textContent ?? '',
          opacity: getComputedStyle(step).opacity,
          meta: getComputedStyle(step.querySelector('.mu-meta')!).color,
          name: getComputedStyle(step.querySelector('.mu-name')!).color,
        };
      });
      expect(p.locked).not.toContain('★');
      expect(p.soon.length + p.locked.length).toBeLessThanOrEqual(80);
      expect(p.opacity).toBe('1');
      expect(ratio(p.meta, 'rgb(42, 33, 64)')).toBeGreaterThanOrEqual(4.5);
      expect(ratio(p.name, 'rgb(42, 33, 64)')).toBeGreaterThanOrEqual(4.5);
      expect(errors).toEqual([]);
    });
    test('«Покорми его тапами» off the incubator; a ready gift egg gets the «new egg» hint', async ({ page }) => {
      const errors = collectErrors(page);
      await open(page);
      const egg = await page.evaluate(() => (window as unknown as { __TEST__: { targets(): { incubators: Array<{ x: number; y: number }> } } }).__TEST__.targets().incubators[0]!);
      await page.touchscreen.tap(egg.x, egg.y);
      await page.waitForTimeout(500);
      await page.locator('[data-action=hatch-skip]').dispatchEvent('click');
      await page.locator('[data-action=hatch-shop]').click();
      for (const b of ['[data-action=price-ok]', '[data-detail=sale] [data-action^=sale-go-]']) if (await page.locator(b).isVisible()) await page.locator(b).click();
      await expect.poll(() => page.evaluate(() => (window as unknown as { __TEST__: { state(): { ftue: string } } }).__TEST__.state().ftue)).toBe('feed');
      await page.locator('[data-tab=home]').click();
      await page.locator('.hint[data-hint=feed]:not([hidden])').waitFor();
      await page.waitForTimeout(500);
      const f = await page.evaluate(() => {
        const h = document.querySelector('.hint[data-hint=feed]')!.getBoundingClientRect();
        const t = (window as unknown as { __TEST__: { targets(): { incubators: Array<{ x: number; y: number }> } } }).__TEST__.targets().incubators;
        // An incubator is about 60 px across around its point.
        return t.filter((i) => i.x + 30 > h.left && i.x - 30 < h.right && i.y + 30 > h.top && i.y - 30 < h.bottom).length;
      });
      expect(f).toBe(0);
      // A new game after the first deal with the gift egg ready: the hint at «Забрать» of it, not at a purchase.
      await page.goto('about:blank');
      await seedSave(page, { coins: 30, creatures: [], showcase: [], stats: { deals: 1, coinsEarned: 30, hatched: 1, taps: 10, levelUps: 0, haggles: 0 }, flags: { ftue_starter: true, ftue_fed: true, tab_eggs: true, tab_sales: true, tab_chats: true } });
      await open(page);
      await page.locator('[data-tab=eggs]').click();
      const hint = page.locator('.hint[data-hint=buyEgg]:not([hidden])');
      await expect(hint).toBeVisible({ timeout: 8000 });
      await expect(hint).toContainText('Забери подарочное яйцо');
      await expect(page.locator('[data-action=egg-free-egg_gift]')).toBeVisible();
      await page.locator('[data-action=egg-free-egg_gift]').click();
      await expect.poll(() => page.evaluate(() => (window as unknown as { __TEST__: { state(): { ftue: string } } }).__TEST__.state().ftue)).toBe('hatchRare');
      expect(errors).toEqual([]);
    });
  });

/** Ревизор удобства круга 3: a tap on the tab bar never closes «Вылупился!» (while the strip runs and after the result); on «Яйца» the gift
 *  egg's hint wins over the tab's first hint. */
for (const [w, h] of [[375, 650], [812, 330]] as const)
  test.describe(`Круг правок FB-3 ревизор удобства ${w}×${h}`, () => {
    test.use({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true });
    test('the tab bar under «Вылупился!» does nothing; the gift hint on «Яйца»', async ({ page }) => {
      const errors = collectErrors(page);
      await open(page);
      const egg = await page.evaluate(() => (window as unknown as { __TEST__: { targets(): { incubators: Array<{ x: number; y: number }> } } }).__TEST__.targets().incubators[0]!);
      await page.touchscreen.tap(egg.x, egg.y);
      await expect(page.locator('[data-overlay=hatch]')).toBeVisible();
      const tab = (await page.locator('[data-tab=eggs]').boundingBox())!;
      await page.touchscreen.tap(tab.x + tab.width / 2, tab.y + tab.height / 2);
      await page.waitForTimeout(300);
      await expect(page.locator('[data-overlay=hatch]')).toBeVisible();
      await page.locator('[data-action=hatch-skip]').dispatchEvent('click');
      await page.waitForTimeout(1000);
      await page.touchscreen.tap(tab.x + tab.width / 2, tab.y + tab.height / 2);
      await page.waitForTimeout(300);
      await expect(page.locator('[data-overlay=hatch]')).toBeVisible();
      expect(await page.evaluate(() => (window as unknown as { __TEST__: { state(): { tab: string } } }).__TEST__.state().tab)).toBe('home');
      await page.locator('[data-action=hatch-keep]').click();
      await expect(page.locator('[data-overlay=hatch]')).toBeHidden();
      // The first visit of «Яйца» with the gift ready: the hint is the gift's, at its «Забрать».
      await page.goto('about:blank');
      await seedSave(page, { coins: 30, creatures: [], showcase: [], stats: { deals: 1, coinsEarned: 30, hatched: 1, taps: 10, levelUps: 0, haggles: 0 }, flags: { ftue_starter: true, ftue_fed: true, tab_sales: true, tab_chats: true } });
      await open(page);
      await page.locator('[data-tab=eggs]').click();
      const hint = page.locator('.hint:not([hidden])');
      await expect(hint).toContainText('Забери подарочное яйцо', { timeout: 8000 });
      await page.waitForTimeout(500);
      await expect(hint).toContainText('Забери подарочное яйцо');
      await expect(page.locator('[data-action=egg-free-egg_gift].is-hinted')).toHaveCount(1);
      expect(errors).toEqual([]);
    });
  });
