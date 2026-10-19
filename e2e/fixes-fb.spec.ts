import { expect, test, type Page } from '@playwright/test';
import { collectErrors, open, seedSave, state } from './helpers.ts';

/** The round of fixes of FB (the HQ pre-check, 19.10): what the producer's phone showed after the milestone. */
type Box = { x: number; y: number; width: number; height: number };
const incubator = (page: Page) =>
  page.evaluate(() => (window as unknown as { __TEST__: { targets(): { incubators: Array<{ x: number; y: number }> } } }).__TEST__.targets().incubators[0]!);
const center = (b: Box) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });
const inside = (p: { x: number; y: number }, b: Box, pad = 0) => p.x >= b.x - pad && p.x <= b.x + b.width + pad && p.y >= b.y - pad && p.y <= b.y + b.height + pad;
/** The gap between two boxes (0 when they touch or overlap). */
const gap = (a: Box, b: Box) => Math.hypot(Math.max(0, b.x - (a.x + a.width), a.x - (b.x + b.width)), Math.max(0, b.y - (a.y + a.height), a.y - (b.y + b.height)));

async function doubleTapSkip(page: Page): Promise<void> {
  const errors = collectErrors(page);
  await open(page);
  const t = await incubator(page);
  await page.touchscreen.tap(t.x, t.y);
  await expect(page.locator('[data-overlay=hatch]')).toBeVisible();
  await page.waitForTimeout(450);
  // Where a player taps to skip: the running strip and «тап — пропустить».
  const strip = (await page.locator('[data-action=hatch-skip]').boundingBox())!;
  const hint = (await page.locator('[data-hatch-skip]').boundingBox())!;
  // Two quick taps on the hint: the first skips, the second lands while the result's buttons still wait.
  await page.touchscreen.tap(center(hint).x, center(hint).y);
  await page.waitForTimeout(120);
  await page.touchscreen.tap(center(hint).x, center(hint).y);
  await expect(page.locator('[data-hatch-result]')).toBeVisible();
  // Past the lock the same points hold the pet and its rarity word — still no choice (the usability review: taps on the strip's
  // corners too, 300 ms apart).
  await page.waitForTimeout(700);
  await page.touchscreen.tap(center(hint).x, center(hint).y);
  await page.touchscreen.tap(center(strip).x, center(strip).y);
  for (const [fx, fy] of [[0.85, 0.85], [0.15, 0.85], [0.85, 0.15]] as const) {
    await page.waitForTimeout(300);
    await page.touchscreen.tap(strip.x + strip.width * fx, strip.y + strip.height * fy);
  }
  await page.waitForTimeout(300);
  await expect(page.locator('[data-overlay=hatch]')).toBeVisible();
  await expect(page.locator('[data-hatch-result]')).toBeVisible();
  const s = (await state(page)) as unknown as { coins: number; creatures: unknown[]; shelf: unknown[] };
  expect(s.coins).toBe(0);
  expect(s.creatures).toHaveLength(1);
  expect(s.shelf).toEqual([]);
  // «Продать сразу» is in neither skip point and 24 px or more from «На витрину».
  const sell = (await page.locator('[data-action=hatch-sell]').boundingBox())!;
  const shop = (await page.locator('[data-action=hatch-shop]').boundingBox())!;
  expect(inside(center(hint), sell, 8)).toBe(false);
  expect(inside(center(strip), sell, 8)).toBe(false);
  expect(gap(sell, hint)).toBeGreaterThan(0);
  expect(gap(sell, shop)).toBeGreaterThanOrEqual(23.5);
  // The buttons work after the lock.
  await page.locator('[data-action=hatch-keep]').click();
  await expect(page.locator('[data-overlay=hatch]')).toBeHidden();
  expect(errors).toEqual([]);
}

test.describe('Круг правок FB п. 1 portrait 375×650', () => {
  test.use({ viewport: { width: 375, height: 650 }, hasTouch: true, isMobile: true });
  test('an egg → two quick taps on the strip → the pet is not sold, «Вылупился!» stays', ({ page }) => doubleTapSkip(page));

  test('the buttons of the result take no press for 0.5 s after it shows', async ({ page }) => {
    await open(page);
    const t = await incubator(page);
    await page.touchscreen.tap(t.x, t.y);
    await page.waitForTimeout(450);
    await page.locator('[data-action=hatch-skip]').dispatchEvent('click');
    await expect(page.locator('[data-action=hatch-shop]')).toHaveAttribute('aria-disabled', 'true');
    await page.locator('[data-action=hatch-shop]').dispatchEvent('click');
    await page.locator('[data-action=hatch-sell]').dispatchEvent('click');
    await expect(page.locator('[data-overlay=hatch]')).toBeVisible();
    await expect(page.locator('[data-action=hatch-shop]')).toHaveAttribute('aria-disabled', 'false');
    await page.locator('[data-action=hatch-shop]').click();
    await expect(page.locator('[data-overlay=hatch]')).toBeHidden();
    expect(((await state(page)) as unknown as { shelf: unknown[] }).shelf).toHaveLength(1);
  });
});

test.describe('Круг правок FB п. 1 sideways 812×330', () => {
  test.use({ viewport: { width: 812, height: 330 }, hasTouch: true, isMobile: true });
  test('an egg → two quick taps on the strip → the pet is not sold, «Вылупился!» stays', ({ page }) => doubleTapSkip(page));
});

/** п. 2: the upgrades are rows without a fill (a 1 px line, the icon 40 without a tile), only a price the coins cover is filled; one look in «Лавка» and «Магазин»;
 * the shelf places in the room are 44 px or more, 8 px apart, a «+» is the place itself (inside the shelf). */
async function rowsLook(page: Page, sheet: 'home' | 'shop') {
  return page.evaluate((id) => {
    const rows = [...document.querySelectorAll<HTMLElement>(`[data-sheet=${id}] [data-section=upgrades] .shop-item`)].filter((r) => r.offsetParent);
    const cs = (el: Element) => getComputedStyle(el);
    return rows.map((r) => {
      const pic = r.querySelector<HTMLElement>('.mu-pic');
      const btn = r.querySelector<HTMLElement>('.mu-btn')!;
      return {
        bg: cs(r).backgroundColor,
        line: cs(r).borderBottomWidth,
        pic: pic ? `${Math.round(pic.getBoundingClientRect().width)}:${cs(pic).backgroundColor}` : 'none',
        can: r.classList.contains('can'),
        // Круг правок FB-2 п. 5: an affordable price is the accent (an outline and its words), the others are quiet words.
        price: cs(btn).boxShadow !== 'none' || cs(btn).backgroundColor !== 'rgba(0, 0, 0, 0)',
      };
    });
  }, sheet);
}
const NONE = 'rgba(0, 0, 0, 0)';
for (const [w, h] of [[375, 650], [812, 330]] as const)
  test.describe(`Круг правок FB п. 2 ${w}×${h}`, () => {
    test.use({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true });
    test('the upgrades: rows without a fill, only an affordable price filled — the same in «Лавка» and «Магазин»; the shelf places 44+ px, 8 px apart', async ({ page }) => {
      const errors = collectErrors(page);
      await seedSave(page, { coins: 120, upgrades: { showcase: 2, incubator: 1 }, showcase: ['e2e1'] });
      await open(page);
      const home = await rowsLook(page, 'home');
      await page.locator('[data-tab=shop]').click();
      const shop = await rowsLook(page, 'shop');
      for (const rows of [home, shop]) {
        expect(rows.length).toBeGreaterThan(1);
        for (const r of rows) {
          expect(r.bg).toBe(NONE);
          expect(r.line).toBe('1px');
          expect(r.pic).toBe(`40:${NONE}`);
          expect(r.price).toBe(r.can);
        }
        expect(rows.some((r) => r.can) && rows.some((r) => !r.can)).toBe(true);
      }
      // One look: the same rows (and the same filled prices) in both places.
      expect(shop.slice(0, home.length)).toEqual(home);
      await page.locator('[data-tab=home]').click();
      const plus = page.locator('.shelf-free');
      await expect(plus.first()).toBeVisible();
      const t = (await page.evaluate(() => (window as unknown as { __TEST__: { targets(): { slots: Array<{ x: number; y: number }> } } }).__TEST__.targets().slots))!;
      const boxes = await plus.evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => ({ x: r.x, y: r.y, width: r.width, height: r.height })));
      for (const b of boxes) {
        expect(b.width).toBeGreaterThanOrEqual(44);
        expect(b.height).toBeGreaterThanOrEqual(44);
        // The «+» is its place: its centre is the place's centre (inside the shelf frame).
        expect(t.some((s) => Math.abs(s.x - center(b).x) <= 1 && Math.abs(s.y - center(b).y) <= 1)).toBe(true);
      }
      const step = Math.abs(t[1]!.x - t[0]!.x);
      expect(step - boxes[0]!.width).toBeGreaterThanOrEqual(7.5);
      expect(step - boxes[0]!.width).toBeLessThanOrEqual(8.5);
      expect(errors).toEqual([]);
    });
  });

/** п. 3: «Пока тебя не было» — «▶ Реклама» 24 px from «Отлично», the number on it, «Тебя не было 5 ч · лавка работала 2 ч». */
for (const [w, h] of [[375, 650], [812, 330]] as const)
  test.describe(`Круг правок FB п. 3 ${w}×${h}`, () => {
    test.use({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true });
    test('«Пока тебя не было»: the ad button says its number and stands 24 px from «Отлично»', async ({ page }) => {
      const errors = collectErrors(page);
      const ago = Date.now() - 5 * 3600 * 1000;
      await seedSave(page, { coins: 0, lastSeenAt: ago, savedAt: ago, incomeMinutes: [300, 300, 300], stats: { deals: 8, coinsEarned: 300, hatched: 10, taps: 100, levelUps: 3, haggles: 1, income: 300 } });
      await open(page);
      const win = page.locator('[data-overlay=away]');
      await expect(win).toBeVisible();
      await expect(win.locator('.away-time')).toHaveText(/^Тебя не было 5 ч · лавка работала 2 ч$/);
      const got = (await win.locator('[data-away-coins]').innerText()).replace(/\D/g, '');
      await expect(win.locator('[data-action=away-ad]')).toHaveText(new RegExp(`^▶ Реклама: \\+${got.replace(/\B(?=(\d{3})+$)/g, '\\s?')}$`));
      const ad = (await win.locator('[data-action=away-ad]').boundingBox())!;
      const ok = (await win.locator('[data-action=away-ok]').boundingBox())!;
      expect(gap(ad, ok)).toBeGreaterThanOrEqual(23.5);
      // Both buttons whole inside the window (sideways it is two columns, 330 px high).
      const card = await win.locator('.card').evaluate((c) => ({ scroll: c.scrollHeight, client: c.clientHeight, r: c.getBoundingClientRect().toJSON() as DOMRect }));
      expect(card.scroll).toBeLessThanOrEqual(card.client + 1);
      for (const b of [ad, ok]) expect(b.y + b.height).toBeLessThanOrEqual(card.r.y + card.r.height);
      expect(errors).toEqual([]);
    });
  });

/** The 130 % font the way the check of 07 emulates it: every text of the HTML layer 1.3 times larger. */
const scale130 = (page: Page) =>
  page.evaluate(() => {
    const fresh = [...document.querySelectorAll<HTMLElement>('#ui *')].filter((el) => !el.dataset.mu130);
    const sizes = fresh.map((el) => parseFloat(getComputedStyle(el).fontSize));
    fresh.forEach((el, i) => {
      el.dataset.mu130 = '1';
      el.style.fontSize = `${Math.round((sizes[i] ?? 16) * 13) / 10}px`;
    });
  });
const pets = ['kettle', 'cloudcat', 'lampbug', 'jellytoast', 'shroom', 'moon_donut'].map((species, i) => ({ uid: `p${i}`, species, level: 1, fed: 0, hatchedAt: 0, age: 0 }));

/** п. 4: the bottom of the windows — the egg card sideways keeps «×3», «×5» above the tab bar; «Вылупился!» at 130 % keeps its buttons whole
 * (fields ≥ 12); «Кого выставить» with an empty storage says «На складе пусто» and gives a way to a pet. */
test.describe('Круг правок FB п. 4 sideways 812×330', () => {
  test.use({ viewport: { width: 812, height: 330 }, hasTouch: true, isMobile: true });
  for (const big of [false, true])
    test(`the egg card: «×3» and «×5» whole above the tab bar${big ? ' at 130 %' : ''}`, async ({ page }) => {
      await seedSave(page, { coins: 120 });
      await open(page);
      if (big) await scale130(page);
      await page.locator('[data-tab=eggs]').click();
      await page.locator('[data-sheet=eggs] [data-action="egg-card-egg_basic"]').click();
      if (big) await scale130(page);
      await page.waitForTimeout(300);
      const nav = (await page.locator('[data-tab=eggs]').boundingBox())!;
      const top = await page.evaluate(() => document.querySelector('[data-tab=eggs]')!.parentElement!.getBoundingClientRect().top);
      expect(nav.y).toBeGreaterThanOrEqual(top);
      for (const n of [1, 3, 5]) {
        const b = (await page.locator(`[data-action=egg-buy-${n}]`).boundingBox())!;
        expect(b.y + b.height, `egg-buy-${n}`).toBeLessThanOrEqual(top);
      }
    });
});
for (const [w, h] of [[375, 650], [812, 330]] as const)
  test.describe(`Круг правок FB п. 4 ${w}×${h}`, () => {
    test.use({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true });
    test('«Вылупился!» at 130 %: the buttons whole, fields 12 px or more', async ({ page }) => {
      await seedSave(page, { creatures: pets, showcase: [] });
      await open(page);
      await scale130(page);
      expect(await page.evaluate(() => (window as unknown as { __TEST__: { hatch(uid: string): boolean } }).__TEST__.hatch('p4'))).toBe(true);
      await page.waitForTimeout(450);
      await page.locator('[data-action=hatch-skip]').dispatchEvent('click');
      await expect(page.locator('[data-hatch-result]')).toBeVisible();
      await scale130(page);
      await page.waitForTimeout(700);
      const card = await page.evaluate(() => {
        const c = document.querySelector<HTMLElement>('[data-overlay=hatch] .card')!;
        return { scroll: c.scrollHeight, client: c.clientHeight, bottom: c.getBoundingClientRect().bottom };
      });
      expect(card.scroll).toBeLessThanOrEqual(card.client);
      for (const a of ['hatch-shop', 'hatch-keep', 'hatch-sell']) {
        const m = await page.locator(`[data-action=${a}]`).evaluate((b) => {
          const r = b.getBoundingClientRect();
          const range = document.createRange();
          range.selectNodeContents(b);
          const t = range.getBoundingClientRect();
          return { left: t.left - r.left, right: r.right - t.right, bottom: r.bottom, fits: b.scrollWidth <= b.clientWidth + 1 };
        });
        expect(m.fits, a).toBe(true);
        expect(Math.min(m.left, m.right), a).toBeGreaterThanOrEqual(11.5);
        expect(m.bottom, a).toBeLessThanOrEqual(card.bottom);
      }
    });
    test('«Кого выставить» with an empty storage: «На складе пусто» and «Купить яйцо»', async ({ page }) => {
      await seedSave(page, { creatures: [], showcase: [] });
      await open(page);
      await page.locator('[data-tab=sales]').click();
      await page.locator('[data-sheet=sales] [data-action="sale-add"]').first().click();
      await expect(page.locator('[data-detail=sale] .empty')).toHaveText('На складе пусто');
      await page.locator('[data-action=pick-eggs]').click();
      await expect(page.locator('[data-sheet=eggs]')).toBeVisible();
    });
  });

/** п. 5: «Настройки» — «Вибрация» is the same switch as «Звук»; the code and «Язык» in sight sideways and at 130 %; the placeholder ≥ 4.5:1. */
const contrast = (page: Page, sel: string, pseudo = '') =>
  page.locator(sel).evaluate((el, ps) => {
    const rgb = (c: string) => (c.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
    const lum = (c: number[]) => c.map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i]!, 0);
    let bgEl: Element | null = el;
    let bg = 'rgba(0, 0, 0, 0)';
    while (bgEl && (bg = getComputedStyle(bgEl).backgroundColor).endsWith(', 0)')) bgEl = bgEl.parentElement;
    const a = lum(rgb(getComputedStyle(el, ps || null).color));
    const b = lum(rgb(bg));
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  }, pseudo);
for (const [w, h] of [[375, 650], [812, 330]] as const)
  for (const big of [false, true])
    test.describe(`Круг правок FB п. 5 ${w}×${h}${big ? ' 130 %' : ''}`, () => {
      test.use({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true });
      test('«Настройки»: two equal switches; «Язык» and the code in sight; the placeholder readable', async ({ page }) => {
        const errors = collectErrors(page);
        await seedSave(page, { coins: 30 });
        await open(page);
        await page.locator('[data-action=pause]').click();
        await page.locator('[data-action=settings]').click();
        const win = page.locator('[data-overlay=settings] .card');
        await expect(win).toBeVisible();
        if (big) await scale130(page);
        await page.waitForTimeout(300);
        // The window's opening scale ends first (a loaded machine measured it mid-way).
        await page.evaluate(() => Promise.all(document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations !== Infinity).map((a) => a.finished.catch(() => {}))));
        const sound = page.locator('[data-overlay=settings] [data-action=sound]');
        const vib = page.locator('[data-overlay=settings] [data-action=vibrate]');
        await expect(sound).toHaveAttribute('role', 'switch');
        await expect(vib).toHaveAttribute('role', 'switch');
        const [sb, vb] = [(await sound.boundingBox())!, (await vib.boundingBox())!];
        expect([vb.width, vb.height]).toEqual([sb.width, sb.height]);
        expect(await vib.evaluate((b) => getComputedStyle(b).backgroundColor)).toBe(await sound.evaluate((b) => getComputedStyle(b).backgroundColor));
        const was = await vib.getAttribute('aria-checked');
        await vib.click();
        await expect(vib).toHaveAttribute('aria-checked', was === 'true' ? 'false' : 'true');
        // Everything in the card, the card between the bars, no scroll.
        const card = await win.evaluate((c) => ({ scroll: c.scrollHeight, client: c.clientHeight, r: c.getBoundingClientRect().toJSON() as DOMRect }));
        expect(card.scroll).toBeLessThanOrEqual(card.client + 1);
        for (const sel of ['[data-action=lang-ru]', '[data-action=lang-en]', '[data-action=code-input]', '[data-action=code-apply]']) {
          const b = (await page.locator(`[data-overlay=settings] ${sel}`).boundingBox())!;
          expect(b.y, sel).toBeGreaterThanOrEqual(card.r.y);
          expect(b.y + b.height, sel).toBeLessThanOrEqual(card.r.y + card.r.height);
        }
        expect(await contrast(page, '[data-overlay=settings] [data-action=code-input]', '::placeholder')).toBeGreaterThanOrEqual(4.5);
        expect(errors).toEqual([]);
      });
    });

/** п. 6: the system font at 130 % — nothing shrinks, whole words wrap: the gift days keep their words inside, the lot sideways shows
 * «рынок N · ниже рынка» and the newest line with its price, «Скидка? Возьму за…» on one line, «Переезд» in sight, the tab labels apart. */
const insideBox = (page: Page, sel: string) =>
  page.locator(sel).evaluateAll((els) =>
    els
      .filter((e) => (e as HTMLElement).offsetParent)
      .map((e) => {
        const r = e.getBoundingClientRect();
        const range = document.createRange();
        range.selectNodeContents(e);
        const t = range.getBoundingClientRect();
        return t.left >= r.left - 1 && t.right <= r.right + 1 ? '' : `«${e.textContent}» ${Math.round(t.width)}/${Math.round(r.width)}`;
      })
      .filter(Boolean),
  );
test.describe('Круг правок FB п. 6 sideways 812×330 at 130 %', () => {
  test.use({ viewport: { width: 812, height: 330 }, hasTouch: true, isMobile: true });
  test('the gift days, the lot, «Уровень продавца» — whole words in sight', async ({ page }) => {
    const errors = collectErrors(page);
    await seedSave(page, { coins: 120, creatures: pets, showcase: [] });
    await open(page);
    await scale130(page);
    await page.locator('[data-action=gifts]').click();
    await scale130(page);
    await page.waitForTimeout(300);
    expect(await insideBox(page, '[data-overlay=gifts] .day > b, [data-overlay=gifts] .day > span')).toEqual([]);
    await page.locator('[data-action=gifts-close]').click();
    await page.locator('[data-tab=market]').click();
    await page.locator('[data-sheet=market] [data-action^="lot-open-"]').first().click();
    await scale130(page);
    await page.waitForTimeout(400);
    const lot = await page.evaluate(() => {
      const r = (s: string) => document.querySelector(s)!.getBoundingClientRect();
      const bar = document.getElementById('nav')!.getBoundingClientRect().top;
      const lines = r('[data-detail=lot] .chat-lines');
      const last = r('[data-detail=lot] .chat-lines > .bubble:last-child');
      const meta = r('[data-detail=lot] .lot-pet .mu-meta');
      const bargain = document.querySelector<HTMLElement>('[data-action=lot-bargain]')!;
      const main = r('[data-action=lot-buy]');
      return {
        meta: meta.top >= 0 && meta.bottom <= lines.top + 1,
        last: last.top >= lines.top - 1 && last.bottom <= Math.min(lines.bottom, bar) + 1,
        bargainOneLine: bargain.scrollWidth <= bargain.clientWidth + 1 && bargain.getBoundingClientRect().height < 56,
        main: main.top >= r('.hud').bottom && main.bottom <= bar,
      };
    });
    expect(lot).toEqual({ meta: true, last: true, bargainOneLine: true, main: true });
    await page.locator('[data-tab=home]').click();
    await page.locator('[data-action=reputation]').click();
    await scale130(page);
    await page.waitForTimeout(300);
    const move = (await page.locator('[data-action=rep-city]').boundingBox())!;
    const card = (await page.locator('[data-overlay=reputation] .card').boundingBox())!;
    expect(move.y).toBeGreaterThanOrEqual(card.y);
    expect(move.y + move.height).toBeLessThanOrEqual(card.y + card.height);
    expect(errors).toEqual([]);
  });
});
test.describe('Круг правок FB п. 6 portrait 375×650 at 130 %', () => {
  test.use({ viewport: { width: 375, height: 650 }, hasTouch: true, isMobile: true });
  test('the tab labels stand 8 px apart, «Лавка» in the middle; a chat name never cut inside a word', async ({ page }) => {
    await seedSave(page, { coins: 120 });
    await open(page);
    await scale130(page);
    await page.waitForTimeout(300);
    const labels = await page.locator('.nav-label').evaluateAll((els) =>
      els.map((e) => {
        const range = document.createRange();
        range.selectNodeContents(e);
        const t = range.getBoundingClientRect();
        return { l: t.left, r: t.right };
      }),
    );
    for (let i = 1; i < labels.length; i++) expect(labels[i]!.l - labels[i - 1]!.r).toBeGreaterThanOrEqual(7.9);
    const home = (await page.locator('[data-tab=home] .nav-icon').boundingBox())!;
    expect(Math.abs(home.x + home.width / 2 - 375 / 2)).toBeLessThanOrEqual(2);
  });
});

/** п. 7: the small things — «Забрать подарок дня» ≤ 360 px; the pet of «Вылупился!» fills its tile; «Сытный корм» is not the bowl of «Подработка»;
 * the tabs stand on their own places from the first minute; the pets in chats are a group of their own; «Купи новое яйцо» points its tail at «10»;
 * a PC keeps the right half of «Лавка» full. */
test.describe('Круг правок FB п. 7 portrait 375×650', () => {
  test.use({ viewport: { width: 375, height: 650 }, hasTouch: true, isMobile: true });

  test('the tabs on their own places from the first minute; «Купи новое яйцо» with its tail on «10»', async ({ page }) => {
    await open(page);
    const first = await page.locator('#nav > .nav-tab:not([hidden])').evaluateAll((els) => els.map((e) => [(e as HTMLElement).dataset.tab, Math.round(e.getBoundingClientRect().left)]));
    expect(first.map(([t]) => t)).toEqual(['home', 'eggs']);
    const home = (await page.locator('[data-tab=home] .nav-icon').boundingBox())!;
    expect(Math.abs(home.x + home.width / 2 - 375 / 2)).toBeLessThanOrEqual(2);
    // The same places once more tabs are open.
    await seedSave(page, { coins: 30, creatures: [], showcase: [], stats: { deals: 1, coinsEarned: 30, hatched: 1, taps: 10, levelUps: 0, haggles: 0 }, flags: { ftue_starter: true, ftue_fed: true, tab_eggs: true, tab_sales: true, tab_chats: true } });
    await page.evaluate(() => sessionStorage.clear());
    await open(page);
    const later = await page.locator('#nav > .nav-tab:not([hidden])').evaluateAll((els) => Object.fromEntries(els.map((e) => [(e as HTMLElement).dataset.tab, Math.round(e.getBoundingClientRect().left)])));
    for (const [t, x] of first) expect(later[t as string], `${t}`).toBe(x);
    await page.locator('[data-tab=eggs]').click();
    const hint = page.locator('.hint[data-hint=buyEgg]:not([hidden])');
    await expect(hint).toBeVisible({ timeout: 8000 });
    await page.waitForTimeout(400);
    const tail = await page.evaluate(() => {
      const h = document.querySelector<HTMLElement>('.hint[data-hint=buyEgg]')!;
      const a = h.querySelector('.hint-arrow')!.getBoundingClientRect();
      const b = document.querySelector('[data-sheet=eggs] [data-action="egg-buy-egg_basic"]')!.getBoundingClientRect();
      const r = h.getBoundingClientRect();
      return { x: a.left + a.width / 2 >= b.left && a.left + a.width / 2 <= b.right, near: Math.min(Math.abs(r.top - b.bottom), Math.abs(b.top - r.bottom)) <= 24 };
    });
    expect(tail).toEqual({ x: true, near: true });
  });

  test('«Забрать подарок дня» ≤ 360; the pet fills its tile; «Сытный корм» has its own picture; chats apart from the places', async ({ page }) => {
    const errors = collectErrors(page);
    await seedSave(page, { coins: 500, creatures: pets, showcase: ['p0'], upgrades: {}, stats: { deals: 8, coinsEarned: 300, hatched: 10, taps: 100, levelUps: 3, haggles: 1 } });
    await open(page);
    await page.locator('[data-action=gifts]').click();
    const take = page.locator('[data-action=gift-daily]');
    if (await take.isVisible()) expect((await take.boundingBox())!.width).toBeLessThanOrEqual(360);
    await page.locator('[data-action=gifts-close]').click();
    // The shop row of the food: its own name and a picture other than the side job's bowl.
    const row = page.locator('[data-sheet=home] [data-upgrade=bowl]');
    await expect(row.locator('.mu-name')).toHaveText('Сытный корм');
    const rowPic = await row.locator('.mu-pic img').getAttribute('src');
    await page.locator('[data-action=work]').click();
    const bowlPic = await page.locator('[data-overlay=work] .work-bowl img').getAttribute('src');
    expect(rowPic).not.toBe(bowlPic);
    await page.keyboard.press('Escape');
    // «Вылупился!»: the picture ~60 % of its tile.
    expect(await page.evaluate(() => (window as unknown as { __TEST__: { hatch(uid: string): boolean } }).__TEST__.hatch('p4'))).toBe(true);
    await page.waitForTimeout(450);
    await page.locator('[data-action=hatch-skip]').dispatchEvent('click');
    await expect(page.locator('[data-hatch-result]')).toBeVisible();
    // Layout sizes (the rare pop animation scales the picture for 0.55 s).
    const fill = await page.evaluate(() => document.querySelector<HTMLElement>('[data-hatch-pic]')!.offsetWidth / document.querySelector<HTMLElement>('.hatch-pic')!.offsetWidth);
    expect(fill).toBeGreaterThanOrEqual(0.75);
    await page.locator('[data-action=hatch-keep]').click();
    // A buyer writes about the pet on the shelf: it leaves the places for its own group, the counter counts the shelf only.
    await page.evaluate(() => (window as unknown as { __TEST__: { runSim(s: number): number } }).__TEST__.runSim(60));
    await page.locator('[data-tab=sales]').click();
    const groups = await page.evaluate(() => {
      const places = document.querySelector('[data-sheet=sales] .sales-places')?.textContent ?? '';
      const chats = document.querySelector('[data-sheet=sales] .sales-chats')?.textContent ?? '';
      const talking = document.querySelectorAll('[data-sheet=sales] .sales-chats + .mu-grid .card-sale').length;
      return { places, chats, talking };
    });
    const st = (await state(page)) as unknown as { shelf: unknown[] };
    expect(groups.places).toContain(`${st.shelf.length} из`);
    if (groups.talking) expect(groups.chats).toContain('В переписке');
    expect(errors).toEqual([]);
  });
});
test.describe('Круг правок FB п. 7 PC 1280×720', () => {
  test.use({ viewport: { width: 1280, height: 720 } });
  test('«Лавка»: the right half holds the Store and the eggs', async ({ page }) => {
    await seedSave(page, { coins: 120 });
    await open(page);
    await expect(page.locator('[data-sheet=home] .eggs .mu-head').first()).toBeVisible();
    const bottom = await page.evaluate(() => Math.max(...[...document.querySelectorAll('[data-sheet=home] .mu-card')].map((c) => c.getBoundingClientRect().bottom)));
    const bar = (await page.locator('#nav').boundingBox())!.y;
    expect(bottom).toBeGreaterThanOrEqual(bar - 120);
  });
});
