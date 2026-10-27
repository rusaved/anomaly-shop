import { expect, test, type Page } from '@playwright/test';
import { collectErrors, open, seedSave, state } from './helpers.ts';

/**
 * N «Рост и быстрые проверки» (Ресейл 20): the game calls to the second and third upgrade, the hints never lie on buttons or over a
 * sheet, the chat's head tells the offer, the producer's presets. On the phone sideways (815×290 with the browser's panel, 880×405,
 * 812×330); every check taps like a finger.
 */
type T = { __TEST__: { setTimeScale(k: number): void; t(k: string): string } };
type St = Awaited<ReturnType<typeof state>> & {
  chats: Array<{ id: number; offer: number }>;
  stats: { deals: number; hatched: number };
  windows: string[];
  tab: string;
  hint: string;
  upgrades: Record<string, number>;
};
const st = async (page: Page) => (await state(page)) as St;
const tr = (page: Page, k: string) => page.evaluate((key) => (window as unknown as T).__TEST__.t(key), k);
const levels = async (page: Page) => Object.values((await st(page)).upgrades).reduce((a, b) => a + b, 0);
const SIZES = [
  { width: 815, height: 290 },
  { width: 880, height: 405 },
  { width: 812, height: 330 },
];

/** N-01, N-02: the buttons of the screen the hint's bubble lies on (its target aside); [] — none. */
const bubbleOn = (page: Page) =>
  page.evaluate(() => {
    const bubble = document.querySelector<HTMLElement>('.hint:not([hidden])');
    if (!bubble) return [];
    const h = bubble.getBoundingClientRect();
    return [...document.querySelectorAll<HTMLElement>('button, [data-action]')]
      .filter((e) => e.offsetParent !== null && !e.classList.contains('is-hinted') && !e.querySelector('.is-hinted') && !e.closest('.is-hinted') && !e.closest('#nav'))
      .filter((e) => {
        let r = e.getBoundingClientRect();
        for (let p = e.parentElement; p; p = p.parentElement) {
          if (getComputedStyle(p).overflowY === 'visible') continue;
          const c = p.getBoundingClientRect();
          r = new DOMRect(Math.max(r.left, c.left), Math.max(r.top, c.top), Math.min(r.right, c.right) - Math.max(r.left, c.left), Math.min(r.bottom, c.bottom) - Math.max(r.top, c.top));
        }
        return r.width > 0 && r.height > 0 && r.top < h.bottom - 1 && r.bottom > h.top + 1 && r.left < h.right - 1 && r.right > h.left + 1;
      })
      .map((e) => e.dataset.action ?? e.className);
  });

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
  test.describe(`${tag} N-01`, () => {
    test.use({ viewport: size, isMobile: true, hasTouch: true });

    test(`N-01 after the first upgrade a deal calls «Купи улучшение» again: frame and hand on «Вывеска» at once, it buys; not again before 3 deals @ ${tag}`, async ({ page }) => {
      const errors = collectErrors(page);
      await seedSave(page, {
        coins: 150,
        // Seller level 3 (8 deals): «Вывеска» (60) is open; the incubator is empty — «Купи новое яйцо» would call too.
        creatures: [
          { uid: 'n1', species: 'kettle', level: 3, fed: 0, hatchedAt: 0, age: 0 },
          { uid: 'n2', species: 'kettle', level: 3, fed: 0, hatchedAt: 0, age: 0 },
        ],
        showcase: ['n1', 'n2'],
        upgrades: { incubator: 1 },
        incubators: [{ egg: null }, { egg: null }],
        myEggs: {},
        freeIn: { egg_gift: 300 },
      });
      await open(page);
      await sell(page);
      const call = await tr(page, 'ftue.upgrade');
      await expect.poll(async () => (await st(page)).hint, { timeout: 3500 }).toBe(call);
      await expect(page.locator('#nav [data-tab=home].is-hinted')).toBeVisible();
      await page.locator('[data-tab=home]').tap();
      const t0 = Date.now();
      const framed = page.locator('[data-action="buy-upgrade"].is-hinted');
      await expect(framed).toBeVisible({ timeout: 1500 });
      expect(Date.now() - t0).toBeLessThan(1500);
      expect(await framed.getAttribute('data-id')).toBe('sign');
      expect((await st(page)).hint).toBe(call);
      const hand = page.locator('.tap-finger:not([hidden])');
      await expect(hand).toBeVisible();
      const fb = (await framed.boundingBox())!;
      const hb = (await hand.boundingBox())!;
      expect(Math.abs(hb.x - (fb.x + fb.width / 2))).toBeLessThan(fb.width / 2 + 4);
      await page.screenshot({ path: `docs/evidence/N/n01-second-upgrade_${tag}.png` });
      expect(await bubbleOn(page)).toEqual([]);
      await framed.tap();
      await expect.poll(() => levels(page)).toBe(2);
      expect((await st(page)).upgrades.sign).toBe(1);
      // The next deal is the second since the call: no «Купи улучшение», though coins are there for one.
      await sell(page);
      await page.waitForTimeout(2500);
      expect((await st(page)).hint).not.toBe(call);
      expect(errors).toEqual([]);
    });
  });
}

const FLAGS_OPEN = { ftue_starter: true, ftue_done: true, ftue_fed: true, ftue_bought: true, open_market: true, open_inventory: true, open_sales: true, open_chats: true, open_shop: true };

for (const size of SIZES) {
  const tag = `${size.width}x${size.height}`;
  test.describe(`${tag} N-02`, () => {
    test.use({ viewport: size, isMobile: true, hasTouch: true });

    test(`N-02 «На витрину» → «Цена»: «Сохрани цену» on «Сохранить» at once; then the first «Продажи» with the pet listed: no «выставь», the bubble on no button @ ${tag}`, async ({ page }) => {
      const errors = collectErrors(page);
      await seedSave(page, { coins: 0, creatures: [], showcase: [], incubators: [{ egg: 'egg_warm', progress: 30, elapsed: 30, waiting: false }], freeIn: { egg_gift: 300 }, upgrades: { sign: 1 }, flags: FLAGS_OPEN });
      await open(page);
      const inc = (await page.evaluate(() => (window as unknown as { __TEST__: { targets(): { incubators: Array<{ x: number; y: number }> } } }).__TEST__.targets()))!.incubators[0]!;
      await page.touchscreen.tap(inc.x, inc.y);
      await expect(page.locator('[data-hatch-result]')).toBeVisible({ timeout: 8000 });
      await page.waitForTimeout(950);
      await page.locator('[data-action=hatch-shop]').tap();
      const t0 = Date.now();
      const save = page.locator('[data-action="sale-save"]');
      await expect(save).toBeVisible();
      const words = await tr(page, 'ftue.priceSave');
      await expect.poll(async () => (await st(page)).hint, { timeout: 1500 }).toBe(words);
      expect(Date.now() - t0).toBeLessThan(1500);
      await expect(page.locator('[data-action="sale-save"].is-hinted')).toBeVisible();
      expect(await bubbleOn(page)).toEqual([]);
      await page.screenshot({ path: `docs/evidence/N/n02-price-save_${tag}.png` });
      await save.tap();
      await expect(save).toBeHidden();
      await expect.poll(async () => (await st(page)).hint).not.toBe(words);
      expect(errors).toEqual([]);
    });

    test(`N-02 the first «Продажи» with the shelf full: «на витрине» words, no «выставь», the bubble on no button @ ${tag}`, async ({ page }) => {
      const errors = collectErrors(page);
      await seedSave(page, { coins: 0, creatures: [{ uid: 's1', species: 'kettle', level: 2, fed: 0, hatchedAt: 0, age: 0 }], showcase: ['s1'], freeIn: { egg_gift: 300 }, upgrades: { sign: 1 }, flags: FLAGS_OPEN });
      await open(page);
      await page.locator('[data-tab=sales]').tap();
      await expect.poll(async () => (await st(page)).hint).toBe(await tr(page, 'ftue.tab.salesListed'));
      await page.waitForTimeout(300);
      expect(await bubbleOn(page)).toEqual([]);
      expect(await page.locator('[data-sheet=sales] [data-action^="sale-off-"].is-hinted').count()).toBe(0);
      await page.screenshot({ path: `docs/evidence/N/n02-sales-first_${tag}.png` });
      expect(errors).toEqual([]);
    });
  });
}

for (const size of SIZES) {
  const tag = `${size.width}x${size.height}`;
  test.describe(`${tag} N-03`, () => {
    test.use({ viewport: size, isMobile: true, hasTouch: true });

    test(`N-03 «Тапни яйцо»: the coins of the top bar open «Магазин» — the ring and the hand hide; back on «Лавка» they show again @ ${tag}`, async ({ page }) => {
      const errors = collectErrors(page);
      await open(page);
      const ring = page.locator('.hint-ring:not([hidden])');
      await expect(ring).toBeVisible();
      await page.locator('[data-action=balance]').tap();
      await expect.poll(async () => (await st(page)).tab).toBe('shop');
      await page.waitForTimeout(400);
      await page.screenshot({ path: `docs/evidence/N/n03-store-no-ring_${tag}.png` });
      await expect(ring).toHaveCount(0);
      await expect(page.locator('.tap-finger:not([hidden])')).toHaveCount(0);
      await page.locator('[data-tab=home]').tap();
      await expect(ring).toBeVisible();
      expect(errors).toEqual([]);
    });
  });
}

for (const size of SIZES) {
  const tag = `${size.width}x${size.height}`;
  test.describe(`${tag} N-04`, () => {
    test.use({ viewport: size, isMobile: true, hasTouch: true });

    test(`N-04 the chat's head tells the buyer's offer: the same number as «Продать за N», before and after «Поднять цену» @ ${tag}`, async ({ page }) => {
      const errors = collectErrors(page);
      await seedSave(page, {
        coins: 0,
        creatures: [{ uid: 's1', species: 'kettle', level: 3, fed: 0, hatchedAt: 0, age: 0 }],
        showcase: ['s1'],
        upgrades: { sign: 1 },
        stats: { deals: 3, coinsEarned: 60, hatched: 4, taps: 50, levelUps: 2, haggles: 0 },
        freeIn: { egg_gift: 300 },
      });
      await open(page);
      await page.evaluate(() => (window as unknown as T).__TEST__.setTimeScale(8));
      await expect.poll(async () => (await st(page)).chats.length, { timeout: 30_000 }).toBeGreaterThan(0);
      await page.evaluate(() => (window as unknown as T).__TEST__.setTimeScale(1));
      await page.locator('[data-tab=chats]').tap();
      const dialog = page.locator('[data-sheet=chats] [data-chat-dialog]');
      if (!(await dialog.locator('[data-action=chat-sell]').isVisible())) await page.locator('[data-sheet=chats] [data-chat]').first().tap();
      const num = (s: string) => Number(s.replace(/[^\d]/g, ''));
      const sell = dialog.locator('[data-action=chat-sell]');
      const head = dialog.locator('.chat-ask');
      expect(num(await head.innerText())).toBe(num(await sell.innerText()));
      await dialog.locator('[data-action=chat-raise]').tap();
      await expect(dialog.locator('[data-chat-think]')).toBeHidden({ timeout: 2500 });
      // The player's first raise never loses the buyer (H-08): the answer and its price are there.
      await expect(sell).toBeVisible();
      expect(num(await head.innerText())).toBe(num(await sell.innerText()));
      await page.screenshot({ path: `docs/evidence/N/n04-chat-head_${tag}.png` });
      expect(errors).toEqual([]);
    });
  });
}

type Pre = St & { stats: { deals: number; hatched: number; xp?: number }; elapsed: number; flags?: Record<string, boolean> };

test.describe('N-05 the check link', () => {
  test.use({ viewport: { width: 815, height: 290 }, isMobile: true, hasTouch: true });

  test('N-05 ?fresh=1 starts a new save over an old one, and the new one stays after a reload without it', async ({ page }) => {
    const errors = collectErrors(page);
    await seedSave(page, { coins: 500 });
    await open(page, '?fresh=1');
    const s = (await st(page)) as Pre;
    expect(s.coins).toBe(0);
    expect(s.stats.hatched).toBe(0);
    expect(s.stats.deals).toBe(0);
    await page.waitForTimeout(500);
    await open(page);
    expect((await st(page)).coins).toBe(0);
    expect(errors).toEqual([]);
  });

  test('N-05 presets with ?fresh=1: coins, hatched, deals (the haggle opens), time (minutes of play); the build line in «Настройки»', async ({ page }) => {
    const errors = collectErrors(page);
    await seedSave(page, { coins: 500 });
    await open(page, '?fresh=1&coins=345&hatched=2&deals=3&time=4');
    const s = (await state(page)) as unknown as Pre;
    expect(s.coins).toBe(345);
    expect(s.stats.deals).toBe(3);
    expect(s.stats.hatched).toBeGreaterThanOrEqual(3);
    expect(s.elapsed).toBeGreaterThanOrEqual(240);
    expect((s as unknown as { ftue: string | null }).ftue).toBeNull();
    await page.locator('[data-action=pause]').tap();
    await page.locator('[data-action=settings]').tap();
    const line = page.locator('[data-build-line]');
    await expect(line).toBeVisible();
    expect(await line.innerText()).toMatch(/^(сборка|build) ([0-9a-f]{7}|local)$/);
    await page.waitForTimeout(400);
    await page.screenshot({ path: 'docs/evidence/N/n05-build-line_815x290.png' });
    expect(errors).toEqual([]);
  });

  test('N-05 ?hatched=N alone: the first minute is behind from 2', async ({ page }) => {
    const errors = collectErrors(page);
    await open(page, '?fresh=1&hatched=2&coins=60');
    const s = (await state(page)) as unknown as Pre;
    expect(s.stats.hatched).toBe(2);
    expect(s.coins).toBe(60);
    expect((s as unknown as { ftue: string | null }).ftue).toBeNull();
    expect(errors).toEqual([]);
  });
});
