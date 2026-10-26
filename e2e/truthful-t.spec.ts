import { expect, test, type Page } from '@playwright/test';
import { closeHatch, collectErrors, open, seedSave, state } from './helpers.ts';
import { closeAll, FRAMES_SAVE, OPENERS } from './frames-shared.ts';

/**
 * T «Торговец и полка» (Ресейл 14): the live pass of the producer's phone sideways — a browser with its panel 815×290, a taller panel
 * 812×330 and the whole screen 880×405 — found what the shots without taps missed: a tap on the merchant's cart bought an egg, a window
 * with a price hid the balance, a tap on a dome of a two-row shelf opened «Кого выставить». Every check here taps like a finger.
 */
const PANEL = { width: 815, height: 290 };
const TALL = { width: 812, height: 330 };
const PHONE = { width: 880, height: 405 };
const SIZES = [PANEL, TALL, PHONE];
/** A finger: the half of a 44 px tap. */
const FINGER = 22;

type T = {
  __TEST__: {
    runSim(s: number): number;
    setTimeScale(k: number): void;
    event(id: string): boolean;
    targets(): { incubators: Array<{ x: number; y: number }>; eventThing: { x: number; y: number } | null } | null;
  };
};
const coins = async (page: Page) => (await state(page)).coins;

/** The balance of the top bar: whole on the screen, lit (not under a dim) and nothing over its middle. */
async function balanceInSight(page: Page, what: string): Promise<void> {
  const b = await page.evaluate(() => {
    const el = document.querySelector<HTMLElement>('.hud-coins')!;
    const r = el.getBoundingClientRect();
    // The top bar rests over a window (pointer-events: none); for the look-up the balance takes the finger, as painted.
    el.style.setProperty('pointer-events', 'auto', 'important');
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    el.style.removeProperty('pointer-events');
    let opacity = 1;
    for (let e: HTMLElement | null = el; e; e = e.parentElement) opacity *= parseFloat(getComputedStyle(e).opacity);
    return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, on: Boolean(hit && el.contains(hit)), what: hit ? (hit as HTMLElement).className : '', opacity };
  });
  expect(b.on, `${what}: the balance is not covered (${b.what})`).toBe(true);
  expect(b.top).toBeGreaterThanOrEqual(-0.5);
  expect(b.right).toBeLessThanOrEqual(page.viewportSize()!.width + 0.5);
  expect(b.opacity, `${what}: the balance is lit`).toBe(1);
  // Over a window the bar is see-through: the balance pill lies on no card of an open window.
  const meets = await page.evaluate(() => {
    const w = document.querySelector('.hud-wallet')!.getBoundingClientRect();
    return [...document.querySelectorAll<HTMLElement>('#ui > .overlay:not([hidden]) > .card')]
      .map((c) => c.getBoundingClientRect())
      .some((c) => c.left < w.right && c.right > w.left && c.top < w.bottom && c.bottom > w.top);
  });
  expect(meets, `${what}: the balance pill lies on the window`).toBe(false);
}

/** Waits for the merchant at the door (3 minutes of play), past the ad break those minutes bring; time then stands. */
async function merchantAtDoor(page: Page): Promise<{ x: number; y: number }> {
  await page.evaluate(() => (window as unknown as T).__TEST__.runSim(181));
  await expect.poll(() => page.evaluate(() => (window as unknown as T).__TEST__.event('merchant') || ((window as unknown as T).__TEST__.runSim(25), false)), { timeout: 60_000 }).toBe(true);
  await page.evaluate(() => (window as unknown as T).__TEST__.setTimeScale(0));
  // The ad break of those minutes (3 s on the mock) ends before the finger comes.
  await page.waitForTimeout(3500);
  await expect.poll(() => page.evaluate(() => Boolean((window as unknown as T).__TEST__.targets()?.eventThing))).toBe(true);
  return (await page.evaluate(() => (window as unknown as T).__TEST__.targets()!.eventThing))!;
}

type Box = { top: number; bottom: number; left: number; right: number; covered: string };
/** The box of the first visible match (no scrolling) and what a tap at its middle reaches if not itself. */
async function box(page: Page, sel: string): Promise<Box> {
  const b = await page.evaluate((q) => {
    const el = [...document.querySelectorAll<HTMLElement>(q)].find((e) => e.offsetParent !== null);
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
const upperTwoThirds = (page: Page, b: Box, what: string) => expect(b.bottom, `${what} out of the lower third`).toBeLessThanOrEqual((page.viewportSize()!.height * 2) / 3 + 0.5);
/** Whole over the tab bar (less the 14 px fade of a list sideways) and nothing on its middle. */
async function whole(page: Page, sel: string, fade = 14): Promise<Box> {
  const b = await box(page, sel);
  expect(b.bottom, `${sel} over the tab bar`).toBeLessThanOrEqual((await navTop(page)) - fade + 0.5);
  expect(b.covered, `${sel} not covered`).toBe('');
  return b;
}
async function rich(page: Page): Promise<void> {
  await seedSave(page, { ...FRAMES_SAVE, upgrades: { ...FRAMES_SAVE.upgrades, helper_sell: 1 } });
  await open(page);
  await page.evaluate(() => {
    (window as unknown as T).__TEST__.runSim(1);
    (window as unknown as T).__TEST__.setTimeScale(0);
  });
  await closeAll(page);
}

for (const size of SIZES) {
  const tag = `${size.width}x${size.height}`;
  test.describe(tag, () => {
    test.use({ viewport: size, isMobile: true, hasTouch: true });

    test(`T-01 a tap on the merchant's cart opens his window and buys nothing; no price button lies over the cart @ ${tag}`, async ({ page }) => {
      test.setTimeout(180_000);
      const errors = collectErrors(page);
      await seedSave(page, { ...FRAMES_SAVE });
      await open(page);
      const cart = await merchantAtDoor(page);
      const before = await coins(page);
      await page.touchscreen.tap(cart.x, cart.y);
      const win = page.locator('[data-overlay=merchant]');
      await expect(win).toBeVisible();
      // A press right after the window opened (the click of the opening tap) buys nothing.
      await page.evaluate(() => document.querySelector<HTMLElement>('[data-overlay=merchant] [data-action=merchant-mystery]')!.click());
      await page.waitForTimeout(500);
      await expect(win).toBeVisible();
      expect(await coins(page)).toBe(before);
      for (const sel of ['[data-action=merchant-discount]', '[data-action=merchant-mystery]']) {
        const b = (await win.locator(sel).boundingBox())!;
        const near = cart.x > b.x - FINGER && cart.x < b.x + b.width + FINGER && cart.y > b.y - FINGER && cart.y < b.y + b.height + FINGER;
        expect(near, `${sel} lies a finger away from the cart`).toBe(false);
      }
      await balanceInSight(page, 'the merchant');
      // Later a tap buys as before.
      await win.locator('[data-action=merchant-mystery]').click();
      await expect(win).toBeHidden();
      expect(await coins(page)).toBeLessThan(before);
      expect(errors).toEqual([]);
    });

    test(`T-02 every window with a price keeps the balance in sight @ ${tag}`, async ({ page }) => {
      test.setTimeout(120_000);
      const errors = collectErrors(page);
      await seedSave(page, { ...FRAMES_SAVE, upgrades: { ...FRAMES_SAVE.upgrades, helper_sell: 1 } });
      await open(page);
      await page.evaluate(() => {
        (window as unknown as T).__TEST__.runSim(1);
        (window as unknown as T).__TEST__.setTimeScale(0);
      });
      await closeAll(page);
      // «Лавка» sideways: the upgrades with their prices.
      await balanceInSight(page, '«Лавка»');
      for (const id of ['eggs', 'shop', 'market']) {
        await page.locator(`[data-tab=${id}]`).click();
        await page.waitForTimeout(300);
        await balanceInSight(page, `«${id}»`);
      }
      for (const w of ['detail:egg-card', 'detail:lot', 'overlay:hatch', 'overlay:gifts']) {
        await closeAll(page);
        await OPENERS[w]!(page);
        await page.waitForTimeout(400);
        await balanceInSight(page, w);
      }
      await closeAll(page);
      expect(errors).toEqual([]);
    });

    for (const places of [2, 5]) {
      const rows = places === 2 ? 1 : 2;
      test(`T-03 ${rows} row(s) of the shelf: a tap on each ready dome hatches, «Кого выставить» stays shut @ ${tag}`, async ({ page }) => {
        test.setTimeout(120_000);
        const errors = collectErrors(page);
        const ready = { egg: 'egg_basic', startedAt: 0, progress: 99, elapsed: 99, waiting: false, careFed: 3 };
        // upgrades.showcase 2 → 3 places in one row, 5 → 6 places in two rows (one pet, the other places are free «+»).
        await seedSave(page, { ...FRAMES_SAVE, incubators: [ready, ready, ready, ready], upgrades: { ...FRAMES_SAVE.upgrades, showcase: places, incubator: 3 } });
        await open(page);
        await page.evaluate(() => (window as unknown as T).__TEST__.setTimeScale(0));
        await closeAll(page);
        const domes = (await page.evaluate(() => (window as unknown as T).__TEST__.targets()!.incubators)).length;
        expect(domes).toBe(4);
        for (let i = 0; i < domes; i++) {
          const d = (await page.evaluate((k) => (window as unknown as T).__TEST__.targets()!.incubators[k]!, i))!;
          await page.touchscreen.tap(d.x, d.y);
          await expect(page.locator('[data-overlay=hatch]'), `dome ${i + 1} hatches`).toBeVisible();
          await expect(page.locator('[data-sheet=sales]')).toBeHidden();
          await closeHatch(page);
          await closeAll(page);
        }
        expect(errors).toEqual([]);
      });
    }
    test(`T-04 «Подарки»: «▶ Реклама: продажи ×1,5» whole and out of the lower third @ ${tag}`, async ({ page }) => {
      const errors = collectErrors(page);
      await rich(page);
      await OPENERS['overlay:gifts']!(page);
      await page.waitForTimeout(400);
      const ad = await whole(page, '[data-overlay=gifts] [data-action=ad-boost]');
      upperTwoThirds(page, ad, '«▶ Реклама: продажи ×1,5»');
      await whole(page, '[data-overlay=gifts] [data-action=gift-daily]');
      expect(errors).toEqual([]);
    });

    test(`T-07 «Яйца»: «Мои яйца» first, «▶ Реклама: яйцо» whole and out of the lower third @ ${tag}`, async ({ page }) => {
      const errors = collectErrors(page);
      await rich(page);
      await page.locator('[data-tab=eggs]').click();
      await page.waitForTimeout(400);
      const first = await page.evaluate(() => {
        const heads = [...document.querySelectorAll<HTMLElement>('[data-sheet=eggs] .eggs > [data-section]')].map((e) => ({ s: e.dataset.section, top: e.getBoundingClientRect().top }));
        return heads.sort((a, b) => a.top - b.top)[0]?.s;
      });
      expect(first).toBe('my');
      const ad = await whole(page, '[data-sheet=eggs] [data-action^=ad-egg-]');
      upperTwoThirds(page, ad, '«▶ Реклама: яйцо»');
      expect(errors).toEqual([]);
    });

    test(`T-08 the crystals in the top bar, the ✕ of «Подарки» clear of «+», the price lists 8 px over the tab bar @ ${tag}`, async ({ page }) => {
      const errors = collectErrors(page);
      await rich(page);
      const gems = await box(page, '.hud-gems');
      expect(await page.locator('.hud-gems b').textContent()).toBe('3');
      expect(gems.right).toBeLessThanOrEqual((await box(page, '.hud-coins')).left);
      for (const t of ['home', 'shop']) {
        await page.locator(`[data-tab=${t}]`).click();
        await page.waitForTimeout(300);
        const list = (await page.locator(`[data-sheet=${t}] > .sheet-body`).boundingBox())!;
        expect(list.y + list.height, `«${t}»: the list ends 8 px over the tab bar`).toBeLessThanOrEqual((await navTop(page)) - 8 + 0.5);
      }
      await OPENERS['overlay:gifts']!(page);
      const x = await box(page, '[data-overlay=gifts] [data-action=gifts-close]');
      const plus = await box(page, '.hud-plus');
      expect(x.top - plus.bottom, 'the ✕ 16 px under the «+»').toBeGreaterThanOrEqual(16 - 0.5);
      expect(errors).toEqual([]);
    });
  });
}

for (const size of [PANEL, TALL]) {
  const tag = `${size.width}x${size.height}`;
  test.describe(`${tag} egg card`, () => {
    test.use({ viewport: size, isMobile: true, hasTouch: true });
    test(`T-06 the egg card: «Что внутри» and the chances of the first pets in sight, no scroll @ ${tag}`, async ({ page }) => {
      const errors = collectErrors(page);
      await rich(page);
      await OPENERS['detail:egg-card']!(page);
      await page.waitForTimeout(400);
      expect(await page.locator('[data-detail=egg-card]').evaluate((e) => e.scrollTop)).toBe(0);
      await whole(page, '[data-detail=egg-card] .mu-head h3', 0);
      // The first row of pets with their chances «13% → 6,6%» whole over the fade of the list.
      const chances = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('[data-detail=egg-card] .card-odds .mu-meta')].slice(0, 2).map((e) => e.getBoundingClientRect().bottom),
      );
      expect(chances.length).toBe(2);
      const limit = (await navTop(page)) - 14;
      for (const b of chances) expect(b, 'a chance in sight').toBeLessThanOrEqual(limit + 0.5);
      expect(errors).toEqual([]);
    });
  });
}

for (const size of [PANEL, PHONE]) {
  const tag = `${size.width}x${size.height}`;
  test.describe(`${tag} first minute`, () => {
    test.use({ viewport: size, isMobile: true, hasTouch: true });
    test(`T-05 «Яйца» in the first minute: the green dot calls, the hint names the open step and lies on no button @ ${tag}`, async ({ page }) => {
      const errors = collectErrors(page);
      await open(page);
      await expect(page.locator('[data-tab=eggs] [data-badge]')).toBeVisible();
      await page.locator('[data-tab=eggs]').click();
      const hint = page.locator('[data-sheet=eggs] [data-eggs-hint]');
      await expect(hint).toBeVisible();
      // The first minute: no coins, the gift egg ready — the hint names «Забрать», the one button open, and frames it.
      expect(await hint.textContent()).toBe(await page.evaluate(() => (window as unknown as { __TEST__: { t(k: string): string } }).__TEST__.t('eggs.hintFree')));
      const named = page.locator('[data-sheet=eggs] .is-hinted');
      await expect(named).toHaveCount(1);
      expect(await named.getAttribute('data-action')).toMatch(/^egg-free-/);
      expect(await named.getAttribute('aria-disabled')).not.toBe('true');
      const h = (await hint.boundingBox())!;
      const buttons = await page.locator('[data-sheet=eggs] button').evaluateAll((els) => els.filter((e) => (e as HTMLElement).offsetParent !== null).map((e) => e.getBoundingClientRect()).map((r) => ({ x: r.x, y: r.y, w: r.width, h: r.height })));
      for (const b of buttons) expect(h.x < b.x + b.w && h.x + h.width > b.x && h.y < b.y + b.h && h.y + h.height > b.y, 'the hint lies on a button').toBe(false);
      await whole(page, '[data-sheet=eggs] [data-eggs-hint]', 0);
      expect(errors).toEqual([]);
    });
  });
}
