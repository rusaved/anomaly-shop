import { expect, test, type Page } from '@playwright/test';
import { collectErrors, open, seedSave } from './helpers.ts';

/**
 * MU-12: the automatic check of docs/07-mobile-ui.md on every screen — portrait 375×650 (the zone a phone leaves to the game) and 812×375.
 * Taps ≥ 44 px, text ≥ 12 px (the 11 px tab labels and rarity badges of 07 aside), buttons ≥ 14 px, nothing cut or covered,
 * tap targets apart, one window, the content above the tab bar, the root at 130 % — nothing out of the screen; MU-01: every pet shows its rarity.
 */
const pet = (uid: string, species: string, level = 1) => ({ uid, species, level, fed: 0, hatchedAt: 0, age: 0 });
const SEED = {
  coins: 120,
  crystals: 3,
  incubators: [{ egg: 'egg_basic', startedAt: 0, progress: 0, elapsed: 0, waiting: false }, { egg: null }],
  creatures: [pet('a', 'kettle', 2), pet('b', 'cloudcat'), pet('c', 'lampbug', 3), pet('d', 'jellytoast'), pet('e', 'shroom'), pet('f', 'moon_donut')],
  showcase: ['a', 'b'],
  upgrades: { showcase: 2, incubator: 1 },
  flags: { ftue_starter: true, ftue_done: true, ftue_fed: true, ftue_bought: true, tab_market: true, tab_inventory: true, tab_sales: true, tab_chats: true, tab_shop: true, tab_eggs: true },
};

/** Where a pet stands in the HTML layer: each of these shows the pet's rarity (a frame, a badge, a ring or the word). */
const PET_HOLDERS = '.card-sale, .card-lot, .card-odds, .card-col, [data-sheet=inventory] .tile, .chat-row, .chat-ask, .day-anomaly, .card-hatch.shown, .hatch-item, .lot-pet, .price-pet';

interface Report {
  tiny: string[];
  small: string[];
  cut: string[];
  covered: string[];
  overlap: string[];
  windows: number;
  underBar: string[];
  outside: string[];
  noRarity: string[];
  clipped: string[];
  cutByBar: string[];
}

function check(page: Page): Promise<Report> {
  return page.evaluate((holders) => {
    const r: Report = { tiny: [], small: [], cut: [], covered: [], overlap: [], windows: 0, underBar: [], outside: [], noRarity: [], clipped: [], cutByBar: [] };
    const name = (el: Element): string => {
      const h = el as HTMLElement;
      const hook = h.dataset.action ?? h.dataset.tab ?? h.className.toString().split(' ')[0] ?? el.tagName;
      return `${el.tagName.toLowerCase()}.${hook} «${(h.innerText ?? '').trim().replace(/\s+/g, ' ').slice(0, 24)}»`;
    };
    const shown = (el: Element): boolean => {
      const b = el.getBoundingClientRect();
      if (b.width < 1 || b.height < 1) return false;
      for (let e: Element | null = el; e; e = e.parentElement) {
        const cs = getComputedStyle(e);
        if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0 || (e as HTMLElement).hidden) return false;
      }
      return true;
    };
    /** The part of the element a player can see: inside every scrolling box around it and the screen. */
    const visible = (el: Element): DOMRect | null => {
      let b = el.getBoundingClientRect();
      let top = b.top;
      let bottom = b.bottom;
      let left = b.left;
      let right = b.right;
      for (let e = el.parentElement; e; e = e.parentElement) {
        const cs = getComputedStyle(e);
        if (cs.overflowY === 'visible' && cs.overflowX === 'visible') continue;
        const p = e.getBoundingClientRect();
        top = Math.max(top, p.top);
        bottom = Math.min(bottom, p.bottom);
        left = Math.max(left, p.left);
        right = Math.min(right, p.right);
      }
      top = Math.max(top, 0);
      left = Math.max(left, 0);
      bottom = Math.min(bottom, innerHeight);
      right = Math.min(right, innerWidth);
      if (bottom - top < 2 || right - left < 2) return null;
      b = new DOMRect(left, top, right - left, bottom - top);
      return b;
    };
    const nav = document.getElementById('nav')!.getBoundingClientRect();
    // «Подарки» is a screen (MU-08); a window may stand over it.
    const open = [...document.querySelectorAll('.overlay:not([hidden]):not(.under)')];
    const win = open.at(-1) ?? null;
    r.windows = open.filter((el) => (el as HTMLElement).dataset.kind !== 'screen').length;
    const taps: Array<{ el: Element; b: DOMRect }> = [];
    for (const el of document.querySelectorAll('#ui *')) {
      if (el.closest('.lil-gui, svg, [aria-hidden="true"], .hint, .toasts, .coin-flight')) continue;
      if (!shown(el)) continue;
      // Under an open window only the window and the tab bar count.
      if (win && !win.contains(el) && !el.closest('#nav, .hud')) continue;
      const v = visible(el);
      if (!v) continue;
      const tap = el.matches('button, input, [role="button"]');
      const text = [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim() !== '');
      const cs = getComputedStyle(el);
      const size = parseFloat(cs.fontSize);
      if (text) {
        const eleven = el.closest('.nav-label, .rar-badge, .nav-badge') !== null;
        // 07: button labels 14 px; the small lines inside a card that is a button (its meta) 12 px.
        const label = el.matches('button, .mu-btn') || el.parentElement?.matches('button.mu-btn, .mu-btn') === true;
        const min = eleven ? 10.5 : label ? 13.5 : 11.5;
        if (size < min) r.small.push(`${name(el)} ${cs.fontSize}`);
        const h = el as HTMLElement;
        if (cs.textOverflow === 'ellipsis' || ((cs.overflowX === 'hidden' || cs.overflowX === 'clip') && h.scrollWidth > h.clientWidth + 1)) r.cut.push(name(el));
        // A text that runs past its own box (a button with a long word) is cut for the eye.
        if (h.scrollWidth > h.clientWidth + 2 && cs.display !== 'inline' && cs.overflowX === 'visible' && h.clientWidth > 0) r.cut.push(`${name(el)} ${h.scrollWidth}>${h.clientWidth}`);
      }
      const b = el.getBoundingClientRect();
      if (b.right > innerWidth + 1 || b.left < -1) r.outside.push(`${name(el)} ${Math.round(b.left)}…${Math.round(b.right)}`);
      if (tap) {
        // The size at rest (offset*): a window still settling in its opening animation is not a small button.
        const hw = (el as HTMLElement).offsetWidth || b.width;
        const hh = (el as HTMLElement).offsetHeight || b.height;
        if (Math.min(hw, hh) < 43.5) r.tiny.push(`${name(el)} ${Math.round(hw)}×${Math.round(hh)}`);
        // Content above the tab bar: a button of a screen never lies under it.
        if (!el.closest('#nav') && v.bottom > nav.top + 1 && v.top < nav.top) r.underBar.push(name(el));
        const x = v.left + v.width / 2;
        const y = v.top + v.height / 2;
        const hit = document.elementFromPoint(x, y);
        if (hit && !el.contains(hit) && !hit.contains(el) && !(hit.closest('.overlay') && !el.closest('.overlay'))) r.covered.push(`${name(el)} under ${name(hit)}`);
        if (!el.closest('#nav')) taps.push({ el, b: v });
      }
    }
    // Tap targets never overlap (07 rule 3).
    for (let i = 0; i < taps.length; i++)
      for (let j = i + 1; j < taps.length; j++) {
        const a = taps[i]!;
        const c = taps[j]!;
        if (a.el.contains(c.el) || c.el.contains(a.el)) continue;
        const w = Math.min(a.b.right, c.b.right) - Math.max(a.b.left, c.b.left);
        const h = Math.min(a.b.bottom, c.b.bottom) - Math.max(a.b.top, c.b.top);
        if (w > 1 && h > 1) r.overlap.push(`${name(a.el)} × ${name(c.el)}`);
      }
    // MU-01: every pet in sight shows its rarity.
    for (const el of document.querySelectorAll(holders)) {
      if (!shown(el) || !visible(el)) continue;
      if (win && !win.contains(el)) continue;
      const has = (el.matches('.rar[data-rarity], .rar-ring[data-rarity]') || [...el.querySelectorAll('.rar-badge[data-rarity], .rar-ring[data-rarity], .rar-word[data-rarity]')].some((x) => shown(x))) as boolean;
      if (!has) r.noRarity.push(name(el));
    }
    /** The nearest box around el that clips it (a scrolling list, a window). */
    const clipBox = (el: Element): HTMLElement | null => {
      for (let e = el.parentElement; e; e = e.parentElement) {
        const cs = getComputedStyle(e);
        if (cs.overflowY !== 'visible' || cs.overflowX !== 'visible') return e;
      }
      return null;
    };
    // The round of fixes, item 1: the 16 px field is inside the scrolling list — a rarity frame, a ready find's frame,
    // the open chat's frame and a glow keep 6 px of room from the list's edge.
    for (const el of document.querySelectorAll('#ui .rar, #ui .mu-ready, #ui .chat-row.active, #ui .rar-ring')) {
      if (!shown(el) || !visible(el)) continue;
      if (win && !win.contains(el)) continue;
      const box = clipBox(el);
      if (!box) continue;
      const b = el.getBoundingClientRect();
      const p = box.getBoundingClientRect();
      const left = b.left - (p.left + box.clientLeft);
      const right = p.left + box.clientLeft + box.clientWidth - b.right;
      if (Math.min(left, right) < 6) r.clipped.push(`${name(el)} ${Math.round(left)}/${Math.round(right)}`);
    }
    // No name or price is cut through by the bottom of its list (the tab bar): a list fades out over its last 28 px.
    for (const el of document.querySelectorAll('#ui .mu-name, #ui .mu-meta, #ui .mu-money, #ui .chat-who, #ui .chat-last, #ui .rar-badge, #ui .day b')) {
      if (!shown(el)) continue;
      if (win && !win.contains(el)) continue;
      const box = clipBox(el);
      if (!box) continue;
      const cs = getComputedStyle(box);
      const fade = (cs.maskImage || cs.webkitMaskImage || 'none') !== 'none' ? 28 : 0;
      const edge = Math.min(box.getBoundingClientRect().bottom, nav.top);
      for (const n of el.childNodes) {
        if (n.nodeType !== Node.TEXT_NODE || !(n.textContent ?? '').trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(n);
        const t = range.getBoundingClientRect();
        if (t.top < edge - fade - 1 && t.bottom > edge + 1) r.cutByBar.push(name(el));
      }
    }
    for (const k of ['tiny', 'small', 'cut', 'covered', 'overlap', 'underBar', 'outside', 'noRarity', 'clipped', 'cutByBar'] as const) r[k] = [...new Set(r[k])];
    return r;
  }, PET_HOLDERS);
}

async function expectClean(page: Page, where: string): Promise<void> {
  await page.waitForTimeout(300);
  const r = await check(page);
  expect.soft(r.tiny, `${where}: taps under 44 px`).toEqual([]);
  expect.soft(r.small, `${where}: text under 12 px`).toEqual([]);
  expect.soft(r.cut, `${where}: cut text`).toEqual([]);
  expect.soft(r.covered, `${where}: covered taps`).toEqual([]);
  expect.soft(r.overlap, `${where}: overlapping taps`).toEqual([]);
  expect.soft(r.windows, `${where}: windows open`).toBeLessThanOrEqual(1);
  expect.soft(r.underBar, `${where}: under the tab bar`).toEqual([]);
  expect.soft(r.outside, `${where}: out of the screen`).toEqual([]);
  expect.soft(r.noRarity, `${where}: a pet without its rarity`).toEqual([]);
  expect.soft(r.clipped, `${where}: a frame cut by its list`).toEqual([]);
  expect.soft(r.cutByBar, `${where}: a name or a price cut by the tab bar`).toEqual([]);
}

/** Every screen of 07 in turn; fn checks each one. */
async function walk(page: Page, fn: (where: string) => Promise<void>): Promise<void> {
  const tab = (id: string) => page.locator(`[data-tab=${id}]`).click();
  await fn('home');
  await tab('eggs');
  await fn('eggs');
  await page.locator('[data-sheet=eggs] [data-action="egg-card-egg_basic"]').click();
  await fn('egg card');
  await tab('inventory');
  await fn('inventory');
  await page.locator('[data-sheet=inventory] [data-sub=collection]').click();
  await fn('collection');
  await page.locator('[data-sheet=inventory] [data-sub=finds]').click();
  await fn('finds');
  await tab('sales');
  await fn('sales');
  await page.locator('[data-sheet=sales] [data-action=sale-add]').first().click();
  await fn('pick');
  await page.locator('[data-detail=sale] [data-action^="sale-list-"]').first().click();
  await fn('price');
  await tab('market');
  await fn('market');
  await page.locator('[data-sheet=market] [data-action^="lot-open-"]').first().click();
  await fn('lot');
  await tab('shop');
  await fn('shop');
  await page.evaluate(() => (window as unknown as { __TEST__: { runSim(s: number): number } }).__TEST__.runSim(60));
  await tab('chats');
  await fn('chats');
  const row = page.locator('[data-sheet=chats] .chat-row:not(.closed)').first();
  if (await row.isVisible()) await row.click();
  await fn('chat');
  await tab('home');
  await page.locator('[data-action=gifts]').click();
  await page.locator('[data-overlay=gifts] [data-action=gift-review]').click();
  await fn('review window');
  for (const [opener, name] of [
    ['gifts', 'gifts'],
    ['pause', 'pause'],
    ['leaders', 'leaders'],
    ['work', 'work'],
    ['reputation', 'level'],
  ] as const) {
    await tab('home');
    await page.locator(`[data-action=${opener}]`).click();
    await fn(name);
  }
  await tab('home');
}

for (const [w, h] of [
  [375, 650],
  [812, 375],
] as const) {
  test.describe(`MU-12 docs/07 at ${w}×${h}`, () => {
    test.use({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true });

    test('every screen keeps the rules of 07 and shows the rarity of every pet', async ({ page }) => {
      const errors = collectErrors(page);
      await seedSave(page, SEED);
      await open(page);
      await walk(page, (where) => expectClean(page, where));
      expect(errors).toEqual([]);
    });

    test('a system font at 130 %: nothing runs out of the screen or under the tab bar', async ({ page }) => {
      const errors = collectErrors(page);
      await seedSave(page, SEED);
      await open(page);
      // The game sets its sizes in px: the emulation scales every text by 1.3 the way a phone's large font does.
      await walk(page, async (where) => {
        await page.evaluate(() => {
          // Read every size first, then set them (a scaled parent must not scale its children twice).
          const fresh = [...document.querySelectorAll<HTMLElement>('#ui *')].filter((el) => !el.dataset.mu130);
          const sizes = fresh.map((el) => parseFloat(getComputedStyle(el).fontSize));
          fresh.forEach((el, i) => {
            el.dataset.mu130 = '1';
            el.style.fontSize = `${Math.round((sizes[i] ?? 16) * 1.3 * 10) / 10}px`;
          });
        });
        await page.waitForTimeout(200);
        const r = await check(page);
        expect.soft(r.outside, `${where}: out of the screen at 130 %`).toEqual([]);
        expect.soft(r.underBar, `${where}: under the tab bar at 130 %`).toEqual([]);
        expect.soft(r.cut, `${where}: cut at 130 %`).toEqual([]);
      });
      expect(errors).toEqual([]);
    });
  });
}

/** The heights of the list cards on the first screen (CSS px) next to the mockups, ±3 px; the first line of a list 8–14 px under the top bar. */
async function heights(page: Page, sel: string): Promise<number[]> {
  return page.locator(sel).evaluateAll((els) => {
    const bar = document.getElementById('nav')!.getBoundingClientRect().top;
    return els.filter((e) => (e as HTMLElement).offsetParent && e.getBoundingClientRect().bottom <= bar).map((e) => Math.round(e.getBoundingClientRect().height));
  });
}
async function firstLine(page: Page, sheet: string): Promise<number> {
  // A toast moves the screen down while it shows (MU-12): measure after it.
  await page.waitForFunction(() => !document.querySelector('.toast'), null, { timeout: 8000 });
  await page.waitForTimeout(200);
  return page.evaluate((id) => {
    const hud = document.querySelector('.hud')!.getBoundingClientRect().bottom;
    const root = document.querySelector(`[data-sheet=${id}]`)!;
    const first = root.querySelector('.sheet-head:not(:empty) .mu-seg, .sheet-body .mu-head, .sheet-body .mu-card')!;
    return Math.round(first.getBoundingClientRect().top - hud);
  }, sheet);
}

test.describe('the round of fixes, item 1: lists by the mockups at 375×650', () => {
  test.use({ viewport: { width: 375, height: 650 }, hasTouch: true, isMobile: true });

  test('finds 172, the two gift cards 122, the sales places 200; the first line 8–14 px under the top bar', async ({ page }) => {
    const errors = collectErrors(page);
    await seedSave(page, SEED);
    await open(page);
    const near = (list: number[], h: number) => list.every((x) => Math.abs(x - h) <= 3);
    const tab = (id: string) => page.locator(`[data-tab=${id}]`).click();
    await tab('inventory');
    await page.locator('[data-sheet=inventory] [data-sub=finds]').click();
    const finds = await heights(page, '[data-sheet=inventory] .mu-grid.finds .mu-card');
    expect(near(finds, 172), `finds ${finds}`).toBe(true);
    expect(await firstLine(page, 'inventory')).toBeGreaterThanOrEqual(8);
    expect(await firstLine(page, 'inventory')).toBeLessThanOrEqual(14);
    await tab('sales');
    const sales = await heights(page, '[data-sheet=sales] .sheet-body .mu-card');
    expect(near(sales, 200), `sales ${sales}`).toBe(true);
    expect(await firstLine(page, 'sales')).toBeLessThanOrEqual(14);
    for (const id of ['eggs', 'market', 'shop']) {
      await tab(id);
      const top = await firstLine(page, id);
      expect(top >= 8 && top <= 14, `${id}: ${top}`).toBe(true);
    }
    await tab('home');
    await page.locator('[data-action=gifts]').click();
    const gifts = await heights(page, '[data-overlay=gifts] .gift-top .mu-card');
    expect(near(gifts, 122), `gifts ${gifts}`).toBe(true);
    expect(errors).toEqual([]);
  });
});
