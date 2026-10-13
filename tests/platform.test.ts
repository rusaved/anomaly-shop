import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { guessDevice, once, pickLanguage, pickNewestSave, saveStamp } from '../src/platform/shared.ts';
import { createMirror, memoryStorage } from '../src/platform/storage.ts';
import { createNullPlatform } from '../src/platform/null.ts';
import { createYandexPlatform, type YandexDeps } from '../src/platform/yandex.ts';
import { createYoutubePlatform, type YtGame, type YoutubeDeps } from '../src/platform/youtube.ts';

/** Platform profiles on fake SDKs (docs/02-tech.md, section 10): the Yandex one runs against the real mock in Node. */
const CAPS = { ads: true, payments: false, community: true, analytics: false };
const LANGS = ['ru', 'en'] as const;
const RU_FALLBACK = ['ru', 'be', 'kk', 'uk', 'uz'];

type MockWindow = {
  location: { search: string };
  setTimeout: typeof setTimeout;
  clearTimeout: typeof clearTimeout;
  console: Console;
  localStorage: ReturnType<typeof memoryStorage>;
  YaGames?: { init(): Promise<import('ysdk').SDK> };
  __YA_MOCK__?: {
    calls: Array<{ name: string }>;
    violations: string[];
    readyCalled: boolean;
    sdk: { dispatchEvent(name: string): Promise<unknown>; gameplayState(): string };
    playerData: Record<string, unknown>;
  };
};

function loadMock(search: string): MockWindow {
  const code = readFileSync(resolve(__dirname, '../dev/yasdk-mock/sdk.js'), 'utf8');
  const win: MockWindow = { location: { search }, setTimeout, clearTimeout, console, localStorage: memoryStorage() };
  new Function('window', code)(win);
  return win;
}

function yandexDeps(win: MockWindow, over: Partial<YandexDeps> = {}): YandexDeps {
  return {
    sdkInit: win.YaGames ? () => win.YaGames!.init() : null,
    storage: memoryStorage(),
    languageCode: 'de',
    device: 'desktop',
    now: () => 1000,
    caps: CAPS,
    prefix: 'anomaly-shop',
    track: () => undefined,
    ...over,
  };
}

describe('platform helpers', () => {
  it('LOC-03 language: ru for ru, be, kk, uk, uz; en otherwise', () => {
    for (const code of ['ru', 'ru-RU', 'be', 'kk', 'uk', 'uz-UZ']) expect(pickLanguage(code, RU_FALLBACK, LANGS, 'en')).toBe('ru');
    for (const code of ['en', 'en-US', 'de', 'tr', '', undefined, null]) expect(pickLanguage(code, RU_FALLBACK, LANGS, 'en')).toBe('en');
  });

  it('device from user agent and touch', () => {
    expect(guessDevice({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148', touchPoints: 5, width: 375, height: 812 })).toBe('mobile');
    expect(guessDevice({ userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile Safari/537.36', touchPoints: 5, width: 412, height: 915 })).toBe('mobile');
    expect(guessDevice({ userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-X910) Safari/537.36', touchPoints: 5, width: 1280, height: 800 })).toBe('tablet');
    expect(guessDevice({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15', touchPoints: 5, width: 1024, height: 1366 })).toBe('tablet');
    expect(guessDevice({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130', touchPoints: 0, width: 1920, height: 1080 })).toBe('desktop');
  });

  it('newest save: bigger rev, then later savedAt; corrupted text loses', () => {
    const a = JSON.stringify({ v: 1, rev: 3, savedAt: 100 });
    const b = JSON.stringify({ v: 1, rev: 3, savedAt: 200 });
    const c = JSON.stringify({ v: 1, rev: 5, savedAt: 50 });
    expect(pickNewestSave([a, b])).toBe(b);
    expect(pickNewestSave([b, a])).toBe(b);
    expect(pickNewestSave([a, c])).toBe(c);
    expect(pickNewestSave(['{broken', a])).toBe(a);
    expect(pickNewestSave([null, undefined, '{broken'])).toBeNull();
    expect(saveStamp('[]')).toBeNull();
  });

  it('mirror never throws and prefixes keys', () => {
    const backend = memoryStorage();
    const m = createMirror(backend, 'anomaly-shop');
    expect(m.set('save', 'x')).toBe(true);
    expect(backend.getItem('anomaly-shop:save')).toBe('x');
    expect(m.get('save')).toBe('x');
    const broken = createMirror({ getItem: () => { throw new Error('quota'); }, setItem: () => { throw new Error('quota'); }, removeItem: () => undefined }, 'p');
    expect(broken.set('a', '1')).toBe(false);
    expect(broken.get('a')).toBeNull();
    expect(createMirror(null, 'p').set('a', '1')).toBe(false);
  });

  it('once() runs the function one time', () => {
    const fn = vi.fn();
    const run = once(fn);
    run();
    run();
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('null profile', () => {
  it('starts without any SDK, saves to the mirror, language from the browser', async () => {
    const storage = memoryStorage();
    const p = createNullPlatform({ storage, languageCode: 'uk-UA', device: 'mobile', now: () => 42, caps: { ...CAPS, ads: false }, prefix: 'anomaly-shop' });
    await p.init();
    expect(p.name).toBe('null');
    expect(p.language()).toBe('ru');
    expect(await p.load()).toBeNull();
    p.save('{"v":1,"rev":1,"savedAt":42}');
    expect(await p.load()).toBe('{"v":1,"rev":1,"savedAt":42}');
    expect(storage.getItem('anomaly-shop:save')).not.toBeNull();
    expect(await p.showInterstitial('shop')).toEqual({ shown: false });
    expect(await p.showRewarded('deal_x2')).toEqual({ rewarded: false });
    expect(p.now()).toBe(42);
    p.ready();
    p.ready();
  });
});

describe('yandex profile on the SDK mock', () => {
  it('SDK-05 language and device come from the SDK; ready() reaches the SDK exactly once', async () => {
    const win = loadMock('?mock_lang=en&mock_device=mobile');
    const p = createYandexPlatform(yandexDeps(win, { languageCode: 'ru' }));
    await p.init();
    expect(p.language()).toBe('en');
    expect(p.device).toBe('mobile');
    p.ready();
    p.ready();
    expect(win.__YA_MOCK__!.calls.filter((c) => c.name === 'LoadingAPI.ready')).toHaveLength(1);
    expect(win.__YA_MOCK__!.violations).toEqual([]);
  });

  it('SDK-04 GameplayAPI start/stop only on transitions', async () => {
    const win = loadMock('');
    const p = createYandexPlatform(yandexDeps(win));
    await p.init();
    p.gameplayStart();
    p.gameplayStart();
    p.gameplayStop();
    p.gameplayStop();
    p.gameplayStart();
    const names = win.__YA_MOCK__!.calls.map((c) => c.name).filter((n) => n.startsWith('GameplayAPI'));
    expect(names).toEqual(['GameplayAPI.start', 'GameplayAPI.stop', 'GameplayAPI.start']);
  });

  it('SDK-03 game_api_pause/resume reach the callbacks (subscribed during init, before ready)', async () => {
    const win = loadMock('');
    const p = createYandexPlatform(yandexDeps(win));
    const paused = vi.fn();
    const resumed = vi.fn();
    p.onPause(paused);
    p.onResume(resumed);
    await p.init();
    const subscribed = win.__YA_MOCK__!.calls.findIndex((c) => c.name === 'on');
    expect(subscribed).toBeGreaterThanOrEqual(0);
    expect(win.__YA_MOCK__!.calls.some((c) => c.name === 'LoadingAPI.ready')).toBe(false);
    await win.__YA_MOCK__!.sdk.dispatchEvent('game_api_pause');
    await win.__YA_MOCK__!.sdk.dispatchEvent('game_api_resume');
    expect(paused).toHaveBeenCalledTimes(1);
    expect(resumed).toHaveBeenCalledTimes(1);
  });

  it('SAV-01 save goes to the mirror and the cloud; load picks the newest of the two', async () => {
    const win = loadMock('');
    const storage = memoryStorage();
    const p = createYandexPlatform(yandexDeps(win, { storage }));
    await p.init();
    expect(await p.load()).toBeNull();
    const s1 = JSON.stringify({ v: 1, rev: 1, savedAt: 10 });
    p.save(s1);
    await new Promise((r) => setTimeout(r, 0));
    expect(storage.getItem('anomaly-shop:save')).toBe(s1);
    expect(win.__YA_MOCK__!.playerData).toEqual({ save: s1 });
    expect(await p.load()).toBe(s1);
    const s2 = JSON.stringify({ v: 1, rev: 2, savedAt: 20 });
    storage.setItem('anomaly-shop:save', s2);
    expect(await p.load()).toBe(s2);
    storage.setItem('anomaly-shop:save', '{broken');
    expect(await p.load()).toBe(s1);
    expect(win.__YA_MOCK__!.calls.filter((c) => c.name === 'getPlayer')).toHaveLength(1);
  });

  it('cloud write failures are reported, the mirror still holds the save', async () => {
    const win = loadMock('?mock_save=fail');
    const storage = memoryStorage();
    const track = vi.fn();
    const p = createYandexPlatform(yandexDeps(win, { storage, track }));
    await p.init();
    p.save('{"v":1,"rev":1,"savedAt":1}');
    await new Promise((r) => setTimeout(r, 0));
    expect(track).toHaveBeenCalledWith('cloud_save_failed');
    expect(await p.load()).toBe('{"v":1,"rev":1,"savedAt":1}');
  });

  it('now() is the server time of the SDK (?mock_time_offset)', async () => {
    const win = loadMock('?mock_time_offset=86400000');
    const p = createYandexPlatform(yandexDeps(win));
    await p.init();
    expect(p.now() - Date.now()).toBeGreaterThan(86400000 - 5000);
  });

  it('ads: rewarded only from onRewarded, interstitial reports shown; disabled caps resolve at once', async () => {
    const win = loadMock('?mock_ad=closenoreward');
    const p = createYandexPlatform(yandexDeps(win));
    await p.init();
    expect(await p.showRewarded('deal_x2')).toEqual({ rewarded: false });
    const ok = loadMock('');
    const q = createYandexPlatform(yandexDeps(ok));
    await q.init();
    expect(await q.showRewarded('deal_x2')).toEqual({ rewarded: true });
    expect(await q.showInterstitial('shop')).toEqual({ shown: true });
    const err = loadMock('?mock_ad=error');
    const r = createYandexPlatform(yandexDeps(err));
    await r.init();
    expect(await r.showInterstitial('shop')).toEqual({ shown: false });
    const off = createYandexPlatform(yandexDeps(ok, { caps: { ...CAPS, ads: false } }));
    await off.init();
    expect(await off.showInterstitial('shop')).toEqual({ shown: false });
  }, 20000);

  it('without sdk.js or with a broken init() the profile keeps working like null', async () => {
    const track = vi.fn();
    const missing = createYandexPlatform(yandexDeps({ location: { search: '' } } as MockWindow, { track, languageCode: 'be' }));
    await missing.init();
    expect(track).toHaveBeenCalledWith('sdk_missing');
    expect(missing.language()).toBe('ru');
    missing.ready();
    missing.gameplayStart();
    missing.save('{"v":1,"rev":1,"savedAt":1}');
    expect(await missing.load()).toBe('{"v":1,"rev":1,"savedAt":1}');
    expect(await missing.showRewarded('x')).toEqual({ rewarded: false });

    let calls = 0;
    const flaky = createYandexPlatform(yandexDeps({ location: { search: '' } } as MockWindow, { track, sdkInit: () => { calls++; return Promise.reject(new Error('boom')); } }));
    await flaky.init();
    expect(calls).toBe(2);
    expect(track).toHaveBeenCalledWith('sdk_init_failed');
    expect(flaky.language()).toBe('en');
  });
});

describe('youtube profile on a fake ytgame', () => {
  function fakeYt(lang = 'en'): { sdk: YtGame; calls: string[]; fire: Record<string, () => void>; audio: (on: boolean) => void; data: string } {
    const calls: string[] = [];
    const fire: Record<string, () => void> = {};
    let audio: (on: boolean) => void = () => undefined;
    const box = { data: '' };
    const sdk: YtGame = {
      game: {
        firstFrameReady: () => void calls.push('firstFrameReady'),
        gameReady: () => void calls.push('gameReady'),
        loadData: () => Promise.resolve(box.data),
        saveData: (d) => { box.data = d; calls.push('saveData'); return Promise.resolve(); },
      },
      system: {
        getLanguage: () => Promise.resolve(lang),
        isAudioEnabled: () => true,
        onAudioEnabledChange: (cb) => { audio = cb; },
        onPause: (cb) => { fire.pause = cb; },
        onResume: (cb) => { fire.resume = cb; },
      },
      health: { logError: () => void calls.push('logError'), logWarning: () => undefined },
    };
    return { sdk, calls, fire, audio: (on) => audio(on), get data() { return box.data; } };
  }
  const deps = (sdk: YtGame | null, over: Partial<YoutubeDeps> = {}): YoutubeDeps => ({ sdk, languageCode: 'ru', device: 'desktop', now: () => 7, caps: { ads: false, payments: false, community: false, analytics: false }, track: () => undefined, ...over });

  it('firstFrameReady, then gameReady once; language from the SDK', async () => {
    const yt = fakeYt('ja');
    const p = createYoutubePlatform(deps(yt.sdk));
    await p.init();
    expect(p.language()).toBe('en');
    p.firstFrame();
    p.ready();
    p.ready();
    expect(yt.calls).toEqual(['firstFrameReady', 'gameReady']);
  });

  it('saves only through saveData/loadData; pause and audio callbacks', async () => {
    const yt = fakeYt();
    const p = createYoutubePlatform(deps(yt.sdk));
    const paused = vi.fn();
    const audio = vi.fn();
    p.onPause(paused);
    p.onAudioChange(audio);
    await p.init();
    expect(await p.load()).toBeNull();
    p.save('{"v":1,"rev":1,"savedAt":1}');
    await new Promise((r) => setTimeout(r, 0));
    expect(yt.data).toBe('{"v":1,"rev":1,"savedAt":1}');
    expect(await p.load()).toBe('{"v":1,"rev":1,"savedAt":1}');
    yt.fire.pause!();
    yt.audio(false);
    expect(paused).toHaveBeenCalledTimes(1);
    expect(audio).toHaveBeenCalledWith(false);
    expect(p.audioAllowed()).toBe(false);
    expect(await p.showInterstitial('x')).toEqual({ shown: false });
  });

  it('without the SDK global the profile still boots', async () => {
    const track = vi.fn();
    const p = createYoutubePlatform(deps(null, { track }));
    await p.init();
    expect(track).toHaveBeenCalledWith('sdk_missing');
    p.firstFrame();
    p.ready();
    expect(await p.load()).toBeNull();
  });
});
