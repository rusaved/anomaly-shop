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
