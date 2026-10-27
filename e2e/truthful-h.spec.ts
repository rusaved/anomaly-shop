import { expect, test, type Page } from '@playwright/test';
import { collectErrors, open, seedSave, state } from './helpers.ts';

/**
 * H «Торг и темп» (Ресейл 18): the first five minutes livelier, on the phone sideways (815×290 with the browser's panel, 812×330,
 * 880×405). Every check taps like a finger.
 */
type T = {
  __TEST__: {
    setTimeScale(k: number): void;
    targets(): { incubators: Array<{ x: number; y: number }>; slots: Array<{ x: number; y: number }> } | null;
    t(k: string): string;
    toast(text: string): void;
    calmToast(text: string): void;
  };
};
type St = Awaited<ReturnType<typeof state>> & { chats: Array<{ id: number; offer: number }>; stats: { deals: number }; windows: string[]; ftue: string | null; tab: string };
const st = async (page: Page) => (await state(page)) as St;
const tr = (page: Page, k: string) => page.evaluate((key) => (window as unknown as T).__TEST__.t(key), k);
const SIDE = { width: 815, height: 290 };

test.describe('815x290 H-01', () => {
  test.use({ viewport: SIDE, isMobile: true, hasTouch: true });

  test('H-01 the ring «Покупатель уже идёт» answers at once, even while another toast is on screen', async ({ page }) => {
    test.setTimeout(90_000);
    const errors = collectErrors(page);
    await open(page);
    const t = (await page.evaluate(() => (window as unknown as T).__TEST__.targets()))!;
    await page.touchscreen.tap(t.incubators[0]!.x, t.incubators[0]!.y);
    await page.locator('[data-overlay=hatch] [data-action=hatch-shop]').tap({ timeout: 10_000 });
    await expect(page.locator('[data-overlay=hatch]')).toBeHidden();
    for (let i = 0; i < 30 && (await st(page)).ftue === 'feed'; i++) {
      const pet = (await page.evaluate(() => (window as unknown as T).__TEST__.targets()))!.slots[0]!;
      await page.touchscreen.tap(pet.x, pet.y);
      await page.waitForTimeout(250);
    }
    await expect.poll(async () => (await st(page)).ftue, { timeout: 10_000 }).toBe('waitCustomer');
    const ring = page.locator('.hint-ring[data-step=waitCustomer]');
    await expect(ring).toBeVisible();
    // «Новое в магазине» comes (calm news in the top bar): the ring stays, the player taps it in the toast's first second.
    await page.evaluate(() => (window as unknown as T).__TEST__.calmToast('Новое в магазине: проверка'));
    await expect(page.locator('.toast').first()).toBeVisible();
    await expect(ring).toBeVisible();
    const r = (await ring.boundingBox())!;
    const t0 = Date.now();
    await page.touchscreen.tap(r.x + r.width / 2, r.y + r.height / 2);
    await expect(page.locator('.toast:not(.out)').first()).toContainText(await tr(page, 'ftue.waitCustomerTap'), { timeout: 1000 });
    expect(Date.now() - t0, 'the answer within 1 s').toBeLessThan(1000);
    expect(errors).toEqual([]);
  });

  test('H-01 the green dot of «Склад» is a find’s reward: the tap opens «Находки» with «Забрать»; no find — no dot', async ({ page }) => {
    const errors = collectErrors(page);
    await seedSave(page, {
      coins: 0,
      creatures: [],
      showcase: [],
      stats: { deals: 1, dealsAll: 1, coinsEarned: 30, hatched: 1, taps: 20, levelUps: 1, haggles: 0 },
      flags: { ftue_starter: true, ftue_done: true, ftue_fed: true, ftue_bought: true, find_first_deal: true },
      // The gift egg is not ready (its dot would be on «Яйца» first).
      freeIn: { egg_gift: 300 },
    });
    await open(page);
    const dot = page.locator('[data-tab=inventory] [data-badge].nav-dot');
    await expect(dot).toBeVisible();
    await page.locator('[data-tab=inventory]').tap();
    await expect(page.locator('[data-sheet=inventory] [data-sub=finds]')).toHaveClass(/active/);
    const take = page.locator('[data-sheet=inventory] [data-action=find-take-first_deal]');
    await expect(take).toBeVisible();
    await take.tap();
    await expect(dot).toBeHidden();
    expect(errors).toEqual([]);
  });

  test('H-01 an empty «Склад» with nothing to take shows no dot and opens on «Питомцы»', async ({ page }) => {
    const errors = collectErrors(page);
    await seedSave(page, {
      coins: 0,
      creatures: [],
      showcase: [],
      stats: { deals: 1, dealsAll: 1, coinsEarned: 30, hatched: 1, taps: 20, levelUps: 1, haggles: 0 },
      flags: { ftue_starter: true, ftue_done: true, ftue_fed: true, ftue_bought: true, find_first_deal: true, find_claimed_first_deal: true },
      freeIn: { egg_gift: 300 },
    });
    await open(page);
    await page.waitForTimeout(500);
    await expect(page.locator('[data-tab=inventory] [data-badge].nav-dot')).toBeHidden();
    await page.locator('[data-tab=inventory]').tap();
    await expect(page.locator('[data-sheet=inventory] [data-sub=items]')).toHaveClass(/active/);
    expect(errors).toEqual([]);
  });
});

for (const size of [SIDE, { width: 812, height: 330 }, { width: 880, height: 405 }]) {
  const tag = `${size.width}x${size.height}`;
  test.describe(`${tag} H-01 hatch`, () => {
    test.use({ viewport: size, isMobile: true, hasTouch: true });

    test(`H-01 in the pause of «Вылупился!» «Продать сразу» is muted too, then lights up with the others @ ${tag}`, async ({ page }) => {
      const errors = collectErrors(page);
      // Past the first minute: a plain egg ready, so «Продать сразу» is there.
      await seedSave(page, { coins: 0, incubators: [{ egg: 'egg_basic', startedAt: 0, progress: 999, elapsed: 999, waiting: false }], freeIn: { egg_gift: 300 }, creatures: [], showcase: [] });
      await open(page);
      const egg = (await page.evaluate(() => (window as unknown as T).__TEST__.targets()))!.incubators[0]!;
      await page.touchscreen.tap(egg.x, egg.y);
      const overlay = page.locator('[data-overlay=hatch]');
      await expect(overlay).toBeVisible();
      const sell = overlay.locator('[data-action=hatch-sell]');
      const look = () =>
        page.evaluate(() => {
          const s = document.querySelector<HTMLElement>('[data-overlay=hatch] [data-action=hatch-sell]')!;
          const k = document.querySelector<HTMLElement>('[data-overlay=hatch] [data-action=hatch-keep]')!;
          return { locked: document.querySelector('.card-hatch')!.classList.contains('hatch-locked'), sell: getComputedStyle(s).color + getComputedStyle(s).opacity, keep: getComputedStyle(k).color, shown: s.offsetParent !== null };
        });
      let locked: Awaited<ReturnType<typeof look>> | null = null;
      for (let i = 0; i < 100 && !locked; i++) {
        const l = await look();
        if (l.locked && l.shown) locked = l;
        else await page.waitForTimeout(50);
      }
      expect(locked, 'the pause with «Продать сразу» in sight').not.toBeNull();
      await expect.poll(async () => (await look()).locked, { timeout: 3000 }).toBe(false);
      await page.waitForTimeout(400);
      const live = await look();
      expect(live.sell, '«Продать сразу» changes when the pause ends').not.toBe(locked!.sell);
      await expect(sell).toBeVisible();
      expect(errors).toEqual([]);
    });
  });
}

test.describe('815x290 H-02', () => {
  test.use({ viewport: SIDE, isMobile: true, hasTouch: true });
  const run = async (page: Page) => {
    const egg = (await page.evaluate(() => (window as unknown as T).__TEST__.targets()))!.incubators[0]!;
    await page.touchscreen.tap(egg.x, egg.y);
    await expect(page.locator('[data-overlay=hatch]')).toBeVisible();
    await expect.poll(() => page.evaluate(() => (window as unknown as { __TEST__: { state(): { hatchTiming: { result: number } } } }).__TEST__.state().hatchTiming.result), { timeout: 10_000 }).toBeGreaterThan(0);
    return page.evaluate(() => {
      const t = (window as unknown as { __TEST__: { state(): { hatchTiming: { start: number; result: number } } } }).__TEST__.state().hatchTiming;
      return (t.result - t.start) / 1000;
    });
  };

  test('H-02 the first egg of a fresh shop runs the long strip (about 5 s)', async ({ page }) => {
    const errors = collectErrors(page);
    await open(page);
    expect(await run(page)).toBeGreaterThan(4);
    expect(errors).toEqual([]);
  });

  test('H-02 a plain egg past the third runs the quick strip (1.5–2 s)', async ({ page }) => {
    const errors = collectErrors(page);
    await seedSave(page, { coins: 0, incubators: [{ egg: 'egg_basic', startedAt: 0, progress: 999, elapsed: 999, waiting: false }], freeIn: { egg_gift: 300 }, creatures: [], showcase: [] });
    await open(page);
    const sec = await run(page);
    const rarity = await page.locator('[data-overlay=hatch] .card-hatch').getAttribute('data-rarity');
    // A plain egg may still give «ценный» or rarer — that one keeps the long show.
    if (rarity === 'common' || rarity === 'good') {
      expect(sec).toBeGreaterThanOrEqual(1.4);
      expect(sec).toBeLessThanOrEqual(2.3);
    } else expect(sec).toBeGreaterThan(4);
    expect(errors).toEqual([]);
  });
});

for (const size of [SIDE, { width: 812, height: 330 }, { width: 880, height: 405 }, { width: 390, height: 844 }]) {
  const tag = `${size.width}x${size.height}`;
  test.describe(`${tag} H-03`, () => {
    test.use({ viewport: size, isMobile: true, hasTouch: true });

    test(`H-03 «Поднять цену» in a chat from the second deal: a one-time tip, the buyer thinks ≤ 1 s and answers; at most two raises @ ${tag}`, async ({ page }) => {
      const errors = collectErrors(page);
      await seedSave(page, {
        coins: 0,
        creatures: [{ uid: 'h1', species: 'kettle', level: 3, fed: 0, hatchedAt: 0, age: 0 }],
        showcase: ['h1'],
        stats: { deals: 2, dealsAll: 2, coinsEarned: 60, hatched: 3, taps: 30, levelUps: 2, haggles: 0 },
        freeIn: { egg_gift: 300 },
      });
      await open(page);
      await page.evaluate(() => (window as unknown as T).__TEST__.setTimeScale(8));
      await expect.poll(async () => (await st(page)).chats.length, { timeout: 30_000 }).toBeGreaterThan(0);
      await page.evaluate(() => (window as unknown as T).__TEST__.setTimeScale(1));
      await page.locator('[data-tab=chats]').tap();
      const dialog = page.locator('[data-sheet=chats] [data-chat-dialog]');
      if (!(await dialog.locator('[data-action=chat-sell]').isVisible())) await page.locator('[data-sheet=chats] [data-chat]').first().tap();
      const raise = dialog.locator('[data-action=chat-raise]');
      await expect(raise).toBeVisible();
      const tip = dialog.locator('[data-chat-tip]');
      await expect(tip).toBeVisible();
      expect((await tip.innerText()).trim().split(/\s+/).length).toBeLessThanOrEqual(6);
      // Every answer whole in sight, over the tab bar.
      const bar = (await page.locator('#nav').boundingBox())!;
      for (const a of ['chat-sell', 'chat-raise', 'chat-decline']) {
        const b = (await dialog.locator(`[data-action=${a}]`).boundingBox())!;
        expect(b.y + b.height, `${a} over the tab bar`).toBeLessThanOrEqual(bar.y + 0.5);
        expect(b.x + b.width).toBeLessThanOrEqual(size.width + 0.5);
        expect(Math.min(b.width, b.height)).toBeGreaterThanOrEqual(40);
      }
      await page.screenshot({ path: `docs/evidence/H/chat-haggle_${tag}.png` });
      const first = (await st(page)).chats[0]!;
      const before = first.offer;
      const t0 = Date.now();
      await raise.tap();
      await expect(dialog.locator('[data-chat-think]')).toBeVisible();
      await expect(dialog.locator('[data-chat-think]')).toBeHidden({ timeout: 1500 });
      expect(Date.now() - t0, 'the buyer answers within 1 s').toBeLessThan(1400);
      await expect(tip).toBeHidden();
      // The test state lists the open chats only: a buyer who left is not there.
      const c = (await st(page)).chats.find((x) => x.id === first.id);
      if (c) {
        expect(c.offer).toBeGreaterThan(before);
        // The second raise, then no third.
        await raise.tap();
        await expect(dialog.locator('[data-chat-think]')).toBeHidden({ timeout: 1500 });
        await page.waitForTimeout(100);
        if ((await st(page)).chats.some((x) => x.id === first.id)) await expect(raise).toBeHidden();
      } else {
        // Gone: the pet is back with the player, not sold.
        expect((await st(page)).stats.deals).toBe(2);
        expect(((await st(page)).creatures as Array<{ uid: string }>).some((x) => x.uid === 'h1')).toBe(true);
      }
      expect(errors).toEqual([]);
    });
  });
}

test.describe('815x290 H-03 first deal', () => {
  test.use({ viewport: SIDE, isMobile: true, hasTouch: true });
  test('H-03 the very first deal has no «Поднять цену»', async ({ page }) => {
    const errors = collectErrors(page);
    await seedSave(page, {
      coins: 0,
      creatures: [{ uid: 'p1', species: 'kettle', level: 1, fed: 0, hatchedAt: 0, age: 0 }],
      showcase: ['p1'],
      stats: { deals: 0, coinsEarned: 0, hatched: 1, taps: 3, levelUps: 0, haggles: 0 },
      flags: { ftue_starter: true, ftue_fed: true },
    });
    await open(page);
    await expect.poll(async () => (await st(page)).chats.length, { timeout: 30_000 }).toBeGreaterThan(0);
    await page.locator('[data-tab=chats]').tap();
    const dialog = page.locator('[data-sheet=chats] [data-chat-dialog]');
    if (!(await dialog.locator('[data-action=chat-sell]').isVisible())) await page.locator('[data-sheet=chats] [data-chat]').first().tap();
    await expect(dialog.locator('[data-action=chat-sell]')).toBeVisible();
    await expect(dialog.locator('[data-action=chat-raise]')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});
