import { expect, test } from '@playwright/test';

/**
 * M6-04: the youtube build (dist-youtube, served static) on a fake ytgame SDK: boots clean, firstFrameReady and gameReady once,
 * not one request beyond the page itself and the SDK tag, no community buttons (pause, settings, side) and no «visit the group» gift.
 */
const SDK = 'https://www.youtube.com/game_api/v1';
const FAKE_SDK = `window.__YT__ = { calls: [] };
const call = (n) => window.__YT__.calls.push(n);
window.ytgame = {
  game: { firstFrameReady() { call('firstFrameReady'); }, gameReady() { call('gameReady'); }, loadData() { return Promise.resolve(''); }, saveData() { call('saveData'); return Promise.resolve(); } },
  system: { getLanguage() { return Promise.resolve('en'); }, isAudioEnabled() { return true; }, onAudioEnabledChange() {}, onPause() {}, onResume() {} },
  health: { logError() { call('logError'); }, logWarning() {} },
};`;

test('M6-04 youtube build: fake ytgame, ready once, no outside requests, no community or follow gift', async ({ page, baseURL }) => {
  const errors: string[] = [];
  const outside: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => {
    const u = r.url();
    if (!u.startsWith(baseURL ?? '') && !u.startsWith(SDK) && !u.startsWith('data:') && !u.startsWith('blob:')) outside.push(u);
  });
  await page.route(`${SDK}**`, (route) => route.fulfill({ contentType: 'text/javascript', body: FAKE_SDK }));
  await page.goto('/');
  await page.waitForFunction(() => (window as unknown as { __YT__?: { calls: string[] } }).__YT__?.calls.includes('gameReady'));
  await expect(page.locator('#preloader')).toHaveClass(/hidden/);
  await expect(page.locator('[data-hud=coins]')).toBeVisible();
  const calls = await page.evaluate(() => (window as unknown as { __YT__: { calls: string[] } }).__YT__.calls);
  expect(calls.filter((c) => c === 'firstFrameReady')).toHaveLength(1);
  expect(calls.filter((c) => c === 'gameReady')).toHaveLength(1);
  expect(calls).not.toContain('logError');
  // No community buttons anywhere: the side slot, the pause window, the settings window.
  await expect(page.locator('.community, [data-action^="community-"]')).toHaveCount(0);
  await page.locator('[data-action="pause"]').click();
  await expect(page.locator('[data-action^="community-"]')).toHaveCount(0);
  const flags = await page.evaluate(() => ({
    test: '__TEST__' in window,
    gui: document.querySelector('.lil-gui') !== null,
    label: document.querySelector('[data-build-label]') !== null,
    links: [...document.querySelectorAll('a[href]')].map((a) => (a as HTMLAnchorElement).href).filter((h) => /^https?:/.test(h)),
  }));
  expect(flags).toEqual({ test: false, gui: false, label: false, links: [] });
  await page.keyboard.press('Escape');
  expect(outside).toEqual([]);
  expect(errors).toEqual([]);
});

test('M6-04 youtube build: the Gifts window has no «visit the group» card', async ({ page }) => {
  await page.route(`${SDK}**`, (route) => route.fulfill({ contentType: 'text/javascript', body: FAKE_SDK }));
  await page.goto('/');
  await page.waitForFunction(() => (window as unknown as { __YT__?: { calls: string[] } }).__YT__?.calls.includes('gameReady'));
  // The first-minute hints may hold the top bar; the gifts button is there from the start.
  await page.locator('[data-action="gifts"]').click({ force: true });
  await expect(page.locator('[data-action="gifts-close"]')).toBeVisible();
  await expect(page.locator('[data-gift="group"], [data-action^="gift-follow-"]')).toHaveCount(0);
});
