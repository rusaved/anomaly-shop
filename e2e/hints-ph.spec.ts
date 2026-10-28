import { expect, test, type Page } from '@playwright/test';
import { collectErrors, open, seedSave, state } from './helpers.ts';

/**
 * PH «Подсказки стоя» (Ресейл 22, проход штаба 28.10): upright in the VK stand-in the chain of hints holds after the first sale —
 * the waiting chat framed at once on «Чаты» whatever tab the player came from, «Сохранить» answered by the words of the listed pet,
 * the dot of «Склад» gone once the player looked there (PH-01); «Тапни яйцо» that led to «Лавка» marks the ready egg at once (PH-02);
 * the bubble of the first «Магазин» lies on no name of the list (PH-03). Every check taps like a finger.
 */
type T = { __TEST__: { setTimeScale(k: number): void; t(k: string): string; targets(): { incubators: Array<{ x: number; y: number }> } } };
type St = Awaited<ReturnType<typeof state>> & { chats: unknown[]; hint: string; tab: string };
const st = async (page: Page) => (await state(page)) as St;
const tr = (page: Page, k: string) => page.evaluate((key) => (window as unknown as T).__TEST__.t(key), k);
const UPRIGHT = [
  { width: 405, height: 880 },
  { width: 405, height: 720 },
  { width: 375, height: 667 },
];
const OPEN = { ftue_starter: true, ftue_done: true, ftue_fed: true, ftue_bought: true, price_saved: true, showcase_m3: true, open_market: true, open_inventory: true, open_sales: true, open_chats: true, open_shop: true, open_eggs: true };
const SEEN = { tab_market: true, tab_inventory: true, tab_sales: true, tab_chats: true, tab_shop: true, tab_eggs: true };
const pet = { uid: 'p1', species: 'kettle', level: 2, fed: 0, hatchedAt: 0, age: 0 };

async function start(page: Page, save: Record<string, unknown>) {
  await seedSave(page, { upgrades: { incubator: 1 }, myEggs: {}, freeIn: { egg_gift: 900 }, ...save });
  await open(page, '?mock=vk');
  const play = page.locator('[data-action=menu-play]');
  if (await play.isVisible().catch(() => false)) await play.tap();
}

for (const size of UPRIGHT) {
  const tag = `${size.width}x${size.height}`;
  test.describe(tag, () => {
    test.use({ viewport: size, isMobile: true, hasTouch: true });

    test(`PH-01 a buyer wrote, the player comes to «Чаты» from «Склад» at once: the chat is framed in 1 s @ ${tag}`, async ({ page }) => {
      const errors = collectErrors(page);
      await start(page, { coins: 0, creatures: [pet], showcase: ['p1'], incubators: [{ egg: null }], flags: { ...OPEN, ...SEEN } });
      await page.locator('[data-tab=inventory]').tap();
      await page.evaluate(() => (window as unknown as T).__TEST__.setTimeScale(8));
      await expect.poll(async () => (await st(page)).chats.length, { timeout: 40_000 }).toBeGreaterThan(0);
      await page.evaluate(() => (window as unknown as T).__TEST__.setTimeScale(1));
      await page.locator('[data-tab=chats]').tap();
      const t0 = Date.now();
      await expect(page.locator('[data-sheet=chats] .is-hinted').first()).toBeVisible({ timeout: 1000 });
      expect(Date.now() - t0).toBeLessThan(1000);
      expect((await st(page)).hint).toBe(await tr(page, 'ftue.sell'));
      expect(errors).toEqual([]);
    });

    test(`PH-01 «Сохранить» on «Цена»: «Питомец на витрине, ждём покупателя» or the next step at once, no silence @ ${tag}`, async ({ page }) => {
      const errors = collectErrors(page);
      await start(page, { coins: 0, creatures: [], showcase: [], incubators: [{ egg: 'egg_warm', progress: 30, elapsed: 30, waiting: false }], flags: { ...OPEN, ...SEEN } });
      const inc = (await page.evaluate(() => (window as unknown as T).__TEST__.targets()))!.incubators[0]!;
      await page.touchscreen.tap(inc.x, inc.y);
      await expect(page.locator('[data-hatch-result]')).toBeVisible({ timeout: 8000 });
      await page.waitForTimeout(950);
      await page.locator('[data-action=hatch-shop]').tap();
      const save = page.locator('[data-action="sale-save"]');
      await expect(save).toBeVisible();
      await save.tap();
      const t0 = Date.now();
      // The words of the listed pet, or the next step when there is one (an egg to tap): never silence.
      await expect.poll(async () => (await st(page)).hint, { timeout: 1000 }).not.toBe('');
      expect(Date.now() - t0).toBeLessThan(1000);
      // It stands while nothing else calls (no 10 s of silence).
      await page.waitForTimeout(5000);
      expect((await st(page)).hint).not.toBe('');
      expect(errors).toEqual([]);
    });

    test(`PH-01 the dot of «Склад» goes once the player looked there @ ${tag}`, async ({ page }) => {
      const errors = collectErrors(page);
      await start(page, { coins: 0, creatures: [pet], showcase: ['p1'], incubators: [{ egg: null }], flags: { ...OPEN, ...SEEN, find_first_deal: true } });
      const dot = page.locator('[data-tab=inventory] [data-badge]');
      await expect(dot).toBeVisible();
      await page.locator('[data-tab=inventory]').tap();
      await page.waitForTimeout(400);
      await page.locator('[data-tab=home]').tap();
      await page.waitForTimeout(400);
      await expect(dot).toBeHidden();
      expect(errors).toEqual([]);
    });

    test(`PH-02 «Тапни яйцо» from «Продажи» leads to «Лавка»: the ready egg is marked in 1 s @ ${tag}`, async ({ page }) => {
      const errors = collectErrors(page);
      await start(page, { coins: 0, creatures: [], showcase: [], incubators: [{ egg: 'egg_basic', startedAt: 0, progress: 1, elapsed: 60, waiting: false, careFed: 0 }, { egg: null }], flags: { ...OPEN, ...SEEN, tap_hatch_1: true, tap_hatch_2: true, tap_hatch_3: true } });
      await page.locator('[data-tab=sales]').tap();
      const home = page.locator('[data-tab=home].is-hinted');
      await expect(home).toBeVisible({ timeout: 12_000 });
      await home.tap();
      const t0 = Date.now();
      await expect(page.locator('.hint-ring[data-step=tapEgg]').or(page.locator('.tap-finger:not([hidden])')).first()).toBeVisible({ timeout: 1000 });
      expect(Date.now() - t0).toBeLessThan(1000);
      expect((await st(page)).hint).toBe(await tr(page, 'ftue.tapEgg'));
      expect(errors).toEqual([]);
    });
  });
}

for (const size of [...UPRIGHT, { width: 880, height: 405 }]) {
  const tag = `${size.width}x${size.height}`;
  test.describe(`${tag} PH-03`, () => {
    test.use({ viewport: size, isMobile: true, hasTouch: true });

    test(`PH-03 the first «Магазин»: «Улучшай лавку» lies on no name or use of an upgrade @ ${tag}`, async ({ page }) => {
      const errors = collectErrors(page);
      const seen: Record<string, boolean> = { ...SEEN };
      delete seen.tab_shop;
      await start(page, { coins: 900, creatures: [pet], showcase: ['p1'], incubators: [{ egg: null }, { egg: null }], flags: { ...OPEN, ...seen } });
      await page.locator('[data-tab=shop]').tap();
      // The call is the green frame on a price; its words stand only where they lie on no words of the list (Q-084).
      await expect(page.locator('[data-sheet=shop] [data-action=buy-upgrade].is-hinted').first()).toBeVisible();
      await page.waitForTimeout(400);
      const words = (await st(page)).hint;
      expect(['', await tr(page, 'ftue.tab.shop')]).toContain(words);
      const under = await page.evaluate(() => {
        const bubble = document.querySelector<HTMLElement>('.hint:not([hidden])');
        if (!bubble) return [];
        const h = bubble.getBoundingClientRect();
        return [...document.querySelectorAll<HTMLElement>('.sheet:not([hidden]) .mu-name, .sheet:not([hidden]) .mu-meta, .sheet:not([hidden]) button')]
          .filter((e) => e.offsetParent !== null && !e.classList.contains('is-hinted') && !e.closest('.is-hinted') && !e.closest('#nav'))
          .filter((e) => {
            const r = e.getBoundingClientRect();
            return r.width > 0 && r.top < h.bottom - 1 && r.bottom > h.top + 1 && r.left < h.right - 1 && r.right > h.left + 1;
          })
          .map((e) => e.textContent?.trim() ?? e.className);
      });
      await page.screenshot({ path: `test-results/ph03-${tag}.png` });
      expect(under).toEqual([]);
      expect(errors).toEqual([]);
    });
  });
}
