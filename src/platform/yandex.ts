// What: the `yandex` profile (docs/02-tech.md, section 6.2): YaGames SDK, LoadingAPI/GameplayAPI, cloud saves + local mirror, ads.
// Called by: src/platform/index.ts (profile yandex); tests/platform.test.ts against dev/yasdk-mock/sdk.js loaded in Node.
// Keep: sdk.js is loaded by index.html before this code; init() retries once and then works like the null profile; ready() once.

import type { Player, SDK, SafeStorage } from 'ysdk';
import type { DeviceType, LeaderEntry, Leaders, Platform, PlatformCaps, PlatformTrack } from './types.ts';
import { browserStorage, createMirror, type KeyValue, type Mirror } from './storage.ts';
import { createLocalLeaders, gameLanguage, guessDevice, pickNewestSave, profileCaps } from './shared.ts';
import { CLOUD_QUEUE, createSaveQueue } from './save-queue.ts';

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

/** M4-04: the general leaderboard of the game in the Yandex console (technical name; created by the producer before the release). */
export const LEADERBOARD = 'coins';
/** The SDK takes one score a second at most; the game sends far less often. */
const SCORE_GAP_MS = 1500;

interface YaEntry {
  rank: number;
  score: number;
  player: { uniqueID: string; publicName: string };
}
interface YaBoards {
  setScore(name: string, score: number): Promise<void>;
  getEntries(name: string, opts: { quantityTop: number; includeUser: boolean; quantityAround: number }): Promise<{ entries: YaEntry[] }>;
  getPlayerEntry(name: string): Promise<YaEntry>;
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
  const cloud = createSaveQueue({
    ...CLOUD_QUEUE,
    now: deps.now,
    write: (data, flush) => {
      player?.setData({ [SAVE_KEY]: data }, flush).catch(() => deps.track('cloud_save_failed'));
    },
  });

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

  // M4-04: the leaderboard through the SDK; without the SDK (sdk.js missing) — the local stand-in.
  const local = createLocalLeaders();
  let lastScoreAt = -Infinity;
  const boards = (): YaBoards | null => (sdk as unknown as { leaderboards?: YaBoards } | null)?.leaderboards ?? null;
  const lite = (): boolean => !player || (player as unknown as { getMode?(): string }).getMode?.() === 'lite';
  const myId = (): string => (player as unknown as { getUniqueID?(): string } | null)?.getUniqueID?.() ?? '';
  const toEntry = (e: YaEntry): LeaderEntry => ({ rank: e.rank, name: e.player.publicName ?? '', score: e.score, me: e.player.uniqueID === myId() });
  const leaders: Leaders = {
    needsLogin: () => Boolean(boards()) && lite(),
    async login() {
      const auth = (sdk as unknown as { auth?: { openAuthDialog(): Promise<void> } } | null)?.auth;
      if (!sdk || !auth) return false;
      try {
        await auth.openAuthDialog();
        player = await sdk.getPlayer({ signed: false });
      } catch {
        return false;
      }
      return !lite();
    },
    async submit(score) {
      const lb = boards();
      if (!lb) return local.submit(score);
      if (lite() || deps.now() - lastScoreAt < SCORE_GAP_MS) return;
      lastScoreAt = deps.now();
      try {
        await lb.setScore(LEADERBOARD, Math.floor(score));
      } catch {
        deps.track('leaderboard_failed');
      }
    },
    async top(n) {
      const lb = boards();
      if (!lb) return local.top(n);
      try {
        const res = await lb.getEntries(LEADERBOARD, { quantityTop: n, includeUser: !lite(), quantityAround: 1 });
        const entries = res.entries.map(toEntry);
        let me = entries.find((e) => e.me) ?? null;
        if (!me && !lite()) me = toEntry(await lb.getPlayerEntry(LEADERBOARD).catch(() => ({ rank: 0, score: 0, player: { uniqueID: myId(), publicName: '' } })));
        return { entries: entries.filter((e) => e.rank <= n), me };
      } catch {
        return { entries: [], me: null };
      }
    },
  };
  return {
    name: 'yandex',
    leaders,
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
    async requestReview() {
      const fb = (sdk as unknown as { feedback?: { canReview(): Promise<{ value: boolean }>; requestReview(): Promise<{ feedbackSent: boolean }> } } | null)?.feedback;
      if (!fb) return { available: false, sent: false };
      try {
        const can = await fb.canReview();
        if (!can.value) return { available: false, sent: false };
        const r = await fb.requestReview();
        return { available: true, sent: Boolean(r.feedbackSent) };
      } catch {
        return { available: false, sent: false };
      }
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
      if (player) cloud.request(data, Boolean(opts?.flush));
    },
    now: () => (sdk ? sdk.serverTime() : deps.now()),
  };
}
