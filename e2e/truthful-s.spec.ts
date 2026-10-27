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
        creatures: [{ uid: 's1', species: 'kettle', level: 2, fed: 0, hatchedAt: 0, age: 0 }],
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
      await expect.poll(async () => Object.values((await st(page)).upgrades).reduce((a, b) => a + b, 0)).toBe(1);
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
