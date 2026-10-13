// What: the `yandex` profile (docs/02-tech.md, section 6.2): YaGames SDK, LoadingAPI/GameplayAPI, cloud saves + local mirror, ads.
// Called by: src/platform/index.ts (profile yandex); tests/platform.test.ts against dev/yasdk-mock/sdk.js loaded in Node.
// Keep: sdk.js is loaded by index.html before this code; init() retries once and then works like the null profile; ready() once.

import type { Player, SDK, SafeStorage } from 'ysdk';
import type { DeviceType, Platform, PlatformCaps, PlatformTrack } from './types.ts';
import { browserStorage, createMirror, type KeyValue, type Mirror } from './storage.ts';
import { gameLanguage, guessDevice, pickNewestSave, profileCaps } from './shared.ts';

export const SAVE_KEY = 'save';
export const SLOW_INIT_MS = 8000;
export const AD_WATCHDOG_MS = 10000;

export interface YandexDeps {
  /** null when sdk.js did not load (no YaGames global). */
  sdkInit: (() => Promise<SDK>) | null;
  storage: KeyValue | null;
  languageCode: string;
  device: DeviceType;
  now(): number;
  caps: PlatformCaps;
  prefix: string;
  track: PlatformTrack;
}

export function browserDeps(track: PlatformTrack): YandexDeps {
  return {
    sdkInit: typeof YaGames !== 'undefined' ? () => YaGames.init() : null,
    storage: browserStorage(),
    languageCode: navigator.language,
    device: guessDevice({ userAgent: navigator.userAgent, touchPoints: navigator.maxTouchPoints, width: window.innerWidth, height: window.innerHeight }),
    now: () => Date.now(),
    caps: profileCaps(),
    prefix: __GAME__.id,
    track,
  };
}

function mapDevice(type: string | undefined, fallback: DeviceType): DeviceType {
  if (type === 'mobile' || type === 'tablet' || type === 'desktop') return type;
  return type === 'tv' ? 'desktop' : fallback;
}

export function createYandexPlatform(deps: YandexDeps): Platform {
  let sdk: SDK | null = null;
  let player: Player | null = null;
  let mirror: Mirror = createMirror(deps.storage, deps.prefix);
  let readyDone = false;
  let playing = false;
  const pauseCbs: Array<() => void> = [];
  const resumeCbs: Array<() => void> = [];
  const fire = (list: Array<() => void>): void => list.forEach((cb) => cb());

  async function initSdk(): Promise<SDK | null> {
    if (!deps.sdkInit) {
      deps.track('sdk_missing');
      return null;
    }
    const slow = setTimeout(() => deps.track('sdk_init_slow'), SLOW_INIT_MS);
    try {
      try {
        return await deps.sdkInit();
      } catch {
        return await deps.sdkInit();
      }
    } catch {
      deps.track('sdk_init_failed');
      return null;
    } finally {
      clearTimeout(slow);
    }
  }

  return {
    name: 'yandex',
    get device() {
      return mapDevice(sdk?.deviceInfo.type, deps.device);
    },
    caps: deps.caps,
    async init() {
      sdk = await initSdk();
      if (!sdk) return;
      // Subscribed before ready(): the startup ad of the platform may arrive at once (SDK-03).
      sdk.on('game_api_pause', () => fire(pauseCbs));
      sdk.on('game_api_resume', () => fire(resumeCbs));
      try {
        player = await sdk.getPlayer({ signed: false });
      } catch {
        player = null;
        deps.track('player_unavailable');
      }
      if (!deps.storage) {
        try {
          const safe: SafeStorage = await sdk.getStorage();
          mirror = createMirror(safe, deps.prefix);
        } catch {
          /* no mirror at all: the cloud is the only source */
        }
      }
    },
    language: () => gameLanguage(sdk ? sdk.environment.i18n.lang : deps.languageCode),
    firstFrame() {
      /* Yandex has no first-frame call; ready() is the signal */
    },
    ready() {
      if (readyDone) return;
      readyDone = true;
      sdk?.features.LoadingAPI?.ready();
    },
    gameplayStart() {
      if (playing) return;
      playing = true;
      sdk?.features.GameplayAPI?.start();
    },
    gameplayStop() {
      if (!playing) return;
      playing = false;
      sdk?.features.GameplayAPI?.stop();
    },
    onPause(cb) {
      pauseCbs.push(cb);
    },
    onResume(cb) {
      resumeCbs.push(cb);
    },
    audioAllowed: () => true,
    onAudioChange() {
      /* the platform never mutes on its own; pause covers ads */
    },
    showInterstitial(placement) {
      if (!sdk || !deps.caps.ads) return Promise.resolve({ shown: false });
      const adv = sdk.adv;
      return new Promise((resolve) => {
        let done = false;
        const finish = (shown: boolean): void => {
          if (done) return;
          done = true;
          clearTimeout(guard);
          resolve({ shown });
        };
        const guard = setTimeout(() => {
          deps.track('ad_watchdog', { placement });
          finish(false);
        }, AD_WATCHDOG_MS);
        adv.showFullscreenAdv({
          callbacks: {
            onClose: (wasShown) => finish(Boolean(wasShown)),
            onError: () => finish(false),
            onOffline: () => finish(false),
          },
        });
      });
    },
    showRewarded(placement) {
      if (!sdk || !deps.caps.ads) return Promise.resolve({ rewarded: false });
      const adv = sdk.adv;
      return new Promise((resolve) => {
        let done = false;
        let rewarded = false;
        const finish = (): void => {
          if (done) return;
          done = true;
          clearTimeout(guard);
          resolve({ rewarded });
        };
        const guard = setTimeout(() => {
          deps.track('ad_watchdog', { placement });
          finish();
        }, AD_WATCHDOG_MS);
        adv.showRewardedVideo({
          callbacks: {
            onRewarded: () => {
              rewarded = true;
            },
            onClose: finish,
            onError: finish,
          },
        });
      });
    },
    async load() {
      const local = mirror.get(SAVE_KEY);
      let cloud: string | null = null;
      if (player) {
        try {
          const data = await player.getData([SAVE_KEY]);
          cloud = typeof data[SAVE_KEY] === 'string' ? (data[SAVE_KEY] as string) : null;
        } catch {
          deps.track('cloud_load_failed');
        }
      }
      return pickNewestSave([cloud, local]);
    },
    save(data, opts) {
      mirror.set(SAVE_KEY, data);
      if (player) {
        player.setData({ [SAVE_KEY]: data }, Boolean(opts?.flush)).catch(() => deps.track('cloud_save_failed'));
      }
    },
    now: () => (sdk ? sdk.serverTime() : deps.now()),
  };
}
