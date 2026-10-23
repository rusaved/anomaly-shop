import { expect, test, type Page } from '@playwright/test';
import { collectErrors, mockCalls, mockViolations, open, seedSave, state } from './helpers.ts';

// M5-00 truthful stand (the producer link behaves like Yandex) and M5-02, M5-03 ads on it: the banner stand-in narrows the game,
// full screen on the first tap, the dark «Реклама» screen for 3 s with the game paused; every outcome of a rewarded video
// (reward, closed early, no video, late reward) × the egg card; the interstitial only between screens, by the rules.
const TRUTHFUL = 'mock_banner=1&mock_fullscreen=tap&mock_ad_ms=3000';
type T = { __TEST__: { runSim(s: number): number; state(): { snapshot: Record<string, unknown> } & Record<string, unknown> } };
const runSim = (page: Page, s: number): Promise<number> => page.evaluate((x) => (window as unknown as T).__TEST__.runSim(x), s);
const adBlock = (page: Page): Promise<unknown> => page.evaluate(() => ((window as unknown as T).__TEST__.state() as unknown as { adBlock: unknown }).adBlock);
const myEggs = (page: Page): Promise<number> =>
  page.evaluate(() => {
    const raw = localStorage.getItem('anomaly-shop:save');
    const s = raw ? (JSON.parse(raw) as { myEggs?: Record<string, number>; incubators?: Array<{ egg: string | null }> }) : {};
    return Object.values(s.myEggs ?? {}).reduce((a, b) => a + b, 0) + (s.incubators ?? []).filter((i) => i.egg).length;
  });

async function eggsTab(page: Page): Promise<void> {
  await page.locator('[data-tab=eggs]').click();
  await expect(page.locator('[data-sheet=eggs] [data-action=ad-egg-ad_gold]')).toBeVisible();
}

test.describe('M5-00 truthful stand', () => {
  test('desktop: the banner stand-in takes 160 px on the right, the game narrows itself and nothing hides under it', async ({ page }) => {
    const errors = collectErrors(page);
    await seedSave(page);
    await open(page, `?${TRUTHFUL}`);
    const banner = page.locator('#__ya_mock_banner__');
    await expect(banner).toBeVisible();
    const box = (await banner.boundingBox())!;
    expect(Math.round(box.width)).toBe(160);
    await expect.poll(() => page.evaluate(() => document.getElementById('app')!.clientWidth)).toBe(1280 - 160);
    const over = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('#ui button')].filter((b) => b.offsetParent && b.getBoundingClientRect().right > 1120 + 0.5).map((b) => b.dataset.action ?? b.className));
    expect(over).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('full screen on the first tap, once', async ({ page }) => {
    await seedSave(page);
    await open(page, `?${TRUTHFUL}`);
    await page.locator('[data-tab=eggs]').click();
    await page.locator('[data-tab=home]').click();
    expect((await mockCalls(page)).filter((c) => c === 'mock.fullscreen')).toHaveLength(1);
  });

  test('a rewarded video: the dark «Реклама» screen ~3 s, the game paused, the egg after it, the card stays with one less', async ({ page }) => {
    const errors = collectErrors(page);
    await seedSave(page);
    await open(page, `?${TRUTHFUL}`);
    await eggsTab(page);
    const before = await myEggs(page);
    await expect(page.locator('[data-ad-egg=ad_gold] .mu-meta')).toHaveText(/5/);
    const t0 = Date.now();
    await page.locator('[data-action=ad-egg-ad_gold]').click();
    const ad = page.locator('#__ya_mock_ad__');
    await expect(ad).toBeVisible();
    await expect(ad).toContainText('Реклама');
    expect((await state(page)).pause).toContain('ad');
    await expect(ad).toBeHidden({ timeout: 8000 });
    expect(Date.now() - t0).toBeGreaterThan(2500);
    await expect.poll(() => myEggs(page)).toBe(before + 1);
    await expect(page.locator('[data-ad-egg=ad_gold]')).toBeVisible();
    await expect(page.locator('[data-ad-egg=ad_gold] .mu-meta')).not.toHaveText(/5/);
    expect((await state(page)).pause).not.toContain('ad');
    expect(await mockViolations(page)).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('closed early (✕): no egg, a note, the button stays', async ({ page }) => {
    await seedSave(page);
    await open(page, `?${TRUTHFUL}`);
    await eggsTab(page);
    const before = await myEggs(page);
    await page.locator('[data-action=ad-egg-ad_gold]').click();
    await page.locator('#__ya_mock_ad__ [data-ad-close]').click();
    await expect(page.locator('#__ya_mock_ad__')).toBeHidden();
    await expect(page.locator('.toast')).toContainText(/досмотреть/, { timeout: 5000 });
    expect(await myEggs(page)).toBe(before);
    await expect(page.locator('[data-action=ad-egg-ad_gold]')).toBeVisible();
    expect((await state(page)).pause).not.toContain('ad');
  });

  test('no video (error): no egg, a note, the button stays; the late reward (onRewarded after onClose) still gives the egg', async ({ page }) => {
    await seedSave(page);
    await open(page, `?${TRUTHFUL}&mock_ad=error`);
    await eggsTab(page);
    const before = await myEggs(page);
    await page.locator('[data-action=ad-egg-ad_gold]').click();
    await expect(page.locator('.toast')).toContainText(/Видео сейчас нет/, { timeout: 5000 });
    expect(await myEggs(page)).toBe(before);
    await expect(page.locator('[data-action=ad-egg-ad_gold]')).toBeVisible();
    await page.goto(`/?${TRUTHFUL}&mock_ad=late&mock_ad_ms=500`);
    await page.waitForFunction(() => (window as unknown as { __TEST__?: { state(): { controllable: boolean } } }).__TEST__?.state().controllable);
    await eggsTab(page);
    const was = await myEggs(page);
    await page.locator('[data-action=ad-egg-ad_gold]').click();
    await expect.poll(() => myEggs(page), { timeout: 8000 }).toBe(was + 1);
  });

  test('every rewarded place has its own button with the reward on it; none on the scene or the top bar', async ({ page }) => {
    await seedSave(page, {
      coins: 5,
      incubators: [{ egg: 'egg_odd', startedAt: 0, progress: 0, elapsed: 0, waiting: false, careFed: 2 }],
      flags: { ftue_starter: true, ftue_done: true, ftue_fed: true, ftue_bought: true },
      stats: { deals: 30, coinsEarned: 5000, hatched: 20, taps: 300, levelUps: 6, haggles: 2, xp: 400 },
    });
    await open(page, `?${TRUTHFUL}`);
    await page.locator('[data-tab=eggs]').click();
    await expect(page.locator('[data-sheet=eggs] [data-action=ad-hatch-0]')).toHaveText(/Реклама/);
    await expect(page.locator('[data-sheet=eggs] [data-action=ad-egg-ad_ladder]')).toHaveText(/Реклама: яйцо/);
    await page.locator('[data-tab=market]').click();
    await expect(page.locator('[data-sheet=market] [data-action=ad-skip]')).toHaveText(/Реклама/);
    await page.locator('[data-action=gifts]').click();
    await expect(page.locator('[data-action=ad-boost]')).toHaveText(/Реклама: продажи/);
    const hud = await page.evaluate(() => [...document.querySelectorAll('.hud button, #scene')].filter((b) => /Реклама|Ad:/.test(b.textContent ?? '')).length);
    expect(hud).toBe(0);
    // hatch now: the egg is ready after the video.
    await page.locator('[data-action=gifts-close]').click();
    await page.locator('[data-tab=eggs]').click();
    await page.locator('[data-sheet=eggs] [data-action=ad-hatch-0]').click();
    await expect(page.locator('[data-sheet=eggs] [data-action=egg-open-0]')).toBeVisible({ timeout: 8000 });
  });

  test('M5-03 interstitial: not in the first 3 minutes; then on a window closed by the player; not again for 3 minutes', async ({ page }) => {
    await seedSave(page);
    await open(page, `?${TRUTHFUL}&mock_ad_ms=500`);
    expect(await adBlock(page)).toBe('first');
    await runSim(page, 181);
    expect(await adBlock(page)).toBeNull();
    await page.locator('[data-action=gifts]').click();
    await page.locator('[data-action=gifts-close]').click();
    await expect(page.locator('#__ya_mock_ad__[data-kind=fullscreen]')).toBeVisible();
    await expect(page.locator('#__ya_mock_ad__')).toBeHidden({ timeout: 5000 });
    expect(await adBlock(page)).toBe('gap');
    await page.locator('[data-tab=eggs]').click();
    await page.waitForTimeout(300);
    expect((await mockCalls(page)).filter((c) => c === 'adv.showFullscreenAdv')).toHaveLength(1);
  });

  test('M5-03 «no ads» stops the interstitial and the banner (60 s after a video — unit ad-gate)', async ({ page }) => {
    await seedSave(page, { shop: { noAds: true, bought: { no_ads: 1 }, starterEnds: 0 } });
    await open(page, `?${TRUTHFUL}&mock_ad_ms=500`);
    await runSim(page, 181);
    expect(await adBlock(page)).toBe('noads');
    await expect(page.locator('#__ya_mock_banner__')).toHaveCount(0);
    await eggsTab(page);
    await page.locator('[data-action=gifts]').click();
    await page.locator('[data-action=gifts-close]').click();
    await page.waitForTimeout(300);
    expect(await mockCalls(page)).not.toContain('adv.showFullscreenAdv');
  });

  test('M5-03 an interstitial that fails (no ad) starts no cooldown and the game goes on', async ({ page }) => {
    await seedSave(page);
    await open(page, `?${TRUTHFUL}&mock_ad=error`);
    await runSim(page, 181);
    await page.locator('[data-action=gifts]').click();
    await page.locator('[data-action=gifts-close]').click();
    await expect.poll(() => mockCalls(page).then((c) => c.filter((x) => x === 'adv.showFullscreenAdv').length)).toBe(1);
    await expect.poll(() => adBlock(page)).toBeNull();
    expect((await state(page)).pause).not.toContain('ad');
  });

  test('Q-045 A: stuck with no coins and no pets — the egg for a video gets the shop going again', async ({ page }) => {
    await seedSave(page, { coins: 0, creatures: [], freeIn: { egg_gift: 200 } });
    await open(page, `?${TRUTHFUL}&mock_ad_ms=500`);
    await page.locator('[data-tab=eggs]').click();
    await expect(page.locator('[data-sheet=eggs] [data-action=egg-buy-egg_basic]')).toHaveAttribute('aria-disabled', 'true');
    await page.locator('[data-sheet=eggs] [data-action=ad-egg-ad_ladder]').click();
    await expect.poll(() => myEggs(page), { timeout: 8000 }).toBe(1);
  });
});
