import { expect, test, type Page } from '@playwright/test';
import { collectErrors, open, seedSave, state } from './helpers.ts';

/**
 * S «Улучшения и торг» (Ресейл 19): the first five minutes lead to the first upgrade, toasts never lie on buttons or windows, the haggle
 * reads ahead, the chat sideways shows its lines. On the phone sideways (815×290 with the browser's panel, 880×405, 812×330); every
 * check taps like a finger.
 */
type T = {
  __TEST__: {
    setTimeScale(k: number): void;
    t(k: string): string;
    toast(text: string): void;
    calmToast(text: string): void;
  };
};
type St = Awaited<ReturnType<typeof state>> & {
  chats: Array<{ id: number; offer: number }>;
  stats: { deals: number };
  windows: string[];
  tab: string;
  hint: string;
  upgrades: Record<string, number>;
  incubators: Array<{ egg: string | null }>;
};
const st = async (page: Page) => (await state(page)) as St;
const tr = (page: Page, k: string) => page.evaluate((key) => (window as unknown as T).__TEST__.t(key), k);
const SIZES = [
  { width: 815, height: 290 },
  { width: 880, height: 405 },
  { width: 812, height: 330 },
];

/** Waits for a buyer, sells the pet in the chat by finger; returns once the deal is counted. */
async function sell(page: Page): Promise<void> {
  await page.evaluate(() => (window as unknown as T).__TEST__.setTimeScale(8));
  await expect.poll(async () => (await st(page)).chats.length, { timeout: 30_000 }).toBeGreaterThan(0);
  await page.evaluate(() => (window as unknown as T).__TEST__.setTimeScale(1));
  await page.locator('[data-tab=chats]').tap();
  const dialog = page.locator('[data-sheet=chats] [data-chat-dialog]');
  if (!(await dialog.locator('[data-action=chat-sell]').isVisible())) await page.locator('[data-sheet=chats] [data-chat]').first().tap();
  const deals = (await st(page)).stats.deals;
  await dialog.locator('[data-action=chat-sell]').tap();
  await expect.poll(async () => (await st(page)).stats.deals).toBe(deals + 1);
}

for (const size of SIZES) {
  const tag = `${size.width}x${size.height}`;
  test.describe(`${tag} S-01`, () => {
    test.use({ viewport: size, isMobile: true, hasTouch: true });

    test(`S-01 after a deal «Купи улучшение» calls; the tap on «Лавка» frames the upgrade at once (hand on it), it buys; then «Купи новое яйцо» @ ${tag}`, async ({ page }) => {
      const errors = collectErrors(page);
      await seedSave(page, {
        coins: 35,
        // A pet whose sale brings the shop to the price of «Инкубаторы» (50) — the first upgrade the call leads to (S-06).
        creatures: [{ uid: 's1', species: 'kettle', level: 6, fed: 0, hatchedAt: 0, age: 0 }],
        showcase: ['s1'],
        upgrades: {},
        incubators: [{ egg: null }],
        myEggs: {},
        freeIn: { egg_gift: 300 },
      });
      await open(page);
      await sell(page);
      const call = await tr(page, 'ftue.upgrade');
      await expect.poll(async () => (await st(page)).hint, { timeout: 3500 }).toBe(call);
      // From «Чаты» the call stands on «Лавка».
      await expect(page.locator('#nav [data-tab=home].is-hinted')).toBeVisible();
      await page.locator('[data-tab=home]').tap();
      // At once (no 8 s idle): the same words, the frame on an upgrade's price and the hand on it.
      const t0 = Date.now();
      const framed = page.locator('[data-action="buy-upgrade"].is-hinted, [data-action="open-upgrades"].is-hinted');
      await expect(framed).toBeVisible({ timeout: 1500 });
      // S-06: the frame is on «Инкубаторы» — a second egg place the player sees at once.
      expect(await framed.getAttribute('data-id')).toBe('incubator');
      expect(Date.now() - t0).toBeLessThan(1500);
      expect((await st(page)).hint).toBe(call);
      const hand = page.locator('.tap-finger:not([hidden])');
      await expect(hand).toBeVisible();
      const fb = (await framed.boundingBox())!;
      const hb = (await hand.boundingBox())!;
      expect(Math.abs(hb.x - (fb.x + fb.width / 2))).toBeLessThan(fb.width / 2 + 4);
      await page.screenshot({ path: `docs/evidence/S/s01-upgrade-call_${tag}.png` });
      // The framed button buys (a tile that opens the list frames the price inside it next).
      if ((await framed.getAttribute('data-action')) === 'open-upgrades') {
        await framed.tap();
        await page.locator('[data-action="buy-upgrade"].is-hinted').tap();
      } else await framed.tap();
      await expect.poll(async () => (await st(page)).upgrades.incubator ?? 0).toBe(1);
      // The next step is an egg (the upgrade is bought): «Купи новое яйцо», or with too few coins left the free egg the shop gives at
      // once — «Тапни яйцо».
      const eggSteps = [await tr(page, 'ftue.buyEgg'), await tr(page, 'ftue.tapEgg'), await tr(page, 'ftue.warmEgg')];
      await expect.poll(async () => eggSteps.includes((await st(page)).hint), { timeout: 12_000 }).toBe(true);
      expect(errors).toEqual([]);
    });
  });
}

/** A shop past the first deals with a pet on the shelf (the haggle is open from the second deal). */
const HAGGLE_SAVE = {
  coins: 0,
  creatures: [{ uid: 's1', species: 'kettle', level: 3, fed: 0, hatchedAt: 0, age: 0 }],
  showcase: ['s1'],
  upgrades: { sign: 1 },
  stats: { deals: 3, coinsEarned: 60, hatched: 4, taps: 50, levelUps: 2, haggles: 0 },
  freeIn: { egg_gift: 300 },
};

/** Waits for the buyer's letter and opens the chat by finger. */
async function openChat(page: Page) {
  await page.evaluate(() => (window as unknown as T).__TEST__.setTimeScale(8));
  await expect.poll(async () => (await st(page)).chats.length, { timeout: 30_000 }).toBeGreaterThan(0);
  await page.evaluate(() => (window as unknown as T).__TEST__.setTimeScale(1));
  await page.locator('[data-tab=chats]').tap();
  const dialog = page.locator('[data-sheet=chats] [data-chat-dialog]');
  if (!(await dialog.locator('[data-action=chat-sell]').isVisible())) await page.locator('[data-sheet=chats] [data-chat]').first().tap();
  await expect(dialog.locator('[data-action=chat-raise]')).toBeVisible();
  return dialog;
}

/** The bubbles of the open chat whole in sight inside its lines (top to bottom). */
const shownBubbles = (page: Page) =>
  page.evaluate(() => {
    const box = document.querySelector('[data-sheet=chats] [data-chat-dialog] .chat-lines')!.getBoundingClientRect();
    return [...document.querySelectorAll<HTMLElement>('[data-sheet=chats] [data-chat-dialog] .chat-lines > *')]
      .filter((b) => {
        const r = b.getBoundingClientRect();
        return r.height > 0 && r.top >= box.top - 1 && r.bottom <= box.bottom + 1 && r.bottom <= innerHeight;
      })
      .map((b) => ({ text: b.innerText, me: b.classList.contains('me'), tip: b.hasAttribute('data-chat-tip') }));
  });

for (const size of SIZES) {
  const tag = `${size.width}x${size.height}`;
  test.describe(`${tag} S-04`, () => {
    test.use({ viewport: size, isMobile: true, hasTouch: true });

    test(`S-04 S-03 the chat sideways shows the buyer's letter, «А за N?» and the answer (with the risk in words); the tip never takes the letter's place @ ${tag}`, async ({ page }) => {
      const errors = collectErrors(page);
      // The player's very first raise never ends with the buyer gone (H-08): the answer is always there.
      await seedSave(page, HAGGLE_SAVE);
      await open(page);
      const dialog = await openChat(page);
      const sell = dialog.locator('[data-action=chat-sell]');
      const raise = dialog.locator('[data-action=chat-raise]');
      const before = { sell: (await sell.boundingBox())!, raise: (await raise.boundingBox())! };
      // Before the raise: the buyer's letter (its offer) is in sight, the tip of the haggle too, but not in the letter's place.
      const first = await shownBubbles(page);
      expect(first.some((b) => !b.me && !b.tip && /\d/.test(b.text)), JSON.stringify(first)).toBe(true);
      await page.screenshot({ path: `docs/evidence/S/s04-chat-before_${tag}.png` });
      await raise.tap();
      await expect(dialog.locator('[data-chat-think]')).toBeHidden({ timeout: 2500 });
      await expect(dialog.locator('.chat-lines .bubble.me')).toHaveCount(1);
      const lines = await shownBubbles(page);
      await page.screenshot({ path: `docs/evidence/S/s04-chat-after_${tag}.png` });
      const meAt = lines.findIndex((b) => b.me);
      // The letter, «А за N?» and the answer — three lines whole in sight.
      expect(meAt, JSON.stringify(lines)).toBeGreaterThanOrEqual(1);
      expect(lines[meAt - 1]!.me).toBe(false);
      expect(/\d/.test(lines[meAt - 1]!.text)).toBe(true);
      expect(lines[meAt]!.text).toContain('?');
      if (await sell.isVisible()) {
        expect(lines.length - 1, JSON.stringify(lines)).toBeGreaterThan(meAt);
        // S-03: the answer of a first raise tells the risk of the next one in words (a price in it: «могу ещё чуть-чуть» or «почти предел»).
        expect(lines.at(-1)!.me).toBe(false);
        expect(/\d/.test(lines.at(-1)!.text)).toBe(true);
        // The answers keep their size.
        const after = { sell: (await sell.boundingBox())!, raise: (await raise.boundingBox())! };
        expect(after.sell.height).toBeGreaterThanOrEqual(before.sell.height - 0.5);
        expect(Math.min(after.sell.height, after.raise.height)).toBeGreaterThanOrEqual(44);
      }
      expect(errors).toEqual([]);
    });
  });
}

test.describe('815x290 S-05', () => {
  test.use({ viewport: { width: 815, height: 290 }, isMobile: true, hasTouch: true });
  type Box = { text: string; x: number; y: number; w: number; h: number; font: number };
  type TT = { __TEST__: { targets(): { incubators: Array<{ x: number; y: number }>; slots: Array<{ x: number; y: number }> } | null; state(): { floatBoxes: Box[] } } };

  test('S-05 a level up: «+N» of the grown price large (≥ 14 px) with its outline, never on «Ур. N!»', async ({ page }) => {
    test.setTimeout(90_000);
    const errors = collectErrors(page);
    await seedSave(page, { coins: 0, creatures: [{ uid: 's1', species: 'kettle', level: 1, fed: 0, hatchedAt: 0, age: 0 }], showcase: ['s1'], freeIn: { egg_gift: 300 }, upgrades: { sign: 1 } });
    await open(page);
    const level = async () => ((await st(page)).creatures as Array<{ level: number }>)[0]!.level;
    const start = await level();
    let plus: Box | null = null;
    let overlap = false;
    let shot = false;
    for (let i = 0; i < 60 && !plus; i++) {
      const slot = (await page.evaluate(() => (window as unknown as TT).__TEST__.targets()))!.slots[0]!;
      await page.touchscreen.tap(slot.x, slot.y);
      if ((await level()) === start) continue;
      // The level grew: watch the floating texts for a moment.
      for (let k = 0; k < 8; k++) {
        const boxes = await page.evaluate(() => (window as unknown as TT).__TEST__.state().floatBoxes);
        const p = boxes.find((b) => /^\+\d+$/.test(b.text) && b.text !== '+1');
        const lv = boxes.find((b) => !/^\+/.test(b.text));
        if (p && (!plus || p.font > plus.font)) plus = p;
        if (p && lv && p.x < lv.x + lv.w && p.x + p.w > lv.x && p.y < lv.y + lv.h && p.y + p.h > lv.y) overlap = true;
        if (p && !shot) {
          await page.screenshot({ path: 'docs/evidence/S/s05-price-up_815x290.png' });
          shot = true;
        }
        await page.waitForTimeout(80);
      }
    }
    expect(plus, 'the grown price floats').not.toBeNull();
    expect(plus!.font).toBeGreaterThanOrEqual(14);
    expect(overlap, '«+N» on «Ур. N!»').toBe(false);
    expect(errors).toEqual([]);
  });

  test('S-05 the first visit of «Продажи» with the shelf full: no frame on «Снять с витрины»', async ({ page }) => {
    const errors = collectErrors(page);
    await seedSave(page, {
      coins: 0,
      creatures: [{ uid: 's1', species: 'kettle', level: 2, fed: 0, hatchedAt: 0, age: 0 }],
      showcase: ['s1'],
      freeIn: { egg_gift: 300 },
      upgrades: { sign: 1 },
      flags: { ftue_starter: true, ftue_done: true, ftue_fed: true, ftue_bought: true, open_market: true, open_inventory: true, open_sales: true, open_chats: true, open_shop: true },
    });
    await open(page);
    await page.locator('[data-tab=sales]').tap();
    await page.waitForTimeout(600);
    await expect(page.locator('[data-sheet=sales] [data-action^="sale-off-"]').first()).toBeVisible();
    expect(await page.locator('[data-sheet=sales] [data-action^="sale-off-"].is-hinted').count()).toBe(0);
    await page.screenshot({ path: 'docs/evidence/S/s05-sales-first_815x290.png' });
    expect(errors).toEqual([]);
  });
});

/** The toast on screen: its box, whether it lies on a button (a tap would close the toast, not press it) and whether it is whole in sight. */
const toastNow = (page: Page) =>
  page.evaluate(() => {
    const t = [...document.querySelectorAll<HTMLElement>('.toast')].filter((e) => !e.classList.contains('out'));
    const el = t[0];
    if (!el) return { count: 0, text: '', inside: true, onButton: '', box: null as null | { top: number; bottom: number; left: number; right: number } };
    const b = el.getBoundingClientRect();
    const hit = [...document.querySelectorAll<HTMLElement>('button, [data-action]')].find((e) => {
      if (el.contains(e) || e.offsetParent === null) return false;
      // Only the part of the button in sight: a list clips what it scrolled under the top bar.
      let r = e.getBoundingClientRect();
      for (let p = e.parentElement; p; p = p.parentElement) {
        if (getComputedStyle(p).overflowY === 'visible') continue;
        const c = p.getBoundingClientRect();
        r = new DOMRect(Math.max(r.left, c.left), Math.max(r.top, c.top), Math.min(r.right, c.right) - Math.max(r.left, c.left), Math.min(r.bottom, c.bottom) - Math.max(r.top, c.top));
      }
      return r.width > 0 && r.height > 0 && r.top < b.bottom - 1 && r.bottom > b.top + 1 && r.left < b.right - 1 && r.right > b.left + 1;
    });
    return {
      count: t.length,
      text: el.dataset.text ?? '',
      inside: b.left >= -0.5 && b.top >= -0.5 && b.right <= innerWidth + 0.5 && b.bottom <= innerHeight + 0.5,
      onButton: hit ? (hit.dataset.action ?? hit.className) : '',
      box: { top: b.top, bottom: b.bottom, left: b.left, right: b.right },
    };
  });

for (const size of SIZES) {
  const tag = `${size.width}x${size.height}`;
  test.describe(`${tag} S-02`, () => {
    test.use({ viewport: size, isMobile: true, hasTouch: true });

    test(`S-02 toasts: an event, a novelty, «Новое: … яйцо» one at a time, whole in sight, never on a button; a find while «Вылупился!» is open comes after it @ ${tag}`, async ({ page }) => {
      test.setTimeout(90_000);
      const errors = collectErrors(page);
      // «Мои яйца» with a ready and a waiting egg: their «Открыть» and «Забрать» stand in the first row of «Яйца».
      await seedSave(page, {
        coins: 40,
        creatures: [{ uid: 's1', species: 'kettle', level: 2, fed: 0, hatchedAt: 0, age: 0 }, { uid: 's2', species: 'cloudcat', level: 1, fed: 0, hatchedAt: 0, age: 0 }],
        showcase: ['s1'],
        myEggs: { egg_basic: 2 },
        upgrades: { sign: 1 },
        freeIn: { egg_gift: 0 },
      });
      await open(page);
      await page.locator('[data-tab=eggs]').tap();
      await page.waitForTimeout(400);
      // The list scrolled a little: its buttons pass under the top bar (clipped there) — the toast still finds the bar's free stretch.
      await page.evaluate(() => {
        const body = document.querySelector<HTMLElement>('[data-sheet=eggs] > .sheet-body');
        if (body) body.scrollTop = 40;
      });
      const golden = await tr(page, 'event.golden');
      // A real event, a calm novelty and a plain toast — at once.
      await page.evaluate(() => {
        const api = (window as unknown as { __TEST__: { event(id: string): boolean; calmToast(t: string): void; toast(t: string): void; t(k: string): string } }).__TEST__;
        // «Золотой покупатель!» — the event's own words (the event itself waits for its minute of the session).
        api.toast(api.t('event.golden'));
        api.calmToast(api.t('toast.upgradeUnlocked').replace('{name}', 'Коврик'));
        api.toast(api.t('toast.eggUnlocked').replace('{name}', 'Тёплое яйцо'));
        // A long one (two lines in the bar).
        api.toast(api.t('event.pie'));
      });
      const seen: string[] = [];
      let two = 0;
      const bad: string[] = [];
      const t0 = Date.now();
      while (Date.now() - t0 < 18_000) {
        const s = await toastNow(page);
        if (s.count > 1) two += 1;
        if (s.text && !seen.includes(s.text)) {
          seen.push(s.text);
          if (seen.length === 1) await page.screenshot({ path: `docs/evidence/S/s02-toast-eggs_${tag}.png` });
        }
        if (s.text && (!s.inside || s.onButton)) bad.push(`${s.text}: ${s.inside ? '' : 'за краем '}${s.onButton}`);
        await page.waitForTimeout(100);
      }
      expect(seen).toContain(golden);
      expect(seen.length, seen.join(' | ')).toBeGreaterThanOrEqual(4);
      expect(two, 'two toasts at once').toBe(0);
      expect(bad, 'a toast on a button or out of the screen').toEqual([]);
      // A find while «Вылупился!» is open: it waits under nothing and comes after the window.
      await page.locator('[data-tab=home]').tap();
      await page.evaluate(() => (window as unknown as { __TEST__: { hatch(uid: string, egg: string): boolean } }).__TEST__.hatch('s2', 'egg_basic'));
      await expect(page.locator('[data-overlay=hatch]')).toBeVisible();
      const find = 'Находка «Полпути»!';
      // A find is a rare toast (as in the game): it is kept while others wait behind the window.
      await page.evaluate((text) => (window as unknown as { __TEST__: { toast(t: string, k: string): void } }).__TEST__.toast(text, 'rare'), find);
      for (let i = 0; i < 15; i++) {
        expect((await toastNow(page)).text).not.toBe(find);
        await page.waitForTimeout(100);
      }
      const overlay = page.locator('[data-overlay=hatch]');
      if (await overlay.locator('[data-hatch-result]').isHidden()) await overlay.locator('[data-action=hatch-skip]').tap();
      await overlay.locator('[data-action=hatch-shop]').tap();
      await expect(overlay).toBeHidden();
      await expect.poll(async () => (await toastNow(page)).text, { timeout: 4000 }).toBe(find);
      const s = await toastNow(page);
      expect(s.inside).toBe(true);
      expect(s.onButton).toBe('');
      await page.screenshot({ path: `docs/evidence/S/s02-toast-after-window_${tag}.png` });
      expect(errors).toEqual([]);
    });
  });
}

test.describe('815x290 S-09', () => {
  test.use({ viewport: { width: 815, height: 290 }, isMobile: true, hasTouch: true });

  test('S-09 the first finger tap asks for the whole screen; a refusal keeps the game whole and the next tap (a second later) asks again; inside the whole screen (880×405) the layout is whole and a tap asks nothing; a mouse never asks', async ({ page }) => {
    test.setTimeout(60_000);
    const errors = collectErrors(page);
    // The Fullscreen API stand-in: counts the requests, refuses the first, then goes «full» when the test says so.
    await page.addInitScript(() => {
      const w = window as unknown as { __fs: { asks: number; refuse: boolean; el: Element | null } };
      w.__fs = { asks: 0, refuse: true, el: null };
      Object.defineProperty(Document.prototype, 'fullscreenElement', { configurable: true, get: () => w.__fs.el });
      Element.prototype.requestFullscreen = function () {
        w.__fs.asks += 1;
        return w.__fs.refuse ? Promise.reject(new TypeError('refused')) : Promise.resolve();
      };
    });
    await seedSave(page, { coins: 30, upgrades: { sign: 1 }, freeIn: { egg_gift: 300 } });
    await open(page);
    const asks = () => page.evaluate(() => (window as unknown as { __fs: { asks: number } }).__fs.asks);
    // A mouse click asks nothing.
    await page.mouse.click(400, 150);
    await page.waitForTimeout(200);
    expect(await asks()).toBe(0);
    await page.touchscreen.tap(400, 150);
    await expect.poll(asks).toBe(1);
    // Refused: the game stays whole in its window; a tap within the second does not ask, one after it does.
    await page.touchscreen.tap(400, 150);
    await page.waitForTimeout(150);
    expect(await asks()).toBe(1);
    await page.waitForTimeout(1000);
    await page.touchscreen.tap(400, 150);
    await expect.poll(asks).toBe(2);
    // The browser lets it: the whole screen of the phone sideways (880×405) — the layout follows.
    await page.setViewportSize({ width: 880, height: 405 });
    await page.evaluate(() => {
      (window as unknown as { __fs: { el: Element | null } }).__fs.el = document.documentElement;
      document.dispatchEvent(new Event('fullscreenchange'));
    });
    await page.waitForTimeout(400);
    const box = await page.evaluate(() => {
      const app = document.querySelector<HTMLElement>('#app') ?? document.body;
      const r = (s: string) => document.querySelector(s)?.getBoundingClientRect();
      return { w: app.clientWidth, h: app.clientHeight, sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight, hud: r('.hud'), nav: r('#nav'), canvas: r('canvas') };
    });
    expect(box.sw).toBeLessThanOrEqual(880);
    expect(box.sh).toBeLessThanOrEqual(405);
    expect(box.nav!.bottom).toBeLessThanOrEqual(405.5);
    expect(box.nav!.right).toBeLessThanOrEqual(880.5);
    expect(box.hud!.top).toBeGreaterThanOrEqual(-0.5);
    expect(box.canvas!.width).toBeGreaterThan(400);
    await page.screenshot({ path: 'docs/evidence/S/s09-fullscreen_880x405.png' });
    // Inside the whole screen a tap asks nothing.
    await page.waitForTimeout(1000);
    await page.touchscreen.tap(440, 200);
    await page.waitForTimeout(200);
    expect(await asks()).toBe(2);
    expect(errors).toEqual([]);
  });
});
