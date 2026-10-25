import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { collectErrors, open, seedSave, state } from './helpers.ts';

const game = JSON.parse(readFileSync(resolve(import.meta.dirname, '../game.json'), 'utf8')) as { bootBackground: string; title: { ru: string; en: string } };

/** M7 «Сборка»: the release candidate's own checks. */
const BLANK = 'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7#';

test('M7-00 the pictures held back for the first screen are all drawn right after it, on every tab', async ({ page }) => {
  const errors = collectErrors(page);
  // A shop well into the game: every tab is open and has pictures.
  await seedSave(page, { coins: 1000, flags: { ftue_starter: true, ftue_done: true, ftue_fed: true, ftue_bought: true }, stats: { deals: 8, coinsEarned: 300, hatched: 10, taps: 100, levelUps: 3, haggles: 1 } });
  await open(page);
  const blanks = () => page.evaluate((b) => [...document.querySelectorAll('img')].filter((i) => (i.getAttribute('src') ?? '').includes(b)).length, BLANK);
  await expect.poll(blanks, { timeout: 5000 }).toBe(0);
  for (const tab of await page.locator('.nav-tab:visible').all()) {
    await tab.click();
    await page.waitForTimeout(300);
    expect(await blanks()).toBe(0);
  }
  expect(await page.locator('.nav-tab:visible').count()).toBeGreaterThanOrEqual(5);
  expect(errors).toEqual([]);
});

type Sound = { sound: { suspended: boolean; context: string } };
const sound = async (page: Page) => ((await state(page)) as unknown as Sound).sound;

const noContext = (re: string) => () => {
  const real = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, id: string, ...rest: unknown[]) {
    if (new RegExp(re, 'i').test(id)) return null;
    return (real as (...a: unknown[]) => unknown).call(this, id, ...rest);
  } as typeof real;
  Object.defineProperty(navigator, 'gpu', { value: undefined });
};

test('BLD-06 no WebGL: the shop still opens (the scene falls back to a 2D canvas), no technical words, no errors', async ({ page }) => {
  const errors = collectErrors(page);
  await page.addInitScript(`(${noContext.toString()})('webgl|webgpu')()`);
  await open(page);
  expect((await state(page)).controllable).toBe(true);
  expect(await page.locator('body').innerText()).not.toMatch(/webgl|ошибк|error/i);
  expect(errors).toEqual([]);
});

test('BLD-06 nothing can draw at all: a calm screen in the player language instead of a spinner, no errors', async ({ page }) => {
  const errors = collectErrors(page);
  await page.addInitScript(`(${noContext.toString()})('webgl|webgpu|2d|bitmaprenderer')()`);
  await page.goto('/');
  const note = page.locator('#unsupported');
  await expect(note).toBeVisible({ timeout: 15_000 });
  const text = (await note.textContent()) ?? '';
  expect(text.length).toBeGreaterThan(10);
  expect(text).not.toMatch(/webgl|ошибк|error|undefined|boot\./i);
  await expect(page.locator('#preloader .spinner')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('SND-02 blur, hidden and pagehide: the game and the sound stop at once, come back on focus', async ({ page }) => {
  const errors = collectErrors(page);
  await open(page);
  // A tap loads the synth (Web Audio is unlocked by a gesture).
  await page.mouse.click(5, 300);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  expect((await state(page)).pause).toContain('blur');
  expect((await sound(page)).suspended).toBe(true);
  await expect.poll(async () => (await sound(page)).context, { timeout: 2000 }).not.toBe('running');
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect.poll(async () => (await state(page)).pause).toEqual([]);
  expect((await sound(page)).suspended).toBe(false);
  // Hidden: the page says so the way a phone does when the game is minimised.
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  expect((await state(page)).pause).toContain('hidden');
  expect((await sound(page)).suspended).toBe(true);
  expect(errors).toEqual([]);
});

test('SCR-07 minimised and back, «Назад» from the platform: the game goes on, nothing freezes', async ({ page }) => {
  const errors = collectErrors(page);
  await open(page);
  const setHidden = (h: boolean) =>
    page.evaluate((hid) => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (hid ? 'hidden' : 'visible') });
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => hid });
      document.dispatchEvent(new Event('visibilitychange'));
    }, h);
  await setHidden(true);
  expect((await state(page)).pause).toContain('hidden');
  await setHidden(false);
  await expect.poll(async () => (await state(page)).pause).toEqual([]);
  await page.evaluate(() => (window as unknown as { __YA_MOCK__: { sdk: { dispatchEvent(n: string): Promise<void> } } }).__YA_MOCK__.sdk.dispatchEvent('HISTORY_BACK'));
  const t0 = (await state(page)).elapsed;
  await page.waitForTimeout(1200);
  const s = await state(page);
  expect(s.controllable).toBe(true);
  expect(s.elapsed).toBeGreaterThan(t0);
  await page.locator('[data-tab=eggs]').click();
  await expect(page.locator('[data-tab=eggs]')).toHaveClass(/active/);
  expect(errors).toEqual([]);
});

test('SCR-04 no context menu on a right click or a long tap, nothing gets selected', async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    (window as unknown as { __menus: boolean[] }).__menus = [];
    window.addEventListener('contextmenu', (e) => (window as unknown as { __menus: boolean[] }).__menus.push(e.defaultPrevented));
  });
  await page.mouse.click(640, 300, { button: 'right' });
  await page.locator('[data-tab=eggs]').click({ button: 'right' });
  const menus = await page.evaluate(() => (window as unknown as { __menus: boolean[] }).__menus);
  expect(menus.length).toBeGreaterThanOrEqual(2);
  expect(menus.every(Boolean)).toBe(true);
  // A long press with a drag over the texts selects nothing.
  await page.mouse.move(20, 20);
  await page.mouse.down();
  await page.mouse.move(1200, 700, { steps: 10 });
  await page.waitForTimeout(800);
  await page.mouse.up();
  expect(await page.evaluate(() => window.getSelection()?.toString() ?? '')).toBe('');
  expect(await page.evaluate(() => getComputedStyle(document.body).userSelect)).toBe('none');
});

for (const vp of [{ width: 2560, height: 1080 }, { width: 600, height: 1300 }]) {
  test(`SCR-02 ${vp.width}×${vp.height}: the game touches the edges along one axis, the margins are the background color`, async ({ page }) => {
    await page.setViewportSize(vp);
    await open(page);
    const r = await page.evaluate(() => {
      const b = document.getElementById('app')!.getBoundingClientRect();
      return { x: b.x, y: b.y, w: b.width, h: b.height, bg: getComputedStyle(document.body).backgroundColor, iw: innerWidth, ih: innerHeight };
    });
    const touchesX = Math.abs(r.x) < 1 && Math.abs(r.w - r.iw) < 1;
    const touchesY = Math.abs(r.y) < 1 && Math.abs(r.h - r.ih) < 1;
    expect(touchesX || touchesY).toBe(true);
    const hex = game.bootBackground.replace('#', '');
    const rgb = `rgb(${parseInt(hex.slice(0, 2), 16)}, ${parseInt(hex.slice(2, 4), 16)}, ${parseInt(hex.slice(4, 6), 16)})`;
    if (!(touchesX && touchesY)) expect(r.bg).toBe(rgb);
  });
}

test('LOC-04 the page title is the card title of game.json', async ({ page }) => {
  await open(page);
  expect(await page.title()).toBe(game.title.ru);
});

test('CNT-08 the community buttons stay in the pause, «Подарки» gives nothing for a visit to the group', async ({ page }) => {
  const errors = collectErrors(page);
  await seedSave(page);
  await open(page);
  await page.locator('[data-action=gifts]').click();
  await expect(page.locator('[data-overlay=gifts]')).toBeVisible();
  await expect(page.locator('[data-gift="group"], [data-action^="gift-follow-"]')).toHaveCount(0);
  await page.locator('[data-action=gifts-close]').click();
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-action=community-telegram]:visible').first()).toBeVisible();
  expect(errors).toEqual([]);
});
