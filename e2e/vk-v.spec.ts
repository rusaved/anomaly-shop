import { expect, test, type Frame, type Page } from '@playwright/test';
import { seedSave } from './helpers.ts';

/**
 * V «Выход на VK и ОК» (Ресейл 16): the published site of build:pages (dist-pages: the VK and OK build in vk/, the terms and privacy
 * in legal/) served static; the game on the bridge stand-in (?mock=vk). Every check taps like a finger; no test API in this build.
 */
const VK = 'vk/?mock=vk';
type Calls = { __VK_MOCK__?: { calls: Array<{ method: string; params?: Record<string, unknown> }> } };

function watch(page: Page) {
  const errors: string[] = [];
  const outside: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => {
    errors.push(`dialog ${d.message()}`);
    void d.dismiss();
  });
  page.on('request', (r) => {
    const u = r.url();
    if (!u.startsWith('http://127.0.0.1') && !u.startsWith('data:') && !u.startsWith('blob:') && !u.startsWith('about:')) outside.push(u);
  });
  return { errors, outside };
}
/** The game is up: the preloader gone and the start menu shown. */
async function up(f: Page | Frame) {
  await expect(f.locator('#preloader')).toHaveClass(/hidden/, { timeout: 30_000 });
  await expect(f.locator('[data-overlay=menu]')).toBeVisible();
}
/** A box whole in the viewport, nothing on its middle. */
async function whole(page: Page, sel: string) {
  const b = await page.evaluate((q) => {
    const el = [...document.querySelectorAll<HTMLElement>(q)].find((e) => e.offsetParent !== null);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, w: innerWidth, h: innerHeight, mine: Boolean(hit && (hit === el || el.contains(hit))) };
  }, sel);
  expect(b, `${sel} on screen`).not.toBeNull();
  expect(b!.top >= 0 && b!.left >= 0 && b!.bottom <= b!.h + 0.5 && b!.right <= b!.w + 0.5, `${sel} whole in ${b!.w}×${b!.h}`).toBe(true);
  expect(b!.mine, `${sel} not covered`).toBe(true);
}
const text = (page: Page | Frame) => page.locator('body').innerText();

for (const size of [
  { width: 1000, height: 600 },
  { width: 630, height: 600 },
]) {
  test(`V-09 in an iframe ${size.width}×${size.height} like VK on a computer: boots, the menu whole, no outside request, no error`, async ({ page, baseURL }) => {
    const w = watch(page);
    await page.setViewportSize({ width: size.width + 40, height: size.height + 40 });
    // A host page of the same server holds the game in a frame of the size VK gives it.
    await page.goto('/legal/terms.html');
    await page.setContent(`<body style="margin:0;background:#edeef0"><iframe id="g" src="${baseURL}${VK}" style="border:0;margin:20px;width:${size.width}px;height:${size.height}px"></iframe></body>`);
    const frame = page.frameLocator('#g');
    await expect(frame.locator('#preloader')).toHaveClass(/hidden/, { timeout: 30_000 });
    await expect(frame.locator('[data-action=menu-play]')).toBeVisible();
    await frame.locator('[data-action=menu-play]').click();
    await expect(frame.locator('[data-overlay=menu]')).toBeHidden();
    await expect(frame.locator('[data-action=menu]')).toBeVisible();
    await page.screenshot({ path: `test-results/vk-iframe-${size.width}x${size.height}.png` });
    expect(w.errors).toEqual([]);
    expect(w.outside).toEqual([]);
  });
}

for (const size of [
  { width: 815, height: 290 },
  { width: 880, height: 405 },
]) {
  const tag = `${size.width}x${size.height}`;
  test.describe(`${tag}`, () => {
    test.use({ viewport: size, isMobile: true, hasTouch: true });

    test(`V-02, V-04 the start menu «Играть · Звук · Помощь», back to it from any screen, Russian only, no purchases @ ${tag}`, async ({ page }) => {
      const w = watch(page);
      await page.goto(`/${VK}`);
      await up(page);
      // VKWebAppInit was the first call of the bridge.
      const calls = await page.evaluate(() => (window as unknown as Calls).__VK_MOCK__!.calls.map((c) => c.method));
      expect(calls[0]).toBe('VKWebAppInit');
      for (const a of ['menu-play', 'menu-sound', 'menu-help']) await whole(page, `[data-action=${a}]`);
      // The loading said how far it was.
      await expect(page.locator('[data-boot-progress]')).toHaveText(/100/);
      // Sound off and on from the menu.
      const sound = page.locator('[data-action=menu-sound]');
      const was = await sound.getAttribute('aria-pressed');
      await sound.tap();
      await expect(sound).not.toHaveAttribute('aria-pressed', was!);
      await sound.tap();
      await expect(sound).toHaveAttribute('aria-pressed', was!);
      // Help: how to play, the community as the support channel, the terms and privacy next to the game.
      await page.locator('[data-action=menu-help]').tap();
      await expect(page.locator('[data-overlay=menu] .menu-how li')).toHaveCount(4);
      await whole(page, '[data-action=menu-join]');
      for (const [a, file] of [
        ['menu-terms', 'terms.html'],
        ['menu-privacy', 'privacy.html'],
      ] as const) {
        const href = await page.locator(`[data-action=${a}]`).getAttribute('href');
        expect(href).toBe(`../legal/${file}`);
        const res = await page.request.get(new URL(href!, page.url()).toString());
        expect(res.status()).toBe(200);
        const body = await res.text();
        expect(body).toContain('Sunhearth');
        expect(body).toContain('{{ОПЕРАТОР}}');
      }
      await page.locator('[data-action=menu-back]').tap();
      await page.locator('[data-action=menu-play]').tap();
      await expect(page.locator('[data-overlay=menu]')).toBeHidden();
      // From a tab and from a window: the menu button of the top bar brings the menu back.
      await page.locator('[data-tab=eggs]').tap();
      await page.locator('[data-action=menu]').tap();
      await expect(page.locator('[data-overlay=menu]')).toBeVisible();
      await page.locator('[data-action=menu-settings]').tap();
      await expect(page.locator('[data-overlay=settings]')).toBeVisible();
      // Russian only: no language choice; no purchases: no «Акции», no prices in money.
      await expect(page.locator('[data-overlay=settings] [data-i18n="settings.language"]')).toBeHidden();
      // The settings close back to the menu.
      await page.locator('[data-overlay=settings] [data-action=settings-close]').tap();
      await expect(page.locator('[data-overlay=menu]')).toBeVisible();
      await page.locator('[data-action=menu-play]').tap();
      await page.locator('[data-tab=home]').tap();
      await expect(page.locator('[data-sub=upgrades]').first()).toBeVisible();
      await expect(page.locator('[data-sub=deals]')).toHaveCount(0);
      const all = await text(page);
      expect(all).not.toMatch(/₽|голос|ОК-?и|Яндекс|Telegram|ВКонтакте|Одноклассник/);
      await page.screenshot({ path: `test-results/vk-menu-${tag}.png` });
      expect(w.errors).toEqual([]);
      expect(w.outside).toEqual([]);
    });

    test(`V-04 OK by the launch parameters: the group, never the name of VK @ ${tag}`, async ({ page }) => {
      const w = watch(page);
      await page.goto(`/${VK}&vk_client=ok&vk_platform=mobile_web`);
      await up(page);
      await page.locator('[data-action=menu-help]').tap();
      const help = await page.locator('[data-overlay=menu]').innerText();
      expect(help).toMatch(/групп/);
      expect(help).not.toMatch(/сообществ|ВКонтакте|VK/);
      expect(w.errors).toEqual([]);
    });
  });
}

test.describe('815x290 ads and joining', () => {
  test.use({ viewport: { width: 815, height: 290 }, isMobile: true, hasTouch: true });

  test('V-05 no video loaded — no ad button at all; loaded — the button, the reward only after the end', async ({ page }) => {
    const w = watch(page);
    await page.goto(`/${VK}&mock_ads=none`);
    await up(page);
    await page.locator('[data-action=menu-play]').tap();
    await page.locator('[data-tab=eggs]').tap();
    await page.waitForTimeout(1200);
    expect(await page.locator('.btn-ad').evaluateAll((l) => l.filter((e) => (e as HTMLElement).offsetParent !== null).length)).toBe(0);
    // In the first minute's lessons no ad button either, even with a video loaded.
    await page.goto(`/${VK}`);
    await up(page);
    await page.locator('[data-action=menu-play]').tap();
    await page.locator('[data-tab=eggs]').tap();
    await page.waitForTimeout(1200);
    expect(await page.locator('.btn-ad').evaluateAll((l) => l.filter((e) => (e as HTMLElement).offsetParent !== null).length)).toBe(0);
    // Past the first minute, with videos: the ad buttons show; no ad came at launch (no ShowNativeAds call so far).
    await seedSave(page);
    await page.goto(`/${VK}`);
    await up(page);
    await page.locator('[data-action=menu-play]').tap();
    await page.locator('[data-tab=eggs]').tap();
    await expect(page.locator('[data-sheet=eggs] .btn-ad').first()).toBeVisible({ timeout: 10_000 });
    const shows = () => page.evaluate(() => (window as unknown as Calls).__VK_MOCK__!.calls.filter((c) => c.method === 'VKWebAppShowNativeAds'));
    expect(await shows()).toEqual([]);
    const before = await page.locator('[data-sheet=eggs] [data-section=my] > *').count();
    await page.locator('[data-sheet=eggs] [data-action^=ad-egg-]').first().tap();
    await expect(page.locator('[data-vk-mock=window]')).toBeVisible();
    await expect(page.locator('[data-vk-mock=window]')).toBeHidden({ timeout: 10_000 });
    const s = await shows();
    expect(s).toHaveLength(1);
    expect(s[0]!.params).toEqual({ ad_format: 'reward', use_waterfall: false });
    await expect.poll(() => page.locator('[data-sheet=eggs] [data-section=my] > *').count()).toBeGreaterThan(before);
    expect(w.errors).toEqual([]);
  });

  test('V-08 «Вступить в сообщество» in «Подарки»: the egg once and only for a join; a «no» hides the card', async ({ page }) => {
    const w = watch(page);
    await page.goto(`/${VK}`);
    await up(page);
    await page.locator('[data-action=menu-play]').tap();
    // No join window at launch.
    expect(await page.locator('[data-vk-mock=window]').count()).toBe(0);
    await page.locator('[data-action=gifts]').tap();
    const join = page.locator('[data-action=gift-join]');
    await expect(join).toBeVisible();
    await expect(page.locator('[data-gift=review]')).toHaveCount(0);
    // «Отмена»: no egg, the card rests.
    await join.tap();
    await page.locator('[data-vk-mock=no]').tap();
    await expect(page.locator('[data-gift=group]')).toHaveCount(0);
    // Next visit a month later the card is back (the «no» is a month old): join — the egg, once.
    await page.evaluate(() => localStorage.setItem('anomaly-shop:vk_join_no', String(Date.now() - 31 * 86_400_000)));
    await page.reload();
    await up(page);
    await page.locator('[data-action=menu-play]').tap();
    await page.locator('[data-action=gifts]').tap();
    await page.locator('[data-action=gift-join]').tap();
    const calls = await page.evaluate(() => (window as unknown as Calls).__VK_MOCK__!.calls.filter((c) => c.method === 'VKWebAppJoinGroup'));
    expect(calls).toHaveLength(1);
    await page.locator('[data-vk-mock=yes]').tap();
    await expect(page.locator('[data-gift=group] [aria-disabled=true]')).toBeVisible();
    await expect(page.locator('[data-action=gift-join]')).toHaveCount(0);
    expect(w.errors).toEqual([]);
  });
});

test.describe('880x405 first minute', () => {
  test.use({ viewport: { width: 880, height: 405 }, isMobile: true, hasTouch: true });

  test('V-11 a bot plays the first minute of dist-vk by the hints alone: an egg, a pet, a sale; no ad shows; the save goes to VK Storage', async ({ page }) => {
    test.setTimeout(150_000);
    const w = watch(page);
    await page.goto(`/${VK}`);
    await up(page);
    await page.locator('[data-action=menu-play]').tap();
    const t0 = Date.now();
    const seen = new Set<string>();
    // Each step: tap what the hint rings or frames (a scene spot or a button), else what the finger shows; then a short pause.
    while (Date.now() - t0 < 75_000) {
      const spot = await page.evaluate(() => {
        const vis = (e: Element | null) => e && (e as HTMLElement).offsetParent !== null && e.getBoundingClientRect().width > 0;
        const ring = document.querySelector('.hint-ring');
        const btn = [...document.querySelectorAll('.is-hinted')].find(vis);
        const finger = document.querySelector('.tap-finger:not([hidden])');
        const el = btn ?? (vis(ring) ? ring : vis(finger) ? finger : null);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2, key: (document.querySelector('.hint') as HTMLElement | null)?.innerText ?? '' };
      });
      if (spot) {
        seen.add(spot.key);
        await page.touchscreen.tap(spot.x, spot.y);
      } else {
        // No hint: the hatch window or a chat — the main button of the top window, else wait.
        const main = page.locator('.overlay:not([hidden]) .mu-btn.main, .overlay:not([hidden]) .btn-primary, [data-overlay=hatch]:not([hidden]) [data-action=hatch-shop]').first();
        if (await main.isVisible().catch(() => false)) await main.tap().catch(() => undefined);
      }
      await page.waitForTimeout(400);
      if (await page.locator('[data-vk-mock=window]').isVisible()) break;
    }
    expect(await page.locator('[data-vk-mock=window]').count(), 'no ad in the first minute').toBe(0);
    const coins = Number((await page.locator('.hud-coins-value').innerText()).replace(/\D/g, ''));
    await page.screenshot({ path: `test-results/vk-bot-880x405.png` });
    // The tab hides: the save goes to VK Storage at once.
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect.poll(() => page.evaluate(() => localStorage.getItem('vkmock:save') ?? ''), { timeout: 10_000 }).toContain('"n"');
    console.log(`V-11 bot: hints ${[...seen].filter(Boolean).length}, coins ${coins}`);
    expect(seen.size, 'the hints led the way').toBeGreaterThan(1);
    expect(w.errors).toEqual([]);
    expect(w.outside).toEqual([]);
  });
});
