import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { collectErrors, open, seedSave, state } from './helpers.ts';
import { buttonsSeenWhole, closeAll, FRAMES_SAVE, OPENERS, walkEveryWindow } from './frames-shared.ts';

/**
 * PT-01 («Ресейл 21»): the phone upright in the VK and OK frame (build:vk-e2e on the bridge stand-in, ?mock=vk) — 405×880 (a phone
 * on the whole screen), 405×720 (a browser with its panel), 375×667 (a small phone). Every window and tab from the code: every button
 * seen whole, at least 44 px, none in the top 10 % (the app's own buttons and the status bar) or the bottom 24 px (the gesture bar);
 * a turn upright ↔ sideways keeps the game and its own layout. PT_SHOTS=1 saves the frames to docs/evidence/PT/screens/.
 */
const SIZES = [
  { width: 405, height: 880 },
  { width: 405, height: 720 },
  { width: 375, height: 667 },
];
const shotsDir = process.env.PT_SHOTS ? resolve(import.meta.dirname, '../docs/evidence/PT/screens') : null;
if (shotsDir) mkdirSync(shotsDir, { recursive: true });
const VK = '?mock=vk';
type T = { __TEST__: { setTimeScale(k: number): void } };
const shown = (page: Page, sel: string) => expect(page.locator(sel).first()).toBeVisible();
/** V-04: VK and OK — ☰ opens the start menu (no pause window); «Настройки» are in it. */
const VK_OPENERS: typeof OPENERS = {
  ...OPENERS,
  // The seeded save reaches the VK build through the local mirror with a fresh time: no «while you were away» — the frame is «Лавка».
  'overlay:away': async () => undefined,
  // V-04: no leaders and no review window on VK and OK.
  'overlay:leaders': async () => undefined,
  'overlay:rate': async () => undefined,
  'overlay:pause': async (page) => {
    await page.locator('.hud [data-action=menu]').click();
    await shown(page, '[data-overlay=menu]');
  },
  'overlay:settings': async (page) => {
    await VK_OPENERS['overlay:pause']!(page);
    await page.locator('[data-overlay=menu] [data-action=menu-settings]').click();
    await shown(page, '[data-overlay=settings]');
  },
};
/** The VK start menu stands over the game after the load: «Играть» closes it. */
async function play(page: Page) {
  const btn = page.locator('[data-action=menu-play]');
  if (await btn.isVisible().catch(() => false)) await btn.click();
}

/** Buttons of the screen now (the top window or the tab with the bars) under 44 px or in the host's top 10 % or the bottom 24 px. */
async function outOfReach(page: Page): Promise<string[]> {
  await page.evaluate(() => (window as unknown as T).__TEST__.setTimeScale(0));
  const bad = await page.evaluate(() => {
    const visible = (el: HTMLElement) => {
      for (let e: HTMLElement | null = el; e; e = e.parentElement) {
        const cs = getComputedStyle(e);
        if (e.hidden || cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false;
      }
      const r = el.getBoundingClientRect();
      return r.width >= 1 && r.height >= 1;
    };
    const open = [...document.querySelectorAll<HTMLElement>('.overlay:not([hidden]):not(.under)')].filter(visible);
    const roots = open.length ? [...open, document.getElementById('nav')] : [document.getElementById('ui')];
    const out: string[] = [];
    const top = Math.round(innerHeight * 0.1);
    for (const b of roots.flatMap((r) => [...(r?.querySelectorAll<HTMLElement>('button, [role=button]') ?? [])]).filter(visible)) {
      // A button scrolled out of its list is not on the screen now: its part in sight counts.
      let r = b.getBoundingClientRect();
      for (let p = b.parentElement; p; p = p.parentElement) {
        if (getComputedStyle(p).overflowY === 'visible') continue;
        const c = p.getBoundingClientRect();
        r = new DOMRect(Math.max(r.left, c.left), Math.max(r.top, c.top), Math.min(r.right, c.right) - Math.max(r.left, c.left), Math.min(r.bottom, c.bottom) - Math.max(r.top, c.top));
      }
      // The tab bar lies over a list scrolled under it: that part is not in sight.
      const nav = document.getElementById('nav')?.getBoundingClientRect();
      if (nav && nav.height > 0 && !b.closest('#nav') && r.bottom > nav.top) r = new DOMRect(r.left, r.top, r.width, Math.max(0, nav.top - r.top));
      if (r.width <= 0 || r.height <= 0) continue;
      const full = b.getBoundingClientRect();
      const name = `${b.dataset.action ?? b.dataset.tab ?? b.className.split(' ')[0]} «${(b.innerText ?? '').trim().slice(0, 20)}»`;
      if (Math.min(full.width, full.height) < 43.5) out.push(`${name}: ${full.width.toFixed(0)}×${full.height.toFixed(0)} px`);
      // 2 px: the level chip swells for a moment on a level up.
      if (r.top < top - 2) out.push(`${name}: in the top 10 % (y ${r.top.toFixed(0)} < ${top})`);
      if (r.bottom > innerHeight - 24 + 0.5) out.push(`${name}: in the gesture bar (bottom ${r.bottom.toFixed(0)} > ${innerHeight - 24})`);
    }
    return out;
  });
  await page.evaluate(() => (window as unknown as T).__TEST__.setTimeScale(1));
  return bad;
}

test.describe.configure({ mode: 'parallel' });

for (const size of SIZES) {
  const tag = `${size.width}x${size.height}`;
  test.describe(tag, () => {
    test.use({ viewport: size, isMobile: true, hasTouch: true });

    test(`PT-01 upright in ?mock=vk: every tab and window whole, buttons ≥ 44 px, the top 10 % and the gesture bar free @ ${tag}`, async ({ page }) => {
      test.setTimeout(300_000);
      const errors = collectErrors(page);
      await seedSave(page, { ...FRAMES_SAVE, savedAt: Date.now() - 2 * 3600 * 1000, upgrades: { ...FRAMES_SAVE.upgrades, helper_sell: 1 } });
      await open(page, VK);
      const problems: string[] = [];
      const frame = async (name: string) => {
        await page.waitForFunction(() => !document.querySelector('.toast'), null, { timeout: 8000 }).catch(() => undefined);
        await page.waitForTimeout(250);
        // The screen as it opens (every list at its start) — then the buttons scrolled into view the way a player scrolls.
        await page.evaluate(() =>
          document.querySelectorAll<HTMLElement>('.sheet:not([hidden]) *, .overlay:not([hidden]) *, .sheet:not([hidden]), .overlay:not([hidden])').forEach((e) => {
            if (e.scrollTop > 0 && !e.matches('.chat-lines')) e.scrollTop = 0;
          }),
        );
        await page.waitForTimeout(100);
        if (shotsDir) await page.screenshot({ path: `${shotsDir}/${name}_${tag}.png` });
        for (const p of await outOfReach(page)) problems.push(`${name}: ${p}`);
        for (const p of await buttonsSeenWhole(page)) problems.push(`${name}: ${p}`);
      };
      await shown(page, '[data-overlay=menu]');
      await frame('overlay-menu');
      await play(page);
      await walkEveryWindow(page, frame, shotsDir ? tag : null, shotsDir, VK_OPENERS);
      await VK_OPENERS['overlay:pause']!(page);
      await page.locator('[data-overlay=menu] [data-action=menu-help]').click();
      await frame('overlay-menu-help');
      expect(problems).toEqual([]);
      expect(errors).toEqual([]);
    });

    test(`PT-01 a turn upright ↔ sideways keeps the coins, the tab, the window and its own layout @ ${tag}`, async ({ page }) => {
      const errors = collectErrors(page);
      await seedSave(page, { ...FRAMES_SAVE });
      await open(page, VK);
      await play(page);
      await closeAll(page);
      await page.locator('[data-tab=sales]').click();
      const before = await state(page);
      const app = page.locator('#app');
      await expect(app).toHaveClass(/portrait/);
      await page.setViewportSize({ width: size.height, height: size.width });
      await expect(app).toHaveClass(/landscape/);
      await expect(page.locator('[data-tab=sales]')).toHaveClass(/active/);
      expect((await state(page)).coins).toBeGreaterThanOrEqual(before.coins);
      // Sideways the host reserve is gone: the top bar sits at the top again (the landscape look stays as it was).
      expect((await page.locator('.hud button').first().boundingBox())!.y).toBeLessThan(20);
      for (const p of await buttonsSeenWhole(page)) expect.soft(p, 'sideways').toBe('');
      await VK_OPENERS['overlay:settings']!(page);
      await page.setViewportSize(size);
      await expect(app).toHaveClass(/portrait/);
      await expect(page.locator('[data-overlay=settings]')).toBeVisible();
      for (const p of [...(await buttonsSeenWhole(page)), ...(await outOfReach(page))]) expect.soft(p, 'upright again').toBe('');
      await closeAll(page);
      await expect(page.locator('[data-tab=home]')).toHaveClass(/active/);
      for (const p of await outOfReach(page)) expect.soft(p, 'home upright').toBe('');
      expect(errors).toEqual([]);
    });
  });
}

test.describe('PT-03', () => {
  test.use({ viewport: { width: 405, height: 880 }, isMobile: true, hasTouch: true });

  test('PT-03 a reload on a preset link goes on with the game: the presets leave the address, ?mock=vk stays', async ({ page }) => {
    const errors = collectErrors(page);
    await open(page, `${VK}&fresh=1&hatched=2&coins=200`);
    await play(page);
    expect(new URL(page.url()).search).toBe(VK);
    expect((await state(page)).coins).toBe(200);
    await page.locator('[data-tab=eggs]').click();
    await page.locator('[data-sheet=eggs] [data-action=egg-buy-egg_basic]').click();
    await expect.poll(async () => (await state(page)).coins).toBeLessThan(200);
    const coins = (await state(page)).coins;
    await page.waitForTimeout(1500);
    await page.reload();
    await page.waitForFunction(() => Boolean((window as unknown as { __TEST__?: { state(): { controllable: boolean } } }).__TEST__?.state().controllable));
    expect(new URL(page.url()).search).toBe(VK);
    await play(page);
    expect((await state(page)).coins).toBe(coins);
    expect(errors).toEqual([]);
  });
});

for (const size of [
  { width: 405, height: 720 },
  { width: 815, height: 290 },
]) {
  test.describe(`PT-04 ${size.width}x${size.height}`, () => {
    test.use({ viewport: size, isMobile: true, hasTouch: true });

    test(`PT-04 «сборка <хеш>» in «Настройки»: 8 px over the edge, on no row, seen without scrolling @ ${size.width}x${size.height}`, async ({ page }) => {
      const errors = collectErrors(page);
      await open(page, `${VK}&fresh=1&hatched=2`);
      await play(page);
      await VK_OPENERS['overlay:settings']!(page);
      await expect(page.locator('[data-build-line]')).toBeVisible();
      const m = await page.evaluate(() => {
        const card = document.querySelector<HTMLElement>('[data-overlay=settings] > .card')!;
        const line = card.querySelector<HTMLElement>('[data-build-line]')!.getBoundingClientRect();
        const c = card.getBoundingClientRect();
        const on = [...card.querySelectorAll<HTMLElement>(':scope > *')]
          .filter((e) => !e.matches('[data-build-line]') && e.offsetParent !== null)
          .map((e) => e.getBoundingClientRect())
          .filter((r) => r.top < line.bottom && r.bottom > line.top && r.left < line.right && r.right > line.left);
        return { gap: c.bottom - line.bottom, on: on.length, top: line.top, bottom: line.bottom, h: innerHeight, scroll: card.scrollHeight - card.clientHeight };
      });
      expect(m.gap).toBeGreaterThanOrEqual(7.5);
      expect(m.on).toBe(0);
      expect(m.top).toBeGreaterThanOrEqual(0);
      expect(m.bottom).toBeLessThanOrEqual(m.h);
      expect(m.scroll).toBeLessThanOrEqual(0);
      expect(errors).toEqual([]);
    });
  });
}

for (const size of [
  { width: 405, height: 880 },
  { width: 815, height: 290 },
]) {
  test.describe(`PT-06 ${size.width}x${size.height}`, () => {
    test.use({ viewport: size, isMobile: true, hasTouch: true });

    test(`PT-06 a series of taps every 300 ms on the egg, going on over «Продать сразу», sells nothing; a tap after a pause sells @ ${size.width}x${size.height}`, async ({ page }) => {
      const errors = collectErrors(page);
      await open(page, `${VK}&fresh=1&hatched=2&coins=60`);
      await play(page);
      await page.locator('[data-tab=eggs]').click();
      await page.locator('[data-sheet=eggs] [data-action=egg-buy-egg_basic]').click();
      await page.locator('[data-tab=home]').click();
      type Tg = { __TEST__: { targets(): { incubators: Array<{ x: number; y: number }> } | null } };
      const egg = (await page.evaluate(() => (window as unknown as Tg).__TEST__.targets()!.incubators[0]))!;
      const win = page.locator('[data-overlay=hatch]');
      const sellBtn = page.locator('[data-action=hatch-sell]');
      // The finger taps the egg every 300 ms; once «Продать сразу» is on screen it goes on tapping there for 3 s.
      let onSell = 0;
      for (let i = 0; i < 80 && onSell < 10; i++) {
        const box = (await sellBtn.isVisible()) && (await win.locator('[data-hatch-result]').isVisible()) ? await sellBtn.boundingBox() : null;
        if (box) onSell += 1;
        await page.touchscreen.tap(box ? box.x + box.width / 2 : egg.x, box ? box.y + box.height / 2 : egg.y);
        await page.waitForTimeout(300);
      }
      expect(onSell, 'the series reached «Продать сразу»').toBe(10);
      await expect(win).toBeVisible();
      // The pet waits for the choice (a sale takes it away; coins may come from a find meanwhile).
      expect((await state(page)).creatures).toHaveLength(1);
      // A tap of its own (a pause before it) sells.
      await page.waitForTimeout(700);
      await sellBtn.tap();
      await expect(win).toBeHidden();
      await expect.poll(async () => (await state(page)).creatures.length).toBe(0);
      expect(errors).toEqual([]);
    });
  });
}

for (const size of [
  { width: 880, height: 405 },
  { width: 815, height: 290 },
  { width: 405, height: 880 },
]) {
  const tag = `${size.width}x${size.height}`;
  test.describe(`PT-02 ${tag}`, () => {
    test.use({ viewport: size, isMobile: true, hasTouch: true });

    test(`PT-02 «Купи улучшение» after a deal: the bubble lies on no word of the upgrades' list and no button @ ${tag}`, async ({ page }) => {
      const errors = collectErrors(page);
      // As N-01: the seller level 3, «Вывеска» open and in reach, the first upgrade bought; a deal arms the call.
      await seedSave(page, {
        coins: 150,
        creatures: [
          { uid: 'n1', species: 'kettle', level: 3, fed: 0, hatchedAt: 0, age: 0 },
          { uid: 'n2', species: 'kettle', level: 3, fed: 0, hatchedAt: 0, age: 0 },
        ],
        showcase: ['n1', 'n2'],
        upgrades: { incubator: 1 },
        incubators: [{ egg: null }, { egg: null }],
        myEggs: {},
        freeIn: { egg_gift: 300 },
      });
      await open(page, VK);
      await play(page);
      type S = { __TEST__: { setTimeScale(k: number): void; state(): { chats: unknown[]; stats: { deals: number }; hint: string } } };
      await page.evaluate(() => (window as unknown as S).__TEST__.setTimeScale(8));
      await expect.poll(() => page.evaluate(() => (window as unknown as S).__TEST__.state().chats.length), { timeout: 30_000 }).toBeGreaterThan(0);
      await page.evaluate(() => (window as unknown as S).__TEST__.setTimeScale(1));
      await page.locator('[data-tab=chats]').tap();
      const dialog = page.locator('[data-sheet=chats] [data-chat-dialog]');
      if (!(await dialog.locator('[data-action=chat-sell]').isVisible())) await page.locator('[data-sheet=chats] [data-chat]').first().tap();
      await dialog.locator('[data-action=chat-sell]').tap();
      await page.locator('[data-tab=home]').tap();
      await expect(page.locator('[data-action="buy-upgrade"].is-hinted')).toBeVisible();
      const bubble = page.locator('.hint:not([hidden])');
      await expect(bubble).toBeVisible();
      await page.waitForTimeout(400);
      const under = await page.evaluate(() => {
        const h = document.querySelector<HTMLElement>('.hint:not([hidden])')!.getBoundingClientRect();
        return [...document.querySelectorAll<HTMLElement>('[data-sheet=home] .mu-name, [data-sheet=home] .mu-meta, [data-sheet=home] button')]
          .filter((e) => e.offsetParent !== null && !e.classList.contains('is-hinted'))
          .filter((e) => {
            let r = e.getBoundingClientRect();
            for (let p = e.parentElement; p; p = p.parentElement) {
              if (getComputedStyle(p).overflowY === 'visible') continue;
              const c = p.getBoundingClientRect();
              r = new DOMRect(Math.max(r.left, c.left), Math.max(r.top, c.top), Math.min(r.right, c.right) - Math.max(r.left, c.left), Math.min(r.bottom, c.bottom) - Math.max(r.top, c.top));
            }
            return r.width > 0 && r.height > 0 && r.top < h.bottom - 1 && r.bottom > h.top + 1 && r.left < h.right - 1 && r.right > h.left + 1;
          })
          .map((e) => (e.textContent ?? '').trim().slice(0, 24));
      });
      if (shotsDir) await page.screenshot({ path: `${shotsDir}/pt02-upgrade-call_${tag}.png` });
      expect(under).toEqual([]);
      expect(errors).toEqual([]);
    });
  });
}
