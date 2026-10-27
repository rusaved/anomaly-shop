import { expect, test, type Page } from '@playwright/test';
import { collectErrors, open, seedSave, state } from './helpers.ts';

/**
 * PT-05 («Ресейл 21», проход штаба 20: the hint on «Яйца» did not come for 45–91 s once in four): a player idle on «Яйца» after the
 * first minute gets a hint in 10 s at most, whatever the shop is doing — ten tries over the shop's usual states (VK stand-in, upright
 * and sideways).
 */
const FLAGS = {
  ftue_starter: true, ftue_done: true, ftue_fed: true, ftue_bought: true, showcase_m3: true,
  tab_market: true, tab_inventory: true, tab_sales: true, tab_chats: true, tab_shop: true, tab_eggs: true,
};
const warm = { egg: 'egg_basic', startedAt: 0, progress: 0.1, elapsed: 2, waiting: false, careFed: 0 };
const ready = { egg: 'egg_basic', startedAt: 0, progress: 1, elapsed: 60, waiting: false, careFed: 0 };
const pet = { uid: 'h1', species: 'kettle', level: 1, fed: 0, hatchedAt: 0, age: 0 };
// A hint already on screen counts from the moment the player stops: the scroll above is the last touch.
const STATES: Array<{ name: string; save: Record<string, unknown> }> = [
  { name: 'an egg warming, a free incubator, coins for an egg', save: { coins: 66, incubators: [warm, { egg: null }], creatures: [] } },
  { name: 'incubators empty, coins for an egg', save: { coins: 66, incubators: [{ egg: null }, { egg: null }], creatures: [] } },
  { name: 'an egg warming, a pet on the shelf, no coins', save: { coins: 4, incubators: [warm, { egg: null }], creatures: [pet], showcase: ['h1'] } },
  { name: 'an egg ready', save: { coins: 20, incubators: [ready, { egg: null }], creatures: [] } },
  { name: 'an egg in «Мои яйца», incubators empty', save: { coins: 4, incubators: [{ egg: null }, { egg: null }], creatures: [], myEggs: { egg_basic: 1 } } },
];
const SIZES = [
  { width: 405, height: 880 },
  { width: 815, height: 290 },
];

async function idleUntilHint(page: Page): Promise<number | null> {
  const t0 = Date.now();
  while (Date.now() - t0 < 12_000) {
    if ((await state(page)) && (await page.evaluate(() => (window as unknown as { __TEST__: { state(): { hint: string } } }).__TEST__.state().hint))) return (Date.now() - t0) / 1000;
    await page.waitForTimeout(250);
  }
  return null;
}

for (let i = 0; i < 10; i++) {
  const s = STATES[i % STATES.length]!;
  const size = SIZES[Math.floor(i / STATES.length) % SIZES.length]!;
  test.describe(`try ${i + 1}`, () => {
    test.use({ viewport: size, isMobile: true, hasTouch: true });

    test(`PT-05 idle on «Яйца» — a hint in 10 s: ${s.name} @ ${size.width}x${size.height} (try ${i + 1})`, async ({ page }) => {
      const errors = collectErrors(page);
      await seedSave(page, { upgrades: { incubator: 1, incubator_speed: 1 }, myEggs: {}, ...s.save, flags: FLAGS });
      await open(page, '?mock=vk');
      const play = page.locator('[data-action=menu-play]');
      if (await play.isVisible().catch(() => false)) await play.click();
      await page.locator('[data-tab=eggs]').click();
      // Every other try the player scrolls the list a little first (a list scrolled by the player stayed put before PT-05) (the hint's target may lie out of sight then).
      if (i % 2 === 1) {
        const list = (await page.locator('[data-sheet=eggs] .sheet-body').boundingBox())!;
        await page.mouse.move(list.x + list.width / 2, list.y + list.height / 2);
        await page.mouse.wheel(0, 3000);
        await page.waitForTimeout(300);
      }
      const sec = await idleUntilHint(page);
      const st = (await state(page)) as unknown as Record<string, unknown>;
      expect(sec, `no hint in 12 s: ${JSON.stringify({ tab: st.tab, incubators: st.incubators, coins: st.coins, myEggs: st.myEggs, shelf: st.shelf, queue: st.queue })}`).not.toBeNull();
      expect(sec!).toBeLessThanOrEqual(10);
      expect(errors).toEqual([]);
    });
  });
}

test.describe('PT-05 scrolled', () => {
  test.use({ viewport: { width: 815, height: 290 }, isMobile: true, hasTouch: true });

  test('PT-05 the list scrolled to its end, «Купи новое яйцо» on a price out of sight: the target comes back, the hint shows in 10 s', async ({ page }) => {
    const errors = collectErrors(page);
    // The shop has nothing to do but a new egg (no egg, no pet): the call comes at once, on the price of «Обычное яйцо» up the list.
    const save = { v: 1, rev: 999, savedAt: Date.now(), createdAt: 0, lastSeenAt: 0, coins: 66, crystals: 0, incubators: [{ egg: null }, { egg: null }], creatures: [], upgrades: { incubator: 1, incubator_speed: 1 }, myEggs: {}, stats: { deals: 8, coinsEarned: 300, hatched: 10, taps: 100, levelUps: 3, haggles: 1 }, settings: { sound: false, lang: null }, flags: { ...FLAGS, open_market: true, open_inventory: true, open_sales: true, open_chats: true, open_shop: true } };
    await page.addInitScript((t: string) => localStorage.setItem('anomaly-shop:save', t), JSON.stringify(save));
    await open(page, '?mock=vk');
    await page.locator('[data-action=menu-play]').click();
    await page.locator('[data-tab=eggs]').click();
    const list = (await page.locator('[data-sheet=eggs] .sheet-body').boundingBox())!;
    await page.mouse.move(list.x + list.width / 2, list.y + list.height / 2);
    await page.mouse.wheel(0, 3000);
    const sec = await idleUntilHint(page);
    expect(sec, 'the hint never came back').not.toBeNull();
    expect(sec!).toBeLessThanOrEqual(10);
    await expect(page.locator('[data-sheet=eggs] .is-hinted')).toBeInViewport();
    expect(errors).toEqual([]);
  });
});
