import { expect, test, type Page } from '@playwright/test';
import { collectErrors, open, seedSave, state } from './helpers.ts';
import { closeAll, FRAMES_SAVE, OPENERS } from './frames-shared.ts';

/**
 * W «Окна под браузер» (Ресейл 13): on the producer's phone sideways — the whole screen 880×405 and a browser with its panel 815×290 —
 * every window keeps its main action and its deciding line whole, over the tab bar, without a scroll (the scroll stays at the start);
 * what pays (an ad, coins) and what cannot be undone stays out of the lower third (07 rule 2).
 */
const PHONE = { width: 880, height: 405 };
const PANEL = { width: 815, height: 290 };
/** The fade at the bottom of a list sideways (src/ui/mu.css, W-07): a thing in it is not whole for the eye. */
const FADE = 14;

type Box = { top: number; bottom: number; left: number; right: number; covered: string };
/** The box of the first match as it is now (no scrolling) and what a tap at its middle reaches if not itself. */
async function box(page: Page, sel: string): Promise<Box> {
  const b = await page.evaluate((s) => {
    const el = [...document.querySelectorAll<HTMLElement>(s)].find((e) => e.offsetParent !== null || getComputedStyle(e).position === 'fixed');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    const covered = hit && hit !== el && !el.contains(hit) && !hit.contains(el) ? (hit as HTMLElement).className || hit.tagName : '';
    return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, covered };
  }, sel);
  expect(b, `${sel} on screen`).not.toBeNull();
  return b!;
}
const navTop = async (page: Page) => (await page.locator('#nav').boundingBox())!.y;
const hudBottom = async (page: Page) => {
  const b = (await page.locator('.hud').boundingBox())!;
  return b.y + b.height;
};
/** Whole over the tab bar (and over the fade of a list), under the top bar, inside the screen, nothing on it. */
async function wholeOnScreen(page: Page, sel: string, fade = 0): Promise<Box> {
  const b = await box(page, sel);
  expect(b.top, `${sel} under the top bar`).toBeGreaterThanOrEqual((await hudBottom(page)) - 0.5);
  expect(b.bottom, `${sel} over the tab bar`).toBeLessThanOrEqual((await navTop(page)) - fade + 0.5);
  expect(b.left).toBeGreaterThanOrEqual(-0.5);
  expect(b.right).toBeLessThanOrEqual(page.viewportSize()!.width + 0.5);
  expect(b.covered, `${sel} not covered`).toBe('');
  return b;
}
/** Whole inside its window's card (a popup lies over the bars on a short screen). */
async function wholeInWindow(page: Page, sel: string, card: string): Promise<Box> {
  const b = await box(page, sel);
  const c = await box(page, card);
  expect(b.top, `${sel} inside its window`).toBeGreaterThanOrEqual(Math.max(0, c.top) - 0.5);
  expect(b.bottom, `${sel} inside its window`).toBeLessThanOrEqual(Math.min(page.viewportSize()!.height, c.bottom) + 0.5);
  expect(b.left).toBeGreaterThanOrEqual(c.left - 0.5);
  expect(b.right).toBeLessThanOrEqual(c.right + 0.5);
  expect(b.covered, `${sel} not covered`).toBe('');
  return b;
}
const upperTwoThirds = (page: Page, b: Box, what: string) => expect(b.bottom, `${what} out of the lower third`).toBeLessThanOrEqual((page.viewportSize()!.height * 2) / 3 + 0.5);
/** Every list and page of the screen at its start (a player opens it, nothing scrolled); the lines of a chat open on the newest (UB-10). */
const scrollsAtStart = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.sheet:not([hidden]) *, .overlay:not([hidden]) *')].filter((e) => e.scrollTop > 0 && !e.matches('.chat-lines')).map((e) => `${e.className} ${e.scrollTop}`),
  );

async function start(page: Page, patch: Record<string, unknown> = {}): Promise<void> {
  await seedSave(page, { ...FRAMES_SAVE, upgrades: { ...FRAMES_SAVE.upgrades, helper_sell: 1 }, ...patch });
  await open(page);
  // A game second (the market brings its lots), then game time stands: no buyer or market refresh moves a list under the measure.
  type T = { __TEST__: { runSim(s: number): number; setTimeScale(k: number): void } };
  await page.evaluate(() => {
    (window as unknown as T).__TEST__.runSim(1);
    (window as unknown as T).__TEST__.setTimeScale(0);
  });
}
const settle = async (page: Page) => {
  await page.waitForFunction(() => !document.querySelector('.toast'), null, { timeout: 8000 }).catch(() => undefined);
  await page.waitForTimeout(300);
};

for (const size of [PANEL, PHONE]) {
  const tag = `${size.width}x${size.height}`;
  test.describe(tag, () => {
    test.use({ viewport: size, isMobile: true, hasTouch: true });

    test(`W-01 the lot: «рынок N · ниже рынка» and «Заберу сейчас» whole, no scroll @ ${tag}`, async ({ page }) => {
      const errors = collectErrors(page);
      await start(page);
      await OPENERS['detail:lot']!(page);
      await settle(page);
      expect(await scrollsAtStart(page)).toEqual([]);
      await wholeOnScreen(page, '[data-detail=lot] .lot-pet .mu-meta');
      await wholeOnScreen(page, '[data-detail=lot] .lot-pet .mu-name');
      await wholeOnScreen(page, '[data-detail=lot] .lot-buttons .mu-btn.main');
      expect(errors).toEqual([]);
    });

    test(`W-02 the move: what starts over and what stays stand whole before «Переехать» @ ${tag}`, async ({ page }) => {
      const errors = collectErrors(page);
      await start(page);
      await OPENERS['overlay:rebirth']!(page);
      await settle(page);
      const card = '[data-overlay=rebirth] > .card';
      expect(await page.locator(card).evaluate((e) => e.scrollTop)).toBe(0);
      const reset = await wholeInWindow(page, '[data-rebirth-reset]', card);
      const keep = await wholeInWindow(page, '[data-rebirth-keep]', card);
      const move = await wholeInWindow(page, '[data-action=rebirth-move]', card);
      await wholeInWindow(page, '[data-action=rebirth-later]', card);
      expect(reset.bottom).toBeLessThanOrEqual(keep.top + 0.5);
      expect(keep.bottom, 'the losses are read before the button').toBeLessThanOrEqual(move.top + 0.5);
      upperTwoThirds(page, move, '«Переехать»');
      expect(errors).toEqual([]);
    });

    test(`W-09 «▶ Реклама: яйцо» out of the lower third, whole @ ${tag}`, async ({ page }) => {
      const errors = collectErrors(page);
      await start(page);
      await page.locator('[data-tab=eggs]').click();
      await settle(page);
      const ad = await wholeOnScreen(page, '[data-sheet=eggs] [data-action^=ad-egg-]', FADE);
      upperTwoThirds(page, ad, '«▶ Реклама: яйцо»');
      // «Покормить» of «Мои яйца» is still in sight under it.
      await wholeOnScreen(page, '[data-sheet=eggs] [data-section=my] .mu-btn', FADE);
      expect(errors).toEqual([]);
    });

    test(`W-10 «Продать сразу» is a secondary button out of the lower third @ ${tag}`, async ({ page }) => {
      const errors = collectErrors(page);
      await start(page);
      await OPENERS['overlay:hatch']!(page);
      const sell = page.locator('[data-overlay=hatch] [data-action=hatch-sell]');
      await expect(sell).toBeVisible();
      const look = await sell.evaluate((e: HTMLElement) => {
        const cs = getComputedStyle(e);
        return { bg: cs.backgroundColor, h: e.offsetHeight, radius: parseFloat(cs.borderTopLeftRadius) };
      });
      expect(look.bg, 'a button, not a line of text').not.toBe('rgba(0, 0, 0, 0)');
      expect(look.h).toBeGreaterThanOrEqual(44);
      expect(look.radius).toBeGreaterThan(0);
      const b = await wholeInWindow(page, '[data-overlay=hatch] [data-action=hatch-sell]', '[data-overlay=hatch] > .card');
      upperTwoThirds(page, b, '«Продать сразу»');
      expect(errors).toEqual([]);
    });

    test(`W-07 «Подарки»: «Забрать подарок дня» and the boost whole over the tab bar @ ${tag}`, async ({ page }) => {
      const errors = collectErrors(page);
      await start(page);
      await OPENERS['overlay:gifts']!(page);
      await settle(page);
      expect(await scrollsAtStart(page)).toEqual([]);
      await wholeOnScreen(page, '[data-overlay=gifts] [data-action=gift-daily]', FADE);
      if (size === PHONE) await wholeOnScreen(page, '[data-overlay=gifts] [data-action=ad-boost]', FADE);
      expect(errors).toEqual([]);
    });
  });
}

test.describe('815x290 (a browser with its panel)', () => {
  test.use({ viewport: PANEL, isMobile: true, hasTouch: true });

  test('W-03 «Рынок»: two rows of lots whole, the ad row takes none', async ({ page }) => {
    const errors = collectErrors(page);
    await start(page);
    await page.locator('[data-tab=market]').click();
    await settle(page);
    const nav = await navTop(page);
    const rows = await page.evaluate((limit) => {
      const tops = [...document.querySelectorAll<HTMLElement>('[data-sheet=market] .card-lot')].map((e) => e.getBoundingClientRect()).filter((r) => r.bottom <= limit + 0.5).map((r) => Math.round(r.top));
      return new Set(tops).size;
    }, nav - FADE);
    expect(rows).toBeGreaterThanOrEqual(2);
    expect(errors).toEqual([]);
  });

  test('W-04 «Продажи» with three buyers writing: «Мои продажи» in sight', async ({ page }) => {
    const errors = collectErrors(page);
    // Two hours away with a helper: buyers wrote about the pets of the shelf.
    await start(page, { savedAt: Date.now() - 2 * 3600 * 1000 });
    await closeAll(page);
    await page.locator('[data-tab=sales]').click();
    await settle(page);
    const chats = await page.locator('[data-sheet=sales] [data-action^=sale-chat-]:not([data-action^=sale-chat-pic-])').count();
    expect(chats).toBeGreaterThanOrEqual(3);
    await wholeOnScreen(page, '[data-sheet=sales] .mu-head.sales-places');
    await wholeOnScreen(page, '[data-sheet=sales] .mu-head.sales-places + .mu-grid > :first-child', FADE);
    expect(errors).toEqual([]);
  });

  for (const hint of [false, true]) {
    test(`W-05 «Склад → Коллекция»: two rows of pets whole${hint ? ', the hint over the tab bar on' : ''}`, async ({ page }) => {
      const errors = collectErrors(page);
      // With the hint: the shelf is empty and pets wait in the storage — after 8 s idle «Выставь» points at «Продажи».
      await start(page, hint ? { showcase: [] } : {});
      await page.locator('[data-tab=inventory]').click();
      await page.locator('[data-sheet=inventory] .subtab[data-sub=collection]').click();
      if (hint) await expect(page.locator('.hint [data-hint-text]')).toBeVisible({ timeout: 15_000 });
      await settle(page);
      // The band of the hint (only while it is on) ends the list; with it the second row shows its pictures and names whole.
      const band = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('[data-sheet=inventory]')!).paddingBottom) || 0);
      if (hint) expect(band).toBeGreaterThan(0);
      else expect(band).toBe(0);
      const limit = (await navTop(page)) - (hint ? 0 : FADE) - band;
      const rows = await page.evaluate(
        ([lim, part]) => {
          const tops = [...document.querySelectorAll<HTMLElement>('[data-sheet=inventory] .col-row .mu-card')]
            .map((e) => ({ card: e.getBoundingClientRect(), name: (e.querySelector('.mu-name') ?? e).getBoundingClientRect() }))
            .filter((r) => r.card.height > 0 && (part ? r.name.bottom : r.card.bottom) <= lim + 0.5)
            .map((r) => Math.round(r.card.top));
          return new Set(tops).size;
        },
        [limit, hint ? 1 : 0] as const,
      );
      expect(rows).toBeGreaterThanOrEqual(2);
      expect(errors).toEqual([]);
    });
  }

  test('W-06 «Находки»: «Забрать» of the second row over the tab bar', async ({ page }) => {
    const errors = collectErrors(page);
    await start(page);
    await page.locator('[data-tab=inventory]').click();
    await page.locator('[data-sheet=inventory] .subtab[data-sub=finds]').click();
    await settle(page);
    const takes = page.locator('[data-sheet=inventory] [data-action^=find-take-]');
    expect(await takes.count()).toBeGreaterThanOrEqual(3);
    const tops = await takes.evaluateAll((els) => [...new Set(els.map((e) => Math.round(e.getBoundingClientRect().top)))].sort((a, b) => a - b));
    const second = tops[1]!;
    const id = await takes.evaluateAll((els, t) => els.find((e) => Math.round(e.getBoundingClientRect().top) === t)!.getAttribute('data-action'), second);
    await wholeOnScreen(page, `[data-action="${id}"]`, FADE);
    expect(errors).toEqual([]);
  });

  test('W-11 «Цена»: «Выставить на продажу» whole over the tab bar', async ({ page }) => {
    const errors = collectErrors(page);
    await start(page);
    await OPENERS['detail:sale']!(page);
    await page.locator('[data-detail=sale] [data-action^=sale-list-]').first().click();
    await settle(page);
    expect(await scrollsAtStart(page)).toEqual([]);
    await wholeOnScreen(page, '[data-detail=sale] [data-action^=sale-go-]');
    expect(errors).toEqual([]);
  });

  test('W-12 the wandering merchant: both offers and ✕ in sight', async ({ page }) => {
    test.setTimeout(180_000);
    const errors = collectErrors(page);
    await seedSave(page, { ...FRAMES_SAVE });
    await open(page);
    await OPENERS['overlay:merchant']!(page);
    await page.waitForTimeout(300);
    const card = '[data-overlay=merchant] > .card';
    for (const sel of ['[data-action=merchant-discount]', '[data-action=merchant-mystery]', '[data-offer=discount] [data-name]', '[data-offer=mystery] [data-name]', '.win-x', '[data-action=merchant-close]'])
      await wholeInWindow(page, `[data-overlay=merchant] ${sel}`, card);
    expect(errors).toEqual([]);
  });

  test('W-08 a dome and a place of the shelf: one target under a finger', async ({ page }) => {
    const errors = collectErrors(page);
    await start(page);
    // The middle of each place and of each dome answers with its own thing (src/test-api targets; the circles in tests/shop-layout.test.ts).
    type T = { __TEST__: { targets(): { incubators: Array<{ x: number; y: number }>; slots: Array<{ x: number; y: number }> } } };
    const t = await page.evaluate(() => (window as unknown as T).__TEST__.targets());
    const lowestSlot = Math.max(...t.slots.map((s) => s.y));
    for (const i of t.incubators) expect(i.y).toBeGreaterThan(lowestSlot + 22);
    expect(errors).toEqual([]);
  });
});

test.describe('1280x720 (a computer)', () => {
  test('W-13 the winged teapot toast keeps off the clock and never takes its tap', async ({ page }) => {
    const errors = collectErrors(page);
    await seedSave(page, { coins: 50, creatures: [{ uid: 'k1', species: 'kettle', level: 1, fed: 0, hatchedAt: 0, age: 0 }], showcase: ['k1'] });
    await open(page);
    await page.evaluate(() => (window as unknown as { __TEST__: { setTimeScale(k: number): void } }).__TEST__.setTimeScale(0));
    type Pt = { x: number; y: number };
    const t = await page.evaluate(() => (window as unknown as { __TEST__: { targets(): { things: { window: Pt | null; clock: Pt } } } }).__TEST__.targets());
    const tTeapot = await page.evaluate(() => (window as unknown as { __TEST__: { t(k: string): string } }).__TEST__.t('secret.window.teapot'));
    for (let i = 0; i < 15; i++) await page.mouse.click(t.things.window!.x, t.things.window!.y);
    const toast = page.locator('.toast', { hasText: tTeapot });
    await expect(toast).toBeVisible();
    await page.waitForTimeout(250);
    const b = (await toast.boundingBox())!;
    const c = t.things.clock;
    const r = 24;
    const meets = b.x < c.x + r && b.x + b.width > c.x - r && b.y < c.y + r && b.y + b.height > c.y - r;
    expect(meets, 'the toast lies on the clock').toBe(false);
    // The clock still answers while the toast is on.
    const taps = async () => ((await state(page)) as unknown as { sounds: Record<string, number> }).sounds.tap ?? 0;
    const before = await taps();
    await page.mouse.click(c.x, c.y);
    await expect(toast).toBeVisible();
    await expect.poll(taps).toBeGreaterThan(before);
    expect(errors).toEqual([]);
  });

  test('W-14 a press on «Продать за» that began before a new line of the buyer still sells', async ({ page }) => {
    const errors = collectErrors(page);
    await seedSave(page, { ...FRAMES_SAVE, savedAt: Date.now() - 2 * 3600 * 1000, upgrades: { ...FRAMES_SAVE.upgrades, helper_sell: 1 } });
    await open(page);
    await closeAll(page);
    type S = { stats: { deals: number } };
    await page.locator('[data-tab=chats]').click();
    const sell = page.locator('[data-sheet=chats] [data-action=chat-sell]');
    await expect(sell).toBeVisible();
    // The first tap 0.6 s after the chat opens sells.
    await page.waitForTimeout(600);
    const before = ((await state(page)) as unknown as S).stats.deals;
    await sell.click();
    await expect.poll(async () => ((await state(page)) as unknown as S).stats.deals).toBe(before + 1);
    // A finger down on «Продать за» of the next chat, the chat re-draws its lines (a new line, its seconds) — the release still sells.
    await page.locator('[data-sheet=chats] .chat-row:not(.closed)').first().click();
    await expect(sell).toBeVisible();
    const b = (await sell.boundingBox())!;
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.evaluate(() => (window as unknown as { __TEST__: { runSim(s: number): number } }).__TEST__.runSim(3));
    await page.waitForTimeout(200);
    await page.mouse.up();
    await expect.poll(async () => ((await state(page)) as unknown as S).stats.deals).toBe(before + 2);
    expect(errors).toEqual([]);
  });
});
