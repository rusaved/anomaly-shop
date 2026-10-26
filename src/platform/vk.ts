// What: the `vk` profile (V-02…V-08, «Ресейл 16»): VK Bridge for VK and OK — init first, the site by the launch parameters, saves in VK Storage (packed, in parts) with localStorage as a cache, native ads (rewarded checked ahead), hide/restore, joining the community.
// Called by: src/platform/index.ts (profile vk) with the npm vk-bridge or the stand-in of ?mock=vk; tests/vk.test.ts with a fake bridge.
// Keep: VKWebAppInit is the first call, sent when the platform is made; every bridge call has a time limit (no endless loading offline); a reward only on result: true, once; Storage writes at most once per saveGapSec (VK: 1 000 writes an hour).

import type { DeviceType, Platform, PlatformCaps, PlatformTrack, RewardedOutcome, VkSite } from './types.ts';
import { browserStorage, createMirror, type KeyValue } from './storage.ts';
import { createLocalLeaders, gameLanguage, guessDevice, noPayments, pickNewestSave, profileCaps } from './shared.ts';
import { HEAD_KEY, headParts, packSave, partKey, unpackSave } from './vk-save.ts';

export const SAVE_KEY = 'save';
/** The rolling hour of VK Storage writes; the game stays well under VK's 1 000. */
export const WRITES_PER_HOUR = 600;

/** The part of VK Bridge this game uses (the npm module and the stand-in both fit it). */
export interface VkBridgeLike {
  send(method: string, params?: Record<string, unknown>): Promise<unknown>;
  subscribe(cb: (e: { detail?: { type?: string; data?: unknown } }) => void): void;
}

export interface VkRules {
  saveGapSec: number;
  hideFlushGapSec: number;
  chunkChars: number;
  bridgeTimeoutSec: number;
  rewardedRecheckSec: number;
}

export interface VkDeps {
  bridge: VkBridgeLike;
  /** location.search of the launch (vk_platform, vk_client, …). */
  search: string;
  storage: KeyValue | null;
  device: DeviceType;
  now(): number;
  caps: PlatformCaps;
  prefix: string;
  track: PlatformTrack;
  rules: VkRules;
  /** The community (VK) or group (OK) id; 0 — not filled yet. */
  groupId(site: VkSite): number;
}

/** OK when the launch says so (vk_client=ok or vk_platform=*_ok), else VK. */
export function siteOf(search: string): VkSite {
  const q = new URLSearchParams(search);
  return q.get('vk_client') === 'ok' || /_ok$/.test(q.get('vk_platform') ?? '') ? 'ok' : 'vk';
}

/** mobile_* — a phone (a tablet by its size), desktop_web — a computer; otherwise a guess from the browser. */
export function deviceOf(search: string, fallback: DeviceType): DeviceType {
  const p = new URLSearchParams(search).get('vk_platform') ?? '';
  if (/^desktop/.test(p)) return 'desktop';
  if (/^mobile/.test(p)) return fallback === 'tablet' ? 'tablet' : 'mobile';
  return fallback;
}

/** The launch came from VK or OK itself (signed parameters), not from a plain browser tab. */
export function launchedByPlatform(search: string): boolean {
  const q = new URLSearchParams(search);
  return q.has('vk_app_id') && q.has('sign');
}

export function browserDeps(bridge: VkBridgeLike, track: PlatformTrack, rules: VkRules, groupId: (site: VkSite) => number): VkDeps {
  const fallback = guessDevice({ userAgent: navigator.userAgent, touchPoints: navigator.maxTouchPoints, width: window.innerWidth, height: window.innerHeight });
  return {
    bridge,
    search: location.search,
    storage: browserStorage(),
    device: deviceOf(location.search, fallback),
    now: () => Date.now(),
    caps: profileCaps(),
    prefix: __GAME__.id,
    track,
    rules,
    groupId,
  };
}

const resultTrue = (r: unknown): boolean => Boolean(r && typeof r === 'object' && (r as { result?: unknown }).result === true);

export function createVkPlatform(deps: VkDeps): Platform {
  const { bridge, rules } = deps;
  const limitMs = rules.bridgeTimeoutSec * 1000;
  /** A bridge call that gives up after the time limit (offline, outside VK): rejects, never hangs. */
  const call = (method: string, params?: Record<string, unknown>, ms = limitMs): Promise<unknown> =>
    new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`${method}: timeout`)), ms);
      let p: Promise<unknown>;
      try {
        p = bridge.send(method, params);
      } catch (e) {
        clearTimeout(t);
        reject(e as Error);
        return;
      }
      p.then(
        (r) => {
          clearTimeout(t);
          resolve(r);
        },
        (e: unknown) => {
          clearTimeout(t);
          reject(e as Error);
        },
      );
    });
  // V-02: VKWebAppInit first of all, before the game loads anything.
  const initDone = call('VKWebAppInit').then(
    () => true,
    () => {
      deps.track('sdk_init_failed');
      return false;
    },
  );
  const site = siteOf(deps.search);
  const mirror = createMirror(deps.storage, deps.prefix);
  const pauseCbs: Array<() => void> = [];
  const resumeCbs: Array<() => void> = [];
  const fire = (list: Array<() => void>): void => list.forEach((cb) => cb());
  let bridgeOk = false;

  // V-05: the rewarded video is checked ahead; a button shows only while one is loaded.
  let rewardReady = false;
  let checking = false;
  let recheck: ReturnType<typeof setTimeout> | undefined;
  const checkReward = (): void => {
    if (!bridgeOk || !deps.caps.ads || checking) return;
    checking = true;
    clearTimeout(recheck);
    call('VKWebAppCheckNativeAds', { ad_format: 'reward', use_waterfall: false })
      .then(
        (r) => (rewardReady = resultTrue(r)),
        () => (rewardReady = false),
      )
      .finally(() => {
        checking = false;
        if (!rewardReady) recheck = setTimeout(checkReward, rules.rewardedRecheckSec * 1000);
      });
  };

  // V-06: VK Storage — the latest text waits; written at most once per saveGapSec, at once on hide (not more often than hideFlushGapSec).
  let latest: string | null = null;
  let lastWriteAt = -Infinity;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const written = new Map<string, string>();
  let writesHour: number[] = [];
  const put = async (key: string, value: string): Promise<boolean> => {
    if (written.get(key) === value) return true;
    const now = deps.now();
    writesHour = writesHour.filter((t) => now - t < 3_600_000);
    if (writesHour.length >= WRITES_PER_HOUR) return false;
    writesHour.push(now);
    try {
      await call('VKWebAppStorageSet', { key, value });
      written.set(key, value);
      return true;
    } catch {
      return false;
    }
  };
  const writeNow = (): void => {
    clearTimeout(timer);
    timer = undefined;
    if (latest === null || !bridgeOk) return;
    const text = latest;
    latest = null;
    lastWriteAt = deps.now();
    const { head, parts } = packSave(text, rules.chunkChars);
    void (async () => {
      let ok = true;
      for (let i = 0; i < parts.length && ok; i++) ok = await put(partKey(i), parts[i]!);
      if (ok) ok = await put(HEAD_KEY, head);
      if (!ok) deps.track('cloud_save_failed');
    })();
  };
  const schedule = (flush: boolean): void => {
    const now = deps.now();
    const gap = (flush ? rules.hideFlushGapSec : rules.saveGapSec) * 1000;
    const due = Math.max(now + (flush ? 0 : 2000), lastWriteAt + gap);
    clearTimeout(timer);
    if (due <= now) writeNow();
    else timer = setTimeout(writeNow, due - now);
  };

  bridge.subscribe((e) => {
    const type = e.detail?.type;
    if (type === 'VKWebAppViewHide') {
      fire(pauseCbs);
      if (latest !== null) schedule(true);
    } else if (type === 'VKWebAppViewRestore') {
      fire(resumeCbs);
      checkReward();
    }
  });

  return {
    name: 'vk',
    site,
    device: deps.device,
    caps: deps.caps,
    leaders: createLocalLeaders(),
    payments: noPayments(),
    async init() {
      bridgeOk = await initDone;
      checkReward();
    },
    // V-04: Russian only on VK and OK.
    language: () => gameLanguage('ru'),
    firstFrame() {
      /* VK has no first-frame call */
    },
    ready() {
      /* VK has no ready call: VKWebAppInit already said the app is up */
    },
    gameplayStart() {
      /* no gameplay signal on VK */
    },
    gameplayStop() {
      /* see gameplayStart */
    },
    onPause(cb) {
      pauseCbs.push(cb);
    },
    onResume(cb) {
      resumeCbs.push(cb);
    },
    audioAllowed: () => true,
    onAudioChange() {
      /* VK never mutes on its own; hide pauses the game */
    },
    rewardedReady: () => rewardReady,
    async showInterstitial() {
      if (!bridgeOk || !deps.caps.ads) return { shown: false };
      try {
        if (!resultTrue(await call('VKWebAppCheckNativeAds', { ad_format: 'interstitial', use_waterfall: false }))) return { shown: false };
        return { shown: resultTrue(await call('VKWebAppShowNativeAds', { ad_format: 'interstitial', use_waterfall: false }, 120_000)) };
      } catch {
        return { shown: false };
      }
    },
    async showRewarded() {
      if (!bridgeOk || !deps.caps.ads || !rewardReady) return { rewarded: false, outcome: 'unavailable' as const };
      rewardReady = false;
      let outcome: RewardedOutcome;
      try {
        // A video runs as long as it runs: the time limit here only catches a window that never comes back.
        outcome = resultTrue(await call('VKWebAppShowNativeAds', { ad_format: 'reward', use_waterfall: false }, 180_000)) ? 'rewarded' : 'closed';
      } catch {
        outcome = 'unavailable';
      }
      checkReward();
      return { rewarded: outcome === 'rewarded', outcome };
    },
    setBanner() {
      /* no banner on VK and OK in this build */
    },
    requestReview: () => Promise.resolve({ available: false, sent: false }),
    // V-08: only once the studio filled the id of the community (VK) or group (OK); without it no join button anywhere.
    ...(deps.groupId(site) > 0
      ? {
          async joinCommunity() {
            if (!bridgeOk) {
              deps.track('join_unavailable');
              return false;
            }
            try {
              return resultTrue(await call('VKWebAppJoinGroup', { group_id: deps.groupId(site) }, 120_000));
            } catch {
              return false;
            }
          },
        }
      : {}),
    async load() {
      const local = mirror.get(SAVE_KEY);
      if (!(await initDone)) return local;
      let cloud: string | null = null;
      try {
        const got = (k: unknown): Map<string, string> => new Map(((k as { keys?: Array<{ key: string; value: string }> })?.keys ?? []).map((x) => [x.key, x.value]));
        const head = got(await call('VKWebAppStorageGet', { keys: [HEAD_KEY] })).get(HEAD_KEY) ?? '';
        const n = headParts(head);
        if (n) {
          const keys = Array.from({ length: n }, (_, i) => partKey(i));
          const parts = got(await call('VKWebAppStorageGet', { keys }));
          const list = keys.map((k) => parts.get(k) ?? null);
          cloud = unpackSave(head, list);
          if (cloud === null) deps.track('cloud_load_failed');
          else {
            written.set(HEAD_KEY, head);
            keys.forEach((k, i) => written.set(k, list[i]!));
          }
        }
      } catch {
        deps.track('cloud_load_failed');
      }
      return pickNewestSave([cloud, local]);
    },
    save(data, opts) {
      mirror.set(SAVE_KEY, data);
      latest = data;
      schedule(Boolean(opts?.flush));
    },
    now: deps.now,
  };
}
