import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { collectErrors, events, expectInsideViewport, expectNoPageScroll, mockCalls, mockViolations, open, state, translated } from './helpers.ts';

/** Milestone smoke (docs/05, section 3) against build:e2e on the Yandex SDK mock. Test names start with the docs/03 ID. */
const game = JSON.parse(readFileSync(resolve(import.meta.dirname, '../game.json'), 'utf8')) as { community: { telegram: string; vk: string }; title: { ru: string; en: string } };

test('environment: the game boots on the mock, WebGL renders, the test API answers', async ({ page }) => {
  const errors = collectErrors(page);
  await open(page);
  const s = await state(page);
  expect(s.platform).toBe('yandex');
  expect(s.controllable).toBe(true);
  expect(await page.locator('#scene').evaluate((c) => (c as HTMLCanvasElement).width > 0)).toBe(true);
  expect(errors).toEqual([]);
});

test('SDK-02 ready() once, after the shop is drawn, within 4 s; the loading screen is gone', async ({ page }) => {
  await open(page);
  const calls = await mockCalls(page);
  expect(calls.filter((c) => c === 'LoadingAPI.ready')).toHaveLength(1);
  expect(calls.indexOf('on')).toBeLessThan(calls.indexOf('LoadingAPI.ready'));
  const ready = (await events(page)).find((e) => e.name === 'gameReady');
  expect(ready).toBeDefined();
  expect(ready!.t).toBeLessThan(4000);
  await expect(page.locator('#preloader')).toHaveClass(/hidden/);
  expect(await mockViolations(page)).toEqual([]);
});

test('SCR-09 zero console errors, page errors and dialogs through pause, settings and a reload', async ({ page }) => {
  const errors = collectErrors(page);
  await open(page);
  await page.locator('[data-action=pause]').click();
  await page.locator('[data-overlay=pause] [data-action=settings]').click();
  await page.locator('[data-overlay=settings] [data-action=settings-close]').click();
  await page.locator('[data-overlay=pause] [data-action=resume]').click();
  await page.reload();
  await open(page);
  expect(errors).toEqual([]);
});

test('SDK-03 startup ad: pause before ready, gameplay starts only after the resume', async ({ page }) => {
  await open(page, '?mock_startup_ad=1');
  await page.waitForFunction(() => (window as unknown as { __YA_MOCK__: { calls: Array<{ name: string }> } }).__YA_MOCK__.calls.some((c) => c.name === 'GameplayAPI.start'));
  const calls = await mockCalls(page);
  expect(calls.indexOf('event:game_api_pause')).toBeLessThan(calls.indexOf('LoadingAPI.ready'));
  expect(calls.indexOf('GameplayAPI.start')).toBeGreaterThan(calls.indexOf('event:game_api_resume'));
  const names = (await events(page)).map((e) => e.name);
  expect(names).toContain('startup_ad_start');
  expect(names).toContain('startup_ad_end');
  expect((await state(page)).pause).toEqual([]);
  expect(await mockViolations(page)).toEqual([]);
});

test('SDK-04 GameplayAPI stop on pause and start on resume, only on transitions', async ({ page }) => {
  await open(page);
  await page.locator('[data-action=pause]').click();
  expect((await state(page)).pause).toEqual(['menu']);
  await page.locator('[data-overlay=pause] [data-action=resume]').click();
  await page.locator('[data-action=pause]').click();
  await page.locator('[data-overlay=pause] [data-action=resume]').click();
  const gameplay = (await mockCalls(page)).filter((c) => c.startsWith('GameplayAPI'));
  expect(gameplay).toEqual(['GameplayAPI.start', 'GameplayAPI.stop', 'GameplayAPI.start', 'GameplayAPI.stop', 'GameplayAPI.start']);
});

test('SAV-01 coins and a creature survive F5 (debug panel actions)', async ({ page }) => {
  await open(page, '?debug=1');
  await page.getByText('debug').first().click();
  await page.getByRole('button', { name: '+100 coins' }).click();
  await page.getByRole('button', { name: '+ creature' }).click();
  await expect(page.locator('[data-hud=coins]')).toContainText('100');
  await page.waitForTimeout(2500);
  await page.reload();
  await open(page, '?debug=1');
  const s = await state(page);
  expect(s.coins).toBe(100);
  expect(s.creatures).toHaveLength(1);
  await expect(page.locator('[data-hud=coins]')).toContainText('100');
  expect(await mockViolations(page)).toEqual([]);
});

test('SAV-05 a corrupted save gives a fresh profile, no crash', async ({ page }) => {
  const errors = collectErrors(page);
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('corrupted-once')) {
      sessionStorage.setItem('corrupted-once', '1');
      localStorage.setItem('anomaly-shop:save', '{"v":1,"rev":');
    }
  });
  await open(page);
  expect((await state(page)).coins).toBe(0);
  expect((await events(page)).some((e) => e.name === 'save_corrupted')).toBe(true);
  expect(errors).toEqual([]);
});

test('SDK-05 LOC-03 language from the SDK: en → English UI, uk → Russian', async ({ page }) => {
  await open(page, '?mock_lang=en');
  expect(await page.evaluate(() => document.documentElement.lang)).toBe('en');
  await expect(page.locator('[data-tab=eggs] .nav-label')).toHaveText('Eggs');
  await page.locator('[data-action=pause]').click();
  await expect(page.locator('[data-overlay=pause] h2')).toHaveText(await translated(page, 'pause.title'));
  const text = await page.locator('[data-overlay=pause]').innerText();
  expect(text.replace(/ВКонтакте/g, '')).not.toMatch(/[Ѐ-ӿ]/);
  await open(page, '?mock_lang=uk');
  expect(await page.evaluate(() => document.documentElement.lang)).toBe('ru');
  await expect(page.locator('[data-tab=eggs] .nav-label')).toHaveText('Яйца');
});

test('LOC-05 manual language choice wins over the platform language and survives F5', async ({ page }) => {
  await open(page, '?mock_lang=ru');
  await page.locator('[data-action=pause]').click();
  await page.locator('[data-overlay=pause] [data-action=settings]').click();
  await page.locator('[data-overlay=settings] [data-action=lang-en]').click();
  await expect(page.locator('[data-tab=eggs] .nav-label')).toHaveText('Eggs');
  await page.waitForTimeout(500);
  await page.reload();
  await open(page, '?mock_lang=ru');
  expect(await page.evaluate(() => document.documentElement.lang)).toBe('en');
});

test('CNT-08 community buttons open the game.json addresses in a new tab, no reward, game paused', async ({ page, context }) => {
  await context.route(/^https:\/\/(t\.me|vk\.ru)\//, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<html><body>ok</body></html>' }));
  await open(page);
  await page.locator('[data-action=pause]').click();
  for (const [network, url] of [['telegram', game.community.telegram], ['vk', game.community.vk]] as const) {
    const [popup] = await Promise.all([context.waitForEvent('page'), page.locator(`[data-overlay=pause] [data-action=community-${network}]`).click()]);
    expect(popup.url()).toBe(url);
    expect(await popup.evaluate(() => window.opener === null)).toBe(true);
    await popup.close();
  }
  const s = await state(page);
  expect(s.coins).toBe(0);
  expect(s.pause).toContain('menu');
  const opened = (await events(page)).filter((e) => e.name === 'community_open').map((e) => e.params?.network);
  expect(opened).toEqual(['telegram', 'vk']);
  expect(await page.locator('a[href]').count()).toBe(0);
});

test('SCR-01 1280×720: the top bar, «Лавка», the tab bar, pause and settings windows fit the screen', async ({ page }) => {
  await open(page);
  await expectNoPageScroll(page);
  // MU-03: the community buttons live in the pause and the settings (s6-pause); «Лавка» keeps its scene buttons.
  await expectInsideViewport(page, ['[data-hud=coins]', '[data-action=pause]', '.home-ui [data-action=work]', '#nav']);
  await page.locator('[data-action=pause]').click();
  await expectInsideViewport(page, ['[data-overlay=pause] .card', '[data-overlay=pause] [data-action=resume]', '[data-overlay=pause] [data-action=community-vk]']);
  await page.locator('[data-overlay=pause] [data-action=settings]').click();
  await expectInsideViewport(page, ['[data-overlay=settings] .card', '[data-overlay=settings] [data-action=settings-close]', '[data-overlay=settings] [data-action=lang-en]']);
});
