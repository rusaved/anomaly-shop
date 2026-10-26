import { expect, test, type Page } from '@playwright/test';
import { collectErrors, open, seedSave, state } from './helpers.ts';

/**
 * P «Доводка» (Ресейл 17): the first minute and the first five minutes with no pause and no false call, on the phone sideways
 * (815×290 with the browser's panel, 812×330, 880×405). Every check taps like a finger.
 */
type T = { __TEST__: { grant(n: number): void; setTimeScale(k: number): void; targets(): { incubators: Array<{ x: number; y: number }>; slots: Array<{ x: number; y: number }>; things: { door: { x: number; y: number } } } | null; t(k: string): string } };
const scale = (page: Page, k: number) => page.evaluate((n) => (window as unknown as T).__TEST__.setTimeScale(n), k);
type St = Awaited<ReturnType<typeof state>> & { chats: Array<{ offer: number }>; stats: { deals: number }; windows: string[]; ftue: string | null };
const st = async (page: Page) => (await state(page)) as St;

test.describe('815x290 P-02', () => {
  test.use({ viewport: { width: 815, height: 290 }, isMobile: true, hasTouch: true });

  for (const species of ['kettle', 'sockfish', 'mitten_seal', 'button_bug', 'clip_snake'])
    test(`P-02 (Q-045 Б) the first buyer pays at least «Обычное яйцо» for a ${species}; after the sale «Купить» of it is open`, async ({ page }) => {
      const errors = collectErrors(page);
      // The first pet of a fresh shop on the shelf, not fed (level 1), nothing sold yet.
      await seedSave(page, {
        coins: 0,
        creatures: [{ uid: 'p1', species, level: 1, fed: 0, hatchedAt: 0, age: 0 }],
        showcase: ['p1'],
        stats: { deals: 0, coinsEarned: 0, hatched: 1, taps: 3, levelUps: 0, haggles: 0 },
        flags: { ftue_starter: true, ftue_fed: true },
      });
      await open(page);
      await scale(page, 4);
      await expect.poll(async () => ((await state(page)) as St).chats.length, { timeout: 20_000 }).toBeGreaterThan(0);
      const egg = 10;
      const offer = ((await state(page)) as St).chats[0]!.offer;
      expect(offer, species).toBeGreaterThanOrEqual(egg);
      await scale(page, 1);
      // Sold in the chat: the coins buy the egg.
      await page.locator('[data-tab=chats]').tap();
      const sell = page.locator('[data-sheet=chats] [data-action=chat-sell]');
      if (!(await sell.isVisible())) await page.locator('[data-sheet=chats] .chat-row:not(.closed)').last().tap();
      await sell.tap();
      await expect.poll(async () => ((await state(page)) as St).stats.deals).toBe(1);
      expect((await state(page)).coins).toBeGreaterThanOrEqual(egg);
      await page.locator('[data-tab=eggs]').tap();
      await expect(page.locator('[data-sheet=eggs] [data-action=egg-buy-egg_basic]')).toHaveAttribute('aria-disabled', 'false');
      expect(errors).toEqual([]);
    });
});

for (const size of [
  { width: 815, height: 290 },
  { width: 812, height: 330 },
  { width: 880, height: 405 },
]) {
  const tag = `${size.width}x${size.height}`;
  test.describe(`${tag} P-05`, () => {
    test.use({ viewport: size, isMobile: true, hasTouch: true });

    test(`P-05 (Q-048 Б) knocking every 0.3 s: the buttons of «Вылупился!» muted for one pause, then «На склад» takes the tap within 1 s of the strip @ ${tag}`, async ({ page }) => {
      const errors = collectErrors(page);
      await open(page);
      const egg = (await page.evaluate(() => (window as unknown as T).__TEST__.targets()))!.incubators[0]!;
      await page.touchscreen.tap(egg.x, egg.y);
      await expect(page.locator('[data-overlay=hatch]')).toBeVisible();
      // The knocking spot: the dim right of the card (sideways), where a tap chooses nothing.
      const dim = await page.evaluate(() => {
        const c = document.querySelector('.card-hatch')!.getBoundingClientRect();
        return { x: (c.right + innerWidth) / 2, y: c.y + c.height / 2 };
      });
      const keep = page.locator('[data-action=hatch-keep]');
      const now = () =>
        page.evaluate(() => {
          const r = (window as unknown as { __TEST__: { state(): { hatchTiming: { result: number } } } }).__TEST__.state().hatchTiming.result;
          return { since: r > 0 ? performance.now() - r : -1, muted: document.querySelector('.card-hatch')!.classList.contains('hatch-locked') };
        });
      let mutedSeen = false;
      let tookAt = -1;
      for (let i = 0; i < 60 && tookAt < 0; i++) {
        await page.touchscreen.tap(dim.x, dim.y);
        const s = await now();
        if (s.since >= 0 && s.since < 600 && s.muted) mutedSeen = true;
        if (s.since >= 820) {
          // The player stops knocking and takes the pet.
          expect(s.muted, 'live after the one pause').toBe(false);
          await keep.tap();
          tookAt = s.since;
        } else await page.waitForTimeout(300);
      }
      await expect(page.locator('[data-overlay=hatch]')).toBeHidden();
      expect(mutedSeen, 'muted during the pause').toBe(true);
      expect(tookAt, 'taken within 1 s after the strip').toBeGreaterThan(0);
      expect(tookAt).toBeLessThanOrEqual(1300);
      expect(errors).toEqual([]);
    });
  });
}

test.describe('815x290 P-03', () => {
  test.use({ viewport: { width: 815, height: 290 }, isMobile: true, hasTouch: true });

  test('P-03 (Q-057 Б) 0 coins, empty incubators and «Мои яйца» past the first minute: the free egg at once — a short toast, no window', async ({ page }) => {
    const errors = collectErrors(page);
    await seedSave(page, {
      coins: 0,
      incubators: [{ egg: null }],
      myEggs: {},
      creatures: [{ uid: 'p1', species: 'kettle', level: 2, fed: 0, hatchedAt: 0, age: 0 }],
      showcase: ['p1'],
    });
    await open(page);
    await expect.poll(async () => ((await state(page)) as St & { incubators: Array<{ egg: string | null }> }).incubators[0]!.egg, { timeout: 3000 }).toBe('egg_basic');
    const toast = page.locator('.toast').first();
    await expect(toast).toBeVisible();
    expect((await toast.innerText()).trim().split(/\s+/).length).toBeLessThanOrEqual(6);
    expect((await st(page)).windows).toEqual([]);
    expect((await state(page)).coins).toBe(0);
    expect(errors).toEqual([]);
  });

  test('P-03 the ring «Покупатель уже идёт» answers a tap: the door rocks, a line of up to 6 words; nothing spent, nothing opened, the buyer still comes', async ({ page }) => {
    test.setTimeout(90_000);
    const errors = collectErrors(page);
    await open(page);
    const t = (await page.evaluate(() => (window as unknown as T).__TEST__.targets()))!;
    await page.touchscreen.tap(t.incubators[0]!.x, t.incubators[0]!.y);
    await page.locator('[data-overlay=hatch] [data-action=hatch-shop]').tap({ timeout: 10_000 });
    await expect(page.locator('[data-overlay=hatch]')).toBeHidden();
    // Fed by taps until the lesson moves on to waiting for the buyer.
    for (let i = 0; i < 30 && (await st(page)).ftue === 'feed'; i++) {
      const pet = (await page.evaluate(() => (window as unknown as T).__TEST__.targets()))!.slots[0]!;
      await page.touchscreen.tap(pet.x, pet.y);
      await page.waitForTimeout(250);
    }
    await expect.poll(async () => (await st(page)).ftue, { timeout: 10_000 }).toBe('waitCustomer');
    const ring = page.locator('.hint-ring[data-step=waitCustomer]');
    await expect(ring).toBeVisible();
    const before = (await state(page)) as St;
    const r = (await ring.boundingBox())!;
    await page.touchscreen.tap(r.x + r.width / 2, r.y + r.height / 2);
    const toast = page.locator('.toast').first();
    await expect(toast).toContainText('Покупатель напишет');
    expect((await toast.innerText()).trim().split(/\s+/).length).toBeLessThanOrEqual(6);
    const after = (await state(page)) as St;
    expect(after.coins).toBe(before.coins);
    expect(after.windows).toEqual([]);
    expect(after.stats.deals).toBe(0);
    // The buyer comes as before.
    await expect.poll(async () => ((await state(page)) as St).chats.length, { timeout: 30_000 }).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });
});

test.describe('815x290 P-04', () => {
  test.use({ viewport: { width: 815, height: 290 }, isMobile: true, hasTouch: true });

  test('P-04 (Q-056 Б п. 1) after the first minute an empty incubator says «Купи новое яйцо» after 8 s of idling; its tap buys the egg', async ({ page }) => {
    const errors = collectErrors(page);
    await seedSave(page, { coins: 30, incubators: [{ egg: null }], myEggs: {}, creatures: [] });
    await open(page);
    const t0 = Date.now();
    const hint = page.locator('.hint[data-hint=buyEgg]');
    await page.waitForTimeout(5000);
    await expect(hint).toBeHidden();
    await expect(hint).toBeVisible({ timeout: 6000 });
    expect(Date.now() - t0).toBeGreaterThanOrEqual(7500);
    await expect(hint).toContainText('Купи новое яйцо');
    const ring = (await page.locator('.hint-ring').boundingBox())!;
    const inc = (await page.evaluate(() => (window as unknown as T).__TEST__.targets()))!.incubators[0]!;
    expect(Math.abs(ring.x + ring.width / 2 - inc.x)).toBeLessThan(4);
    await page.touchscreen.tap(inc.x, inc.y);
    await expect.poll(async () => ((await st(page)) as St & { incubators: Array<{ egg: string | null }> }).incubators[0]!.egg).toBe('egg_basic');
    expect((await st(page)).coins).toBe(20);
    expect(errors).toEqual([]);
  });

  test('P-04 (Q-056 Б п. 2) the «rare egg» step on «Яйца» stands on «Открыть»; its tap opens the egg', async ({ page }) => {
    const errors = collectErrors(page);
    await seedSave(page, {
      coins: 0,
      incubators: [{ egg: 'egg_basic', startedAt: 0, progress: 999, elapsed: 999, waiting: false, careTaps: 0, careFed: 0, ripeSec: 0 }],
      stats: { deals: 1, coinsEarned: 10, hatched: 1, taps: 10, levelUps: 1, haggles: 0 },
      flags: { ftue_starter: true, ftue_fed: true, ftue_bought: true },
    });
    await open(page);
    await expect.poll(async () => (await st(page)).ftue).toBe('hatchRare');
    await page.locator('[data-tab=eggs]').tap();
    const open0 = page.locator('[data-sheet=eggs] [data-action=egg-open-0]');
    await expect(open0).toHaveClass(/is-hinted/);
    await expect(page.locator('.hint')).toContainText('Тапай, там сюрприз');
    await open0.tap();
    await expect(page.locator('[data-overlay=hatch]')).toBeVisible();
    expect(errors).toEqual([]);
  });
});
