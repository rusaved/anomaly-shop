import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createVkPlatform, deviceOf, launchedByPlatform, siteOf, type VkBridgeLike, type VkDeps } from '../src/platform/vk.ts';
import { headParts, packSave, unpackSave, VK_VALUE_MAX } from '../src/platform/vk-save.ts';
import { memoryStorage } from '../src/platform/storage.ts';
import { checkVkBuild } from '../scripts/check-vk.mjs';
import { vk } from '../src/content/vk.ts';
import { createAdGate } from '../src/core/ad-gate.ts';

/** V «Выход на VK и ОК» (V-02…V-08): the vk profile on a fake bridge. */
type Call = { method: string; params?: Record<string, unknown> };
function fakeBridge(answer: (c: Call) => unknown = () => ({ result: true })) {
  const calls: Call[] = [];
  const store = new Map<string, string>();
  let listener: ((e: { detail?: { type?: string } }) => void) | null = null;
  const bridge: VkBridgeLike = {
    send(method, params) {
      const c = { method, ...(params ? { params } : {}) };
      calls.push(c);
      if (method === 'VKWebAppStorageSet') {
        store.set(String(params!.key), String(params!.value));
        return Promise.resolve({ result: true });
      }
      if (method === 'VKWebAppStorageGet') return Promise.resolve({ keys: (params!.keys as string[]).map((key) => ({ key, value: store.get(key) ?? '' })) });
      const a = answer(c);
      return a instanceof Promise ? a : a instanceof Error ? Promise.reject(a) : Promise.resolve(a);
    },
    subscribe(cb) {
      listener = cb;
    },
  };
  return { bridge, calls, store, emit: (type: string) => listener?.({ detail: { type } }) };
}
const RULES = { saveGapSec: 45, hideFlushGapSec: 5, chunkChars: 4000, bridgeTimeoutSec: 6, rewardedRecheckSec: 30 };
function deps(bridge: VkBridgeLike, o: Partial<VkDeps> = {}): VkDeps {
  return {
    bridge,
    search: '?vk_platform=mobile_android&vk_app_id=1&sign=x',
    storage: memoryStorage(),
    device: 'mobile',
    now: () => Date.now(),
    caps: { ads: true, payments: false, community: false, analytics: false },
    prefix: 'anomaly-shop',
    track: () => undefined,
    rules: RULES,
    groupId: (site) => (site === 'ok' ? 222 : 111),
    ...o,
  };
}
const save = (rev: number, pad = 0) => JSON.stringify({ rev, savedAt: rev, pad: 'x'.repeat(pad) });

describe('V-02 the site and the device by the launch parameters', () => {
  it('OK by vk_client=ok or vk_platform=*_ok, otherwise VK', () => {
    expect(siteOf('?vk_client=ok&vk_platform=mobile_web')).toBe('ok');
    expect(siteOf('?vk_platform=desktop_web_ok')).toBe('ok');
    expect(siteOf('?vk_platform=mobile_android')).toBe('vk');
    expect(siteOf('')).toBe('vk');
  });
  it('a phone by mobile_*, a computer by desktop_*', () => {
    expect(deviceOf('?vk_platform=mobile_iphone', 'desktop')).toBe('mobile');
    expect(deviceOf('?vk_platform=desktop_web', 'mobile')).toBe('desktop');
    expect(deviceOf('', 'tablet')).toBe('tablet');
  });
  it('the stand-in never answers a launch signed by VK or OK', () => {
    expect(launchedByPlatform('?vk_app_id=1&sign=abc&mock=vk')).toBe(true);
    expect(launchedByPlatform('?mock=vk')).toBe(false);
  });
  it('S-09 VK and OK on the live bridge run the screen themselves: the platform asks for no whole screen', () => {
    expect(createVkPlatform(deps(fakeBridge().bridge)).fullscreen).toBeUndefined();
  });
  it('VKWebAppInit is the first bridge call, made with the platform', () => {
    const f = fakeBridge();
    const p = createVkPlatform(deps(f.bridge));
    expect(f.calls[0]?.method).toBe('VKWebAppInit');
    expect(p.name).toBe('vk');
    expect(p.site).toBe('vk');
    expect(p.language()).toBe('ru');
    expect(p.caps.payments).toBe(false);
  });
});

describe('V-07 the life cycle', () => {
  it('VKWebAppViewHide pauses the game, VKWebAppViewRestore resumes it', async () => {
    const f = fakeBridge();
    const p = createVkPlatform(deps(f.bridge));
    await p.init();
    const seen: string[] = [];
    p.onPause(() => seen.push('pause'));
    p.onResume(() => seen.push('resume'));
    f.emit('VKWebAppViewHide');
    f.emit('VKWebAppViewRestore');
    expect(seen).toEqual(['pause', 'resume']);
  });
});

describe('V-06 saves in VK Storage', () => {
  it('packs into parts of at most 4 096 characters and back', () => {
    const text = JSON.stringify({ rev: 1, data: Array.from({ length: 4000 }, (_, i) => `${i}:${(i * 7919) % 1000}`) });
    const { head, parts } = packSave(text, 4096);
    expect(parts.length).toBeGreaterThan(1);
    for (const p of parts) expect(p.length).toBeLessThanOrEqual(VK_VALUE_MAX);
    expect(headParts(head)).toBe(parts.length);
    expect(unpackSave(head, parts)).toBe(text);
    expect(unpackSave(head, parts.slice(1))).toBeNull();
    expect(unpackSave('{broken', parts)).toBeNull();
  });
  describe('writes', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());
    it('at most once per 45 s, the latest text only; on hide at once', async () => {
      const f = fakeBridge();
      const p = createVkPlatform(deps(f.bridge));
      await p.init();
      const writes = () => f.calls.filter((c) => c.method === 'VKWebAppStorageSet' && c.params!.key === 'save').length;
      p.save(save(1));
      await vi.advanceTimersByTimeAsync(2500);
      expect(writes()).toBe(1);
      for (let i = 2; i < 20; i++) {
        p.save(save(i));
        await vi.advanceTimersByTimeAsync(2000);
      }
      // 36 s after the first write: still one.
      expect(writes()).toBe(1);
      await vi.advanceTimersByTimeAsync(10_000);
      expect(writes()).toBe(2);
      expect(unpackSave(f.store.get('save'), [f.store.get('save_0')])).toBe(save(19));
      // The view hides: the pending text goes at once (5 s after the last write at the earliest).
      p.save(save(20));
      await vi.advanceTimersByTimeAsync(5000);
      f.emit('VKWebAppViewHide');
      await vi.advanceTimersByTimeAsync(10);
      expect(writes()).toBe(3);
      expect(unpackSave(f.store.get('save'), [f.store.get('save_0')])).toBe(save(20));
    });
    it('an unchanged part is not written again', async () => {
      const f = fakeBridge();
      const p = createVkPlatform(deps(f.bridge, { rules: { ...RULES, chunkChars: 256 } }));
      await p.init();
      p.save(save(1, 3000));
      await vi.advanceTimersByTimeAsync(3000);
      const first = f.calls.filter((c) => c.method === 'VKWebAppStorageSet').length;
      p.save(save(1, 3000), { flush: true });
      await vi.advanceTimersByTimeAsync(60_000);
      expect(f.calls.filter((c) => c.method === 'VKWebAppStorageSet').length).toBe(first);
    });
  });
  it('loads the newest of VK Storage and the local cache', async () => {
    const f = fakeBridge();
    const { head, parts } = packSave(save(7));
    f.store.set('save', head);
    parts.forEach((x, i) => f.store.set(`save_${i}`, x));
    const storage = memoryStorage();
    storage.setItem('anomaly-shop:save', save(3));
    const p = createVkPlatform(deps(f.bridge, { storage }));
    await p.init();
    expect(await p.load()).toBe(save(7));
  });
  it('no network: the bridge never answers — the local cache, no endless loading', async () => {
    vi.useFakeTimers();
    const never = { send: () => new Promise<unknown>(() => undefined), subscribe: () => undefined };
    const storage = memoryStorage();
    storage.setItem('anomaly-shop:save', save(4));
    const p = createVkPlatform(deps(never, { storage }));
    const loaded = (async () => {
      await p.init();
      return p.load();
    })();
    await vi.advanceTimersByTimeAsync(RULES.bridgeTimeoutSec * 1000 * 3 + 100);
    expect(await loaded).toBe(save(4));
    vi.useRealTimers();
  });
});

describe('V-05 ads by the rules of VK', () => {
  it('rewarded: checked ahead with use_waterfall false; the reward only on result true; not ready — unavailable', async () => {
    let ready = false;
    let show: unknown = { result: true };
    const f = fakeBridge((c) => (c.method === 'VKWebAppCheckNativeAds' ? { result: ready } : c.method === 'VKWebAppShowNativeAds' ? show : { result: true }));
    const p = createVkPlatform(deps(f.bridge));
    await p.init();
    await Promise.resolve();
    expect(f.calls.find((c) => c.method === 'VKWebAppCheckNativeAds')?.params).toEqual({ ad_format: 'reward', use_waterfall: false });
    expect(p.rewardedReady!()).toBe(false);
    expect((await p.showRewarded('x')).outcome).toBe('unavailable');
    expect(f.calls.some((c) => c.method === 'VKWebAppShowNativeAds')).toBe(false);
    ready = true;
    f.emit('VKWebAppViewRestore');
    await new Promise((r) => setTimeout(r, 0));
    expect(p.rewardedReady!()).toBe(true);
    const r1 = await p.showRewarded('x');
    expect(r1).toEqual({ rewarded: true, outcome: 'rewarded' });
    expect(f.calls.filter((c) => c.method === 'VKWebAppShowNativeAds').at(-1)?.params).toEqual({ ad_format: 'reward', use_waterfall: false });
    await new Promise((r) => setTimeout(r, 0));
    show = { result: false };
    expect((await p.showRewarded('x')).rewarded).toBe(false);
    await new Promise((r) => setTimeout(r, 0));
    show = new Error('closed');
    expect((await p.showRewarded('x')).rewarded).toBe(false);
  });
  it('the interstitial gap of the VK rules is at least 30 s, never in the first minutes', () => {
    expect(vk.ads.interstitialGapSec).toBeGreaterThanOrEqual(30);
    const gate = createAdGate({ rewardedGapSec: 15, firstSec: vk.ads.interstitialFirstSec, gapSec: vk.ads.interstitialGapSec, afterRewardedSec: 60, seriesTaps: 3, seriesSec: 2 });
    expect(gate.interstitialBlock(10)).toBe('first');
    gate.interstitialShown(200);
    expect(gate.interstitialBlock(200 + 29)).toBe('gap');
  });
});

describe('V-08 joining the community', () => {
  it('VK — the community id, OK — the group id; true only on result true', async () => {
    const f = fakeBridge((c) => (c.method === 'VKWebAppJoinGroup' ? (c.params!.group_id === 222 ? { result: true } : new Error('denied')) : { result: true }));
    const vkP = createVkPlatform(deps(f.bridge));
    await vkP.init();
    expect(await vkP.joinCommunity!()).toBe(false);
    expect(f.calls.find((c) => c.method === 'VKWebAppJoinGroup')?.params).toEqual({ group_id: 111 });
    const okP = createVkPlatform(deps(f.bridge, { search: '?vk_client=ok' }));
    await okP.init();
    expect(okP.site).toBe('ok');
    expect(await okP.joinCommunity!()).toBe(true);
  });
  it('no id filled yet — no join at all (no button, no window)', async () => {
    const f = fakeBridge();
    const p = createVkPlatform(deps(f.bridge, { groupId: () => 0 }));
    await p.init();
    expect(p.joinCommunity).toBeUndefined();
  });
});

describe('V-04 the build check', () => {
  it('finds the words and links of other platforms', () => {
    const link: Array<[string, string]> = [['assets/check-link-x1.js', 'export const a=1'], ['assets/b.js', 'q.has("vk_app_id")&&q.has("sign");import("./check-link-x1.js")']];
    const ok = checkVkBuild([['index.html', '<script type="module" src="./assets/a.js"></script>'], ['assets/a.js', 'VKWebAppInit;VKWebAppCheckNativeAds'], ...link]);
    expect(ok.problems).toEqual([]);
    const bad = checkVkBuild([['assets/a.js', 'VKWebAppInit;VKWebAppCheckNativeAds;"Мы в Telegram";"https://ya.ru/x";"Одноклассники"'], ...link]);
    expect(bad.problems.length).toBe(3);
  });

  it('N-05: the check link is its own chunk behind the launch check of VK and OK', () => {
    const base: Array<[string, string]> = [['assets/a.js', 'VKWebAppInit;VKWebAppCheckNativeAds']];
    expect(checkVkBuild(base).problems).toEqual([expect.stringContaining('check-link: 0')]);
    const unguarded = checkVkBuild([...base, ['assets/check-link-x1.js', 'x'], ['assets/b.js', 'import("./check-link-x1.js")']]);
    expect(unguarded.problems).toEqual([expect.stringContaining('vk_app_id')]);
    const eager = checkVkBuild([...base, ['index.html', '<link rel="modulepreload" href="./assets/check-link-x1.js">'], ['assets/check-link-x1.js', 'x'], ['assets/b.js', 'vk_app_id;sign']]);
    expect(eager.problems).toEqual([expect.stringContaining('index.html')]);
  });
});
