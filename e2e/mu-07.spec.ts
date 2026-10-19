import { expect, test, type Page } from '@playwright/test';
import { collectErrors, open, seedSave } from './helpers.ts';

/**
 * MU-12: the automatic check of docs/07-mobile-ui.md on every screen — portrait 375×650 (the zone a phone leaves to the game) and 812×330 (sideways, 07 «Приёмка»).
 * Taps ≥ 44 px, text ≥ 12 px (the 11 px rarity badges of 07 aside), buttons ≥ 14 px, nothing cut or covered,
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
  windowScroll: string[];
  mainCut: string[];
  mains: number;
}

function check(page: Page): Promise<Report> {
  return page.evaluate((holders) => {
    const r: Report = { tiny: [], small: [], cut: [], covered: [], overlap: [], windows: 0, underBar: [], outside: [], noRarity: [], clipped: [], cutByBar: [], windowScroll: [], mainCut: [], mains: 0 };
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
        // 07: the rarity badge word 11 px (the tab labels are 12 since the round of fixes, item 6).
        const eleven = el.closest('.rar-badge, .nav-badge') !== null;
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
        // A toast lies over a list for its 2 s where no free band is left and takes the tap itself (07 rule 17, круг правок FB-3 п. 5).
        if (hit && !el.contains(hit) && !hit.contains(el) && !(hit.closest('.overlay') && !el.closest('.overlay')) && !hit.closest('.toast')) r.covered.push(`${name(el)} under ${name(hit)}`);
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
        // Line by line: a line going under the edge lies in the fade.
        for (const t of range.getClientRects()) if (t.top < edge - fade - 1 && t.bottom > edge + 1) r.cutByBar.push(name(el));
      }
    }
    // 07 rule 7: one main action on a screen (in the open window, when there is one).
    r.mains = [...document.querySelectorAll('#ui .mu-btn.main, #ui .btn-primary')].filter((el) => shown(el) && visible(el) && (!win || win.contains(el))).length;
    // The main button of a screen is seen whole, never half under the tab bar or the edge of its list.
    for (const el of document.querySelectorAll('#ui .mu-btn.main, #ui .btn-primary')) {
      if (!shown(el) || (win && !win.contains(el))) continue;
      const v = visible(el);
      const b = el.getBoundingClientRect();
      if (v && b.height - v.height > 2) r.mainCut.push(`${name(el)} ${Math.round(v.height)}/${Math.round(b.height)}`);
    }
    // A window with a few buttons fits between the bars whole, without a scroll inside (the level's list and «Подарки» scroll).
    const card = win?.querySelector<HTMLElement>(':scope > .card');
    if (card && win && !['reputation', 'gifts'].includes((win as HTMLElement).dataset.overlay ?? '') && card.scrollHeight > card.clientHeight + 1)
      r.windowScroll.push(`${(win as HTMLElement).dataset.overlay} ${card.scrollHeight}>${card.clientHeight}`);
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
  expect.soft(r.windowScroll, `${where}: a window scrolls inside`).toEqual([]);
  expect.soft(r.mainCut, `${where}: the main button cut`).toEqual([]);
  expect.soft(r.mains, `${where}: main buttons on the screen`).toBeLessThanOrEqual(1);
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
  [812, 330],
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

test.describe('the round of fixes, item 2: sideways 812×330 is «list + detail»', () => {
  test.use({ viewport: { width: 812, height: 330 }, hasTouch: true, isMobile: true });

  /** The part of el above the tab bar and under the top bar, px. */
  const inSight = (page: Page, sel: string) =>
    page.locator(sel).first().evaluate((el) => {
      const b = el.getBoundingClientRect();
      const bar = document.getElementById('nav')!.getBoundingClientRect().top;
      const hud = document.querySelector('.hud')!.getBoundingClientRect().bottom;
      return { top: Math.round(b.top - hud), bottom: Math.round(bar - b.bottom), h: Math.round(Math.min(b.bottom, bar) - Math.max(b.top, hud)) };
    });
  const widestMain = (page: Page) =>
    page.evaluate(() => Math.max(0, ...[...document.querySelectorAll<HTMLElement>('#ui .mu-btn.main, #ui .btn-primary')].filter((b) => b.offsetParent).map((b) => b.getBoundingClientRect().width)));

  test('rows 44–52 px (a second line of whole words up to 72); the lot, the egg card, the collection, the gifts and «Вылупился!» whole', async ({ page }) => {
    const errors = collectErrors(page);
    await seedSave(page, SEED);
    await open(page);
    const tab = (id: string) => page.locator(`[data-tab=${id}]`).click();
    for (const id of ['eggs', 'inventory', 'sales', 'market', 'shop']) {
      await tab(id);
      // A loaded machine draws the tab a frame later: measure once its first card is there.
      await expect(page.locator(`[data-sheet=${id}] .sheet-body .mu-card`).first()).toBeVisible();
      const rows = await heights(page, `[data-sheet=${id}] .sheet-body .mu-card`);
      expect(rows.length, id).toBeGreaterThan(0);
      // Круг правок FB п. 6: a row of whole words may take a second line (no shrinking) — most rows stay 44–52 (l1, l3).
      expect(rows.every((h) => h >= 44 && h <= 72), `${id} rows ${rows}`).toBe(true);
      expect([...rows].sort((a, b) => a - b)[Math.floor(rows.length / 2)]!, `${id} rows ${rows}`).toBeLessThanOrEqual(52);
      expect(await widestMain(page), id).toBeLessThanOrEqual(360);
    }
    await tab('market');
    await page.locator('[data-sheet=market] [data-action^="lot-open-"]').first().click();
    // The pet, the lines and the answers: every answer whole, the lines with room (круг правок FB п. 6: two columns — the pet over the lines,
    // the newest line with its price whole in sight).
    const lines = await inSight(page, '[data-detail=lot] .chat-lines');
    expect(lines.h, 'the seller lines').toBeGreaterThanOrEqual(88);
    const last = await page.evaluate(() => {
      const box = document.querySelector('[data-detail=lot] .chat-lines')!.getBoundingClientRect();
      const b = document.querySelector('[data-detail=lot] .chat-lines > .bubble:last-child')!.getBoundingClientRect();
      return b.top >= box.top - 1 && b.bottom <= box.bottom + 1;
    });
    expect(last, 'the newest seller line whole').toBe(true);
    for (const sel of ['[data-detail=lot] .lot-pet', '[data-detail=lot] .lot-buttons']) expect((await inSight(page, sel)).bottom, sel).toBeGreaterThanOrEqual(0);
    expect(await widestMain(page)).toBeLessThanOrEqual(360);
    await tab('eggs');
    await page.locator('[data-sheet=eggs] [data-action="egg-card-egg_basic"]').click();
    const odds = await inSight(page, '[data-sheet=eggs] .cards-odds .mu-card');
    expect(odds.bottom, '«Что внутри»: the first row whole').toBeGreaterThanOrEqual(0);
    await tab('inventory');
    await page.locator('[data-sheet=inventory] [data-sub=collection]').click();
    const tops = await page.locator('[data-sheet=inventory] .card-col').evaluateAll((els) => {
      const bar = document.getElementById('nav')!.getBoundingClientRect().top;
      return [...new Set(els.filter((e) => e.getBoundingClientRect().top + 24 <= bar).map((e) => Math.round(e.getBoundingClientRect().top)))];
    });
    expect(tops.length, 'two rows of the collection in sight').toBeGreaterThanOrEqual(2);
    await tab('home');
    await page.locator('[data-action=gifts]').click();
    expect((await inSight(page, '[data-action=gift-daily]')).bottom, '«Забрать подарок дня» without a scroll').toBeGreaterThanOrEqual(0);
    await page.locator('[data-action=gifts-close]').click();
    // «Вылупился!»: the whole name and the price line over the buttons.
    await tab('eggs');
    await page.evaluate(() => (window as unknown as { __TEST__: { grant(n: number): void } }).__TEST__.grant(500));
    await page.locator('[data-sheet=eggs] [data-action="egg-buy-egg_basic"]').click();
    const openEgg = page.locator('[data-sheet=eggs] [data-action^="egg-open-"]').first();
    for (let i = 0; i < 40 && !(await openEgg.isVisible()); i++) await page.evaluate(() => (window as unknown as { __TEST__: { runSim(s: number): number } }).__TEST__.runSim(5));
    await openEgg.click();
    const skip = page.locator('[data-action=hatch-skip]');
    if (await skip.isVisible()) await skip.click();
    await expect(page.locator('[data-hatch-name]')).toBeVisible();
    const hatch = await page.evaluate(() => {
      const r = (sel: string) => document.querySelector(sel)!.getBoundingClientRect();
      const name = document.querySelector<HTMLElement>('[data-hatch-name]')!;
      return { nameWhole: name.scrollWidth <= name.clientWidth + 1 && r('[data-hatch-name]').height < 30, rangeOver: r('[data-hatch-range]').bottom <= r('.hatch-buttons').top + 1, buttonsIn: r('.hatch-buttons').bottom <= r('.card-hatch').bottom };
    });
    expect(hatch).toEqual({ nameWhole: true, rangeOver: true, buttonsIn: true });
    expect(errors).toEqual([]);
  });
});

/** The size of the first shown element of each selector and how many lines its text takes. */
async function type(page: Page, sels: string[]): Promise<Record<string, string>> {
  return page.evaluate((list) => {
    const out: Record<string, string> = {};
    for (const sel of list) {
      const el = [...document.querySelectorAll<HTMLElement>(sel)].find((e) => e.offsetParent && e.getBoundingClientRect().height > 0);
      if (!el) {
        out[sel] = 'none';
        continue;
      }
      // Lines of the text alone: a coin badge inside sits on its own box.
      const bottoms = new Set<number>();
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (!n.textContent?.trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(n);
        for (const r of range.getClientRects()) if (r.width > 1) bottoms.add(Math.round(r.bottom));
      }
      const lines = bottoms.size;
      out[sel] = `${getComputedStyle(el).fontSize} ${lines}`;
    }
    return out;
  }, sels);
}

for (const [w, h] of [
  [375, 650],
  [812, 330],
] as const) {
  test.describe(`the round of fixes, item 3: the font scale of 07 at ${w}×${h}`, () => {
    test.use({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true });

    test('titles 18 on one line, pet names 18, the big price 32, section labels 12.5', async ({ page }) => {
      const errors = collectErrors(page);
      await seedSave(page, SEED);
      await open(page);
      const tab = (id: string) => page.locator(`[data-tab=${id}]`).click();
      await tab('eggs');
      expect(await type(page, ['[data-sheet=eggs] .mu-head h3'])).toEqual({ '[data-sheet=eggs] .mu-head h3': '12.5px 1' });
      await tab('sales');
      await page.locator('[data-sheet=sales] [data-action="sale-add"]').first().click();
      await page.locator('[data-detail=sale] [data-action^="sale-list-"]').first().click();
      expect(await type(page, ['[data-detail=sale] .mu-back h2', '.price-pet-text .mu-name', '.price-big'])).toEqual({
        '[data-detail=sale] .mu-back h2': '18px 1',
        '.price-pet-text .mu-name': '18px 1',
        '.price-big': '32px 1',
      });
      await tab('home');
      await page.locator('[data-action=reputation]').click();
      expect(await type(page, ['[data-overlay] .card > h2'])).toEqual({ '[data-overlay] .card > h2': '18px 1' });
      await page.keyboard.press('Escape');
      await tab('home');
      await page.locator('[data-action=gifts]').click();
      expect(await type(page, ['.gifts-top h2'])).toEqual({ '.gifts-top h2': '18px 1' });
      expect(errors).toEqual([]);
    });
  });
}

test.describe('the round of fixes, item 6: the small things', () => {
  test.use({ viewport: { width: 375, height: 650 }, hasTouch: true, isMobile: true });

  test('tab names and 12 px labels, the top bar 44 px, one green fill among the finds, «Скидка? Возьму за…» on one line', async ({ page }) => {
    const errors = collectErrors(page);
    await seedSave(page, SEED);
    await open(page);
    const tabs = await page.locator('#nav .nav-tab:not([hidden])').evaluateAll((els) =>
      els.map((b) => {
        const label = b.querySelector('.nav-label')!;
        const range = document.createRange();
        range.selectNodeContents(label);
        return { name: b.getAttribute('aria-label'), text: (label.textContent ?? '').trim(), size: getComputedStyle(label).fontSize, lines: Math.round(range.getBoundingClientRect().height / 13) };
      }),
    );
    expect(tabs.length).toBe(7);
    for (const t of tabs) expect(t, t.text).toEqual({ name: t.text, text: t.text, size: '12px', lines: 1 });
    await expect(page.getByRole('button', { name: 'Продажи' })).toBeVisible();
    // The top bar: every element 44 px to the eye (its own fill, not a 40 px pill inside a 44 px tap).
    const hud = await page.locator('.hud-btn:not([hidden]), .hud-level b, .hud-pill').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height) + (getComputedStyle(e).backgroundClip === 'content-box' ? -4 : 0)));
    expect(hud.every((h) => h === 44), `${hud}`).toBe(true);
    await page.locator('[data-tab=inventory]').click();
    await page.locator('[data-sheet=inventory] [data-sub=finds]').click();
    expect(await page.locator('[data-sheet=inventory] .mu-btn.good').count()).toBeLessThanOrEqual(1);
    await page.locator('[data-tab=market]').click();
    await page.locator('[data-sheet=market] [data-action^="lot-open-"]').first().click();
    const bargain = page.locator('[data-action=lot-bargain]');
    if (await bargain.count()) expect((await bargain.boundingBox())!.height).toBeLessThanOrEqual(46);
    expect(errors).toEqual([]);
  });
});

test.describe('the round of fixes, item 8: a toast moves nothing, a hint lies on no card', () => {
  test.use({ viewport: { width: 375, height: 650 }, hasTouch: true, isMobile: true });

  test('a toast over «Рынок» leaves every card where the finger aims', async ({ page }) => {
    const errors = collectErrors(page);
    await seedSave(page, SEED);
    await open(page);
    await page.locator('[data-tab=market]').click();
    await page.waitForFunction(() => !document.querySelector('.toast'), null, { timeout: 8000 });
    const card = page.locator('[data-sheet=market] .mu-card').first();
    // The game stands still once the lots are in: the market never refreshes under the check (it measures the toast, not the market's timer).
    await card.waitFor();
    await page.evaluate(() => (window as unknown as { __TEST__: { setTimeScale(k: number): void } }).__TEST__.setTimeScale(0));
    const before = (await card.boundingBox())!;
    await page.evaluate(() => (window as unknown as { __TEST__: { toast(t: string): void } }).__TEST__.toast('Подарок: 50'));
    await expect(page.locator('.toast').first()).toBeVisible();
    await page.waitForTimeout(500);
    expect((await card.boundingBox())!.y).toBe(before.y);
    expect(errors).toEqual([]);
  });

  test('the hint over a tab of the bar takes its own band: no card of the open screen under it', async ({ page }) => {
    const errors = collectErrors(page);
    // showcase_m3: the save is new enough — an empty shelf stays empty (older saves put every pet on it).
    await seedSave(page, { ...SEED, showcase: [], flags: { ...SEED.flags, showcase_m3: true } });
    await open(page);
    // The game stands still (no buyer, nothing put on the shelf): the hint of an empty shelf comes after 8 s without a tap.
    await page.evaluate(() => (window as unknown as { __TEST__: { setTimeScale(k: number): void } }).__TEST__.setTimeScale(0));
    await page.locator('[data-tab=shop]').click();
    const hint = page.locator('.hint:not([hidden])');
    await expect(hint).toBeVisible({ timeout: 15000 });
    const under = await page.evaluate(() => {
      const h = document.querySelector('.hint:not([hidden])')!.getBoundingClientRect();
      const body = document.querySelector('[data-sheet=shop] .sheet-body')!.getBoundingClientRect();
      return [...document.querySelectorAll('[data-sheet=shop] .mu-card')]
        .map((c) => c.getBoundingClientRect())
        .filter((c) => Math.min(c.bottom, body.bottom) - Math.max(c.top, body.top) > 1 && c.left < h.right && c.right > h.left && Math.max(c.top, body.top) < h.bottom && Math.min(c.bottom, body.bottom) > h.top).length;
    });
    expect(under).toBe(0);
    expect(errors).toEqual([]);
  });
});

test.describe('the round of fixes, item 8 (the recheck): the first hint of a tab moves nothing when it goes', () => {
  test.use({ viewport: { width: 812, height: 330 }, hasTouch: true, isMobile: true });

  test('«Рынок» on its first visit: the hint stands in a band at the bottom, the lots stay put after the first tap', async ({ page }) => {
    const errors = collectErrors(page);
    const flags = { ...SEED.flags } as Record<string, boolean>;
    delete flags.tab_market;
    await seedSave(page, { ...SEED, flags });
    await open(page);
    await page.locator('[data-tab=market]').click();
    await expect(page.locator('.hint:not([hidden])')).toBeVisible({ timeout: 8000 });
    const lot = page.locator('[data-sheet=market] .mu-card').first();
    // The game stands still once the lots are in: the market never refreshes its lots under the check (it measures the hint, not the timer).
    await lot.waitFor();
    await page.evaluate(() => (window as unknown as { __TEST__: { setTimeScale(k: number): void } }).__TEST__.setTimeScale(0));
    const before = (await lot.boundingBox())!.y;
    // The first tap on the screen (its head) hides the hint: the lot under a finger does not move.
    await page.locator('[data-sheet=market] .mu-head h3').tap();
    await page.waitForTimeout(400);
    expect((await lot.boundingBox())!.y).toBe(before);
    expect(errors).toEqual([]);
  });
});
