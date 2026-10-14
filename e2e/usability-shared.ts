import { expect, type Page } from '@playwright/test';
import { collectErrors, open, seedSave, state, translated } from './helpers.ts';

/**
 * UB-09: the usability checks of verify — each item its own test, run at 375×812 (phone) and 1280×720 (PC).
 * Windows (UB-02), hints, the hatch reward (UB-03), signed gestures, text and tap sizes (UB-07), tab labels, no service marks.
 */
const openWindows = (page: Page) => page.locator('.overlay:not([hidden]):not(.under)');
const seeded = (page: Page) => seedSave(page, { coins: 5000, showcase: ['e2e1'], flags: { ftue_starter: true, ftue_done: true, ftue_fed: true, ftue_bought: true, showcase_m3: true } });
const targets = (page: Page) =>
  page.evaluate(() => (window as unknown as { __TEST__: { targets(): { incubators: Array<{ x: number; y: number }>; caption: string } } }).__TEST__.targets());
const tap = async (page: Page, p: { x: number; y: number }) => {
  if (page.viewportSize()!.width < 900) await page.touchscreen.tap(p.x, p.y);
  else await page.mouse.click(p.x, p.y);
};
/** Every window a player opens in the first minutes, by its button. */
const OPENERS: Array<[string, string]> = [
  ['[data-action=egg-card-egg_basic]', 'egg-card'],
  ['[data-action=open-upgrades]', 'upgrades'],
  ['[data-action=reputation]', 'reputation'],
  ['[data-action=gifts]', 'gifts'],
  ['[data-action=work]', 'work'],
  ['[data-action=pause]', 'pause'],
];

export async function windowClosesByTab(page: Page): Promise<void> {
  const errors = collectErrors(page);
  await seeded(page);
  await open(page);
  for (const [i, [opener, name]] of OPENERS.entries()) {
    await page.locator('[data-tab=eggs]').click();
    await page.locator(opener).click();
    await expect(page.locator(`[data-overlay=${name}]`), name).toBeVisible();
    // Any tab closes it: alternately the home tab and another screen.
    const tab = i % 2 ? 'eggs' : 'chats';
    await page.locator(`[data-tab=${tab}]`).click();
    await expect(openWindows(page), name).toHaveCount(0);
    await expect(page.locator(`[data-sheet=${tab}]`)).toBeVisible();
  }
  expect((await state(page)).pause).not.toContain('menu');
  expect(errors).toEqual([]);
}

export async function oneWindowAtATime(page: Page): Promise<void> {
  const errors = collectErrors(page);
  await seeded(page);
  await open(page);
  // Real taps one after another on whatever opens a window: never two open at once (settings over pause aside).
  const spots = ['[data-action=egg-card-egg_basic]', '[data-tab=shop]', '[data-action=reputation]', '[data-action=gifts]', '[data-action=work]', '[data-action=open-upgrades]', '[data-action=pause]', '[data-tab=sales]'];
  for (const sel of [...spots, ...spots.reverse()]) {
    const el = page.locator(sel).first();
    if (!(await el.isVisible())) continue;
    const box = (await el.boundingBox())!;
    await tap(page, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
    await page.waitForTimeout(150);
    expect(await openWindows(page).count(), sel).toBeLessThanOrEqual(1);
  }
  expect(errors).toEqual([]);
}

export async function hintsNeverOverWindows(page: Page): Promise<void> {
  const errors = collectErrors(page);
  await open(page);
  // The first minute's «Tap the egg» is on: every window hides it, the home screen brings it back.
  await expect(page.locator('.hint [data-hint-text]')).toBeVisible();
  for (const [opener, name] of OPENERS) {
    await page.locator('[data-tab=eggs]').click();
    await expect(page.locator('.hint [data-hint-text]')).toBeVisible();
    await page.locator(opener).click();
    await expect(page.locator(`[data-overlay=${name}]`)).toBeVisible();
    // The scene's hint is gone (by the next frame); a hint may stay only inside the window, at a thing in it (a tab's first hint, UB-06).
    const where = () =>
      page.evaluate((n) => {
        const hint = document.querySelector<HTMLElement>('.hint');
        if (!hint || hint.hidden) return 'none';
        const target = document.querySelector('.is-hinted');
        return target && target.closest(`[data-overlay="${n}"]`) ? 'inside' : `over: ${hint.dataset.hint}`;
      }, name);
    await expect.poll(where, { message: name }).toMatch(/^(none|inside)$/);
  }
  expect(errors).toEqual([]);
}

export async function rewardAfterAnimation(page: Page): Promise<void> {
  const errors = collectErrors(page);
  await open(page);
  await tap(page, (await targets(page)).incubators[0]!);
  const hatch = page.locator('[data-overlay=hatch]');
  await expect(hatch).toBeVisible();
  // While the strip runs: no result, no buttons, the creature is not on the shelf.
  const during = Date.now();
  await expect(page.locator('[data-hatch-result]')).toBeHidden();
  await expect(hatch.locator('[data-action=hatch-shop]')).toBeHidden();
  expect(((await state(page)) as unknown as { shelf: unknown[] }).shelf).toEqual([]);
  // The result comes only when the strip stops (3 s and more), with its timing in the test API.
  await expect(hatch.locator('[data-action=hatch-shop]')).toBeVisible({ timeout: 8000 });
  expect(Date.now() - during).toBeGreaterThan(2500);
  const timing = ((await state(page)) as unknown as { hatchTiming: { start: number; result: number } }).hatchTiming;
  expect(timing.result - timing.start).toBeGreaterThanOrEqual(3000);
  expect(errors).toEqual([]);
}

export async function gesturesSigned(page: Page): Promise<void> {
  const errors = collectErrors(page);
  // Past the first minute (its hints teach the taps, the counter is quiet then): an empty shelf, coins for an egg.
  await seedSave(page, { coins: 500, showcase: [], flags: { ftue_starter: true, ftue_done: true, ftue_fed: true, ftue_bought: true, showcase_m3: true } });
  await open(page);
  expect((await targets(page)).caption).toBe('');
  await page.locator('[data-action=egg-card-egg_basic]').click();
  await page.locator('[data-action=egg-buy-1]').click();
  await page.locator('[data-tab=eggs]').click();
  // An egg on the counter: a caption says what a tap does.
  await expect.poll(async () => (await targets(page)).caption).toMatch(new RegExp(`^(${await translated(page, 'shop.tapWarm')}|${await translated(page, 'shop.tapHatch')})$`));
  const egg = (await targets(page)).incubators[0]!;
  for (let i = 0; i < 30 && !(await page.locator('[data-overlay=hatch]').isVisible()); i++) {
    await tap(page, egg);
    await page.waitForTimeout(120);
  }
  // The strip: «tap — skip».
  await expect(page.locator('[data-overlay=hatch] .hatch-skip')).toHaveText(await translated(page, 'hatch.skip'));
  await page.locator('[data-overlay=hatch] [data-action=hatch-shop]').click({ timeout: 8000 });
  // «To the shop» opens the price slider (UB-10) — its scale is signed.
  await expect(page.locator('[data-overlay=sale] .price-scale')).toBeVisible();
  expect((await page.locator('[data-overlay=sale] .price-scale').innerText()).trim().length).toBeGreaterThan(0);
  // A pet on the shelf: a tap feeds it, the counter says so.
  await page.locator('[data-tab=eggs]').click();
  await expect.poll(async () => (await targets(page)).caption).toBe(await translated(page, 'shop.tapFeed'));
  expect(errors).toEqual([]);
}

export async function tabLabels(page: Page): Promise<void> {
  const errors = collectErrors(page);
  await open(page);
  const tabs = await page.locator('#nav [data-tab]').evaluateAll((els) =>
    els.map((el) => {
      const label = [...el.querySelectorAll<HTMLElement>('.nav-label')].find((l) => getComputedStyle(l).display !== 'none');
      const r = label?.getBoundingClientRect();
      return { tab: (el as HTMLElement).dataset.tab, text: label?.innerText.trim() ?? '', size: label ? parseFloat(getComputedStyle(label).fontSize) : 0, fits: Boolean(label && label.scrollWidth <= label.clientWidth + 1 && r && r.width > 0) };
    }),
  );
  expect(tabs).toHaveLength(7);
  for (const t of tabs) {
    expect(t.text, t.tab).not.toBe('');
    expect(t.size, t.tab).toBeGreaterThanOrEqual(12);
    expect(t.fits, `${t.tab} label fits`).toBe(true);
  }
  expect(errors).toEqual([]);
}

export async function noServiceMarks(page: Page): Promise<void> {
  const errors = collectErrors(page);
  await seeded(page);
  await open(page);
  // No build label, no raw i18n keys, no {placeholders}, no NaN / undefined, no dev words — on every screen.
  const bad = /\b[a-z]+\.[a-z][a-zA-Z]+(\.[a-zA-Z]+)?\b|\{[a-z]+\}|\bNaN\b|\bundefined\b|\bnull\b|\bdebug\b|\bTODO\b|\bM\d+ ·/;
  await expect(page.locator('[data-build-label]')).toHaveCount(0);
  for (const tab of ['eggs', 'market', 'inventory', 'sales', 'chats', 'shop', 'season']) {
    await page.locator(`[data-tab=${tab}]`).click();
    await page.waitForTimeout(200);
    const text = await page.locator('#ui').innerText();
    expect(text.match(bad)?.[0] ?? '', tab).toBe('');
  }
  expect(errors).toEqual([]);
}
