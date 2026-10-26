import { expect, test, type Page } from '@playwright/test';
import { collectErrors, open, seedSave, state } from './helpers.ts';

/**
 * P «Доводка» (Ресейл 17): the first minute and the first five minutes with no pause and no false call, on the phone sideways
 * (815×290 with the browser's panel, 812×330, 880×405). Every check taps like a finger.
 */
type T = { __TEST__: { grant(n: number): void; setTimeScale(k: number): void; targets(): { incubators: Array<{ x: number; y: number }>; slots: Array<{ x: number; y: number }>; things: { door: { x: number; y: number } } } | null; t(k: string): string } };
const scale = (page: Page, k: number) => page.evaluate((n) => (window as unknown as T).__TEST__.setTimeScale(n), k);
type St = Awaited<ReturnType<typeof state>> & { chats: Array<{ offer: number }>; stats: { deals: number } };

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
