import { expect, test, type Frame, type Page } from '@playwright/test';
import { seedSave } from './helpers.ts';

/**
 * V «Выход на VK и ОК» (Ресейл 16), P «Доводка» (Ресейл 17): the published site of build:pages (dist-pages: the VK and OK build in vk/)
 * served static; the game on the bridge stand-in (?mock=vk). Every check taps like a finger; no test API in this build. P-06: no link
 * and no way out of the game's own address (VK 4.2.3, OK 5.1).
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
    // A host page holds the game in a frame of the size VK gives it.
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
      for (const a of ['menu-play', 'menu-sound', 'menu-music', 'menu-help']) await whole(page, `[data-action=${a}]`);
      // P-07: «Музыка» apart from «Звук».
      const music = page.locator('[data-action=menu-music]');
      await expect(music).toHaveText('Музыка: вкл');
      await music.tap();
      await expect(music).toHaveText('Музыка: выкл');
      await expect(page.locator('[data-action=menu-sound]')).toHaveText(/Звук: вкл/);
      await music.tap();
      await expect(music).toHaveText('Музыка: вкл');
      // The loading said how far it was.
      await expect(page.locator('[data-boot-progress]')).toHaveText(/100/);
      // Sound off and on from the menu.
      const sound = page.locator('[data-action=menu-sound]');
      const was = await sound.getAttribute('aria-pressed');
      await sound.tap();
      await expect(sound).not.toHaveAttribute('aria-pressed', was!);
      await sound.tap();
      await expect(sound).toHaveAttribute('aria-pressed', was!);
      // Help: how to play and the community as the support channel; P-06: no document link (VK's own documents, chosen in its panel).
      await page.locator('[data-action=menu-help]').tap();
      await expect(page.locator('[data-overlay=menu] .menu-how li')).toHaveCount(4);
      await whole(page, '[data-action=menu-join]');
      await expect(page.locator('[data-overlay=menu] a')).toHaveCount(0);
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

/** The green ring of the first minute's hint (a scene spot) — the finger taps its middle. */
async function tapRing(page: Page) {
  const ring = page.locator('.hint-ring');
  await expect(ring).toBeVisible({ timeout: 15_000 });
  const r = (await ring.boundingBox())!;
  await page.touchscreen.tap(r.x + r.width / 2, r.y + r.height / 2);
}
const navTop = (page: Page) => page.evaluate(() => document.querySelector('#nav')!.getBoundingClientRect().top);

for (const size of [
  { width: 815, height: 290 },
  { width: 812, height: 330 },
]) {
  const tag = `${size.width}x${size.height}`;
  test.describe(`${tag} P-01`, () => {
    test.use({ viewport: size, isMobile: true, hasTouch: true });

    test(`P-01 «Помощь» whole over the tab bar; «Назад» answers the first tap; a tap at the window's edge is no tab @ ${tag}`, async ({ page }) => {
      const w = watch(page);
      await page.goto(`/${VK}`);
      await up(page);
      await page.locator('[data-action=menu-help]').tap();
      const card = (await page.locator('[data-overlay=menu] > .card').boundingBox())!;
      const bar = await navTop(page);
      expect(card.y, 'the window from the top edge').toBeGreaterThanOrEqual(0);
      expect(card.y + card.height, 'the window ends over the tab bar').toBeLessThanOrEqual(bar);
      await whole(page, '[data-action=menu-back]');
      // The lowest row of the window under the finger (left of «Назад»): still the window, not a tab under it.
      await page.touchscreen.tap(card.x + 40, card.y + card.height - 3);
      await expect(page.locator('[data-overlay=menu] .menu-how')).toBeVisible();
      await page.locator('[data-action=menu-back]').tap();
      await expect(page.locator('[data-action=menu-play]')).toBeVisible();
      await page.screenshot({ path: `test-results/vk-help-${tag}.png` });
      expect(w.errors).toEqual([]);
    });
  });
}

test.describe('815x290 P-01 menu, loading, toast, join', () => {
  test.use({ viewport: { width: 815, height: 290 }, isMobile: true, hasTouch: true });

  test('P-01 ☰ over the dim: one tap closes «Вылупился!» (the pet goes to the storage) or any window and opens the menu', async ({ page }) => {
    const w = watch(page);
    await page.goto(`/${VK}`);
    await up(page);
    await page.locator('[data-action=menu-play]').tap();
    await tapRing(page);
    await expect(page.locator('[data-overlay=hatch]')).toBeVisible();
    await whole(page, '[data-action=menu-float]');
    await page.locator('[data-action=menu-float]').tap();
    await expect(page.locator('[data-overlay=menu]')).toBeVisible();
    await expect(page.locator('[data-overlay=hatch]')).toBeHidden();
    await page.locator('[data-action=menu-play]').tap();
    // The pet waits in «Склад».
    await page.locator('[data-tab=inventory]').tap();
    await expect(page.locator('[data-sheet=inventory] .tile').first()).toBeVisible();
    // A window of the scene («Подработка») and a screen (the gifts): the same one tap.
    await page.locator('[data-tab=home]').tap();
    for (const open of ['[data-action=gifts]', '.hud [aria-label^="Уровень"]']) {
      await page.locator(open).first().tap();
      await expect(page.locator('.overlay:not([hidden]):not(.under)').first()).toBeVisible();
      const float = page.locator('[data-action=menu-float]');
      await ((await float.isVisible()) ? float : page.locator('.hud [data-action=menu]')).tap();
      await expect(page.locator('[data-overlay=menu]')).toBeVisible();
      await expect(page.locator('.overlay:not([hidden]):not([data-overlay=menu])')).toHaveCount(0);
      await page.locator('[data-action=menu-play]').tap();
    }
    expect(w.errors).toEqual([]);
  });

  test('P-01 on a slow network the percent of the loading grows from the first bytes, step by step, to 100', async ({ page }) => {
    test.setTimeout(120_000);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 160 * 1024, uploadThroughput: 64 * 1024 });
    const t0 = Date.now();
    await page.goto(`/${VK}`, { waitUntil: 'commit' });
    const seen: Array<{ t: number; n: number }> = [];
    while (Date.now() - t0 < 60_000) {
      const n = await page.evaluate(() => {
        const t = document.querySelector('[data-boot-progress]')?.textContent ?? '';
        const m = /(\d+)/.exec(t);
        return m ? Number(m[1]) : -1;
      }).catch(() => -1);
      if (n >= 0 && (!seen.length || seen.at(-1)!.n !== n)) seen.push({ t: Date.now() - t0, n });
      if (n === 100) break;
      await page.waitForTimeout(100);
    }
    console.log(`P-01 loading: ${seen.map((s) => `${(s.t / 1000).toFixed(1)}s ${s.n}%`).join(', ')}`);
    expect(seen[0]!.t, 'the percent from the first second').toBeLessThan(2500);
    expect(seen.at(-1)!.n).toBe(100);
    for (let i = 1; i < seen.length; i++) expect(seen[i]!.n, 'never back').toBeGreaterThan(seen[i - 1]!.n);
    // Step by step: no jump over a third of the way, at least 8 steps under 100.
    expect(seen.filter((s) => s.n < 100).length).toBeGreaterThanOrEqual(8);
    const before = seen.filter((s) => s.n < 70);
    expect(before.length, 'the bytes of the code counted').toBeGreaterThanOrEqual(5);
    for (let i = 1; i < seen.length; i++) expect(seen[i]!.n - seen[i - 1]!.n, `${seen[i - 1]!.n} → ${seen[i]!.n}`).toBeLessThanOrEqual(34);
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    await up(page);
  });

  test('P-01 the toast «Покупатель пишет…» stands whole over the tab bar', async ({ page }) => {
    test.setTimeout(90_000);
    const w = watch(page);
    await page.goto(`/${VK}`);
    await up(page);
    await page.locator('[data-action=menu-play]').tap();
    await tapRing(page);
    await page.locator('[data-overlay=hatch] [data-action=hatch-shop]').tap({ timeout: 10_000 });
    await expect(page.locator('[data-overlay=hatch]')).toBeHidden();
    // The buyer takes the pet into the chat: the place on the shelf is a «+».
    await expect(page.locator('[data-tab=chats] [data-badge]')).toBeVisible({ timeout: 40_000 });
    await page.waitForTimeout(600);
    await page.locator('[data-action=shelf-add]').first().tap();
    const toast = page.locator('.toast').first();
    await expect(toast).toBeVisible();
    await expect(toast).toContainText('Покупатель пишет');
    const r = (await toast.boundingBox())!;
    expect(r.y).toBeGreaterThanOrEqual(0);
    expect(r.x).toBeGreaterThanOrEqual(0);
    expect(r.x + r.width).toBeLessThanOrEqual(815);
    expect(r.y + r.height, 'the toast over the tab bar').toBeLessThanOrEqual(await navTop(page));
    await page.screenshot({ path: 'test-results/vk-toast-815x290.png' });
    expect(w.errors).toEqual([]);
  });

  test('P-01 after the gift for joining, «Помощь» and «Подарки» say «Уже в сообществе» instead of «Вступить»', async ({ page }) => {
    const w = watch(page);
    await page.goto(`/${VK}`);
    await up(page);
    await page.locator('[data-action=menu-help]').tap();
    await page.locator('[data-action=menu-join]').tap();
    await page.locator('[data-vk-mock=yes]').tap();
    await expect(page.locator('[data-action=menu-joined]')).toHaveText('Уже в сообществе');
    await expect(page.locator('[data-action=menu-join]')).toHaveCount(0);
    await page.locator('[data-action=menu-back]').tap();
    await page.locator('[data-action=menu-play]').tap();
    await page.locator('[data-action=gifts]').tap();
    await expect(page.locator('[data-gift=group] [aria-disabled=true]')).toHaveText('Уже в сообществе');
    await expect(page.locator('[data-action=gift-join]')).toHaveCount(0);
    expect(w.errors).toEqual([]);
  });
});

for (const site of ['vk', 'ok'] as const)
  test.describe(`815x290 P-06 ${site}`, () => {
    test.use({ viewport: { width: 815, height: 290 }, isMobile: true, hasTouch: true });

    test(`P-06 no link and no way out of the game's address on ${site.toUpperCase()}: the menu, «Помощь», the settings, «Подарки», every tab`, async ({ page, context }) => {
      const w = watch(page);
      const away: string[] = [];
      context.on('page', (p) => away.push(`popup ${p.url()}`));
      page.on('framenavigated', (f) => {
        if (f === page.mainFrame() && !f.url().startsWith('http://127.0.0.1') ) away.push(f.url());
      });
      await page.addInitScript(() => {
        const opened: string[] = [];
        (window as unknown as { __opened: string[] }).__opened = opened;
        window.open = ((u?: string | URL) => {
          opened.push(String(u));
          return null;
        }) as typeof window.open;
      });
      const links = () => page.evaluate(() => [...document.querySelectorAll('a[href], area[href], form[action]')].map((a) => a.outerHTML.slice(0, 120)));
      await page.goto(`/${VK}${site === 'ok' ? '&vk_client=ok&vk_platform=mobile_web' : ''}`);
      const home = page.url();
      await up(page);
      expect(await links()).toEqual([]);
      await page.locator('[data-action=menu-help]').tap();
      expect(await links()).toEqual([]);
      for (const b of await page.locator('[data-overlay=menu] .card button').all()) {
        if ((await b.getAttribute('data-action')) === 'menu-back') continue;
        await b.tap({ timeout: 3000 }).catch(() => undefined);
        const no = page.locator('[data-vk-mock=no]');
        if (await no.isVisible().catch(() => false)) await no.tap();
      }
      await page.locator('[data-action=menu-back]').tap();
      await page.locator('[data-action=menu-settings]').tap();
      await expect(page.locator('[data-overlay=settings]')).toBeVisible();
      expect(await links()).toEqual([]);
      await page.locator('[data-overlay=settings] [data-action=settings-close]').tap();
      await page.locator('[data-action=menu-play]').tap();
      await page.locator('[data-action=gifts]').tap();
      expect(await links()).toEqual([]);
      await page.locator('[data-action=gifts-close]').first().tap({ timeout: 3000 }).catch(() => undefined);
      for (const tab of await page.locator('#nav [data-tab]').all()) {
        await tab.tap({ timeout: 3000 }).catch(() => undefined);
        expect(await links()).toEqual([]);
      }
      expect(await page.evaluate(() => (window as unknown as { __opened: string[] }).__opened)).toEqual([]);
      expect(away).toEqual([]);
      expect(page.url()).toBe(home);
      expect(w.outside).toEqual([]);
      expect(w.errors).toEqual([]);
    });
  });
