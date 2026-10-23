// What: the `youtube` profile (docs/02-tech.md, section 6.3): ytgame SDK, firstFrameReady/gameReady, saveData/loadData, pause and audio.
// Called by: src/platform/index.ts (profile youtube); tests/platform.test.ts with a fake ytgame.
// Keep: the SDK tag in index.html is the only external address; no ads, no community, no analytics, errors to health.logError.

import type { DeviceType, Platform, PlatformCaps, PlatformTrack } from './types.ts';
import { createLocalLeaders, gameLanguage, guessDevice, noPayments, profileCaps } from './shared.ts';
import { CLOUD_QUEUE, createSaveQueue } from './save-queue.ts';

/** The part of the YouTube Playables SDK this game uses (the global is created by the SDK tag). */
export interface YtGame {
  game: {
    firstFrameReady(): void;
    gameReady(): void;
    loadData(): Promise<string>;
    saveData(data: string): Promise<void>;
  };
  system: {
    getLanguage(): Promise<string>;
    isAudioEnabled(): boolean;
    onAudioEnabledChange(cb: (enabled: boolean) => void): void;
    onPause(cb: () => void): void;
    onResume(cb: () => void): void;
  };
  health: { logError(): void; logWarning(): void };
}

declare const ytgame: YtGame | undefined;

export interface YoutubeDeps {
  sdk: YtGame | null;
  languageCode: string;
  device: DeviceType;
  now(): number;
  caps: PlatformCaps;
  track: PlatformTrack;
}

export function browserDeps(track: PlatformTrack): YoutubeDeps {
  return {
    sdk: typeof ytgame !== 'undefined' ? ytgame : null,
    languageCode: navigator.language,
    device: guessDevice({ userAgent: navigator.userAgent, touchPoints: navigator.maxTouchPoints, width: window.innerWidth, height: window.innerHeight }),
    now: () => Date.now(),
    caps: profileCaps(),
    track,
  };
}

export function createYoutubePlatform(deps: YoutubeDeps): Platform {
  const sdk = deps.sdk;
  let lang = deps.languageCode;
  let readyDone = false;
  let audioOn = sdk ? safeAudio(sdk) : true;
  const pauseCbs: Array<() => void> = [];
  const resumeCbs: Array<() => void> = [];
  const audioCbs: Array<(on: boolean) => void> = [];
  const queue = createSaveQueue({
    ...CLOUD_QUEUE,
    now: deps.now,
    write: (data) => {
      sdk?.game.saveData(data).catch(() => report('save_failed'));
    },
  });

  function safeAudio(s: YtGame): boolean {
    try {
      return s.system.isAudioEnabled();
    } catch {
      return true;
    }
  }
  function report(event: string): void {
    deps.track(event);
    try {
      sdk?.health.logError();
    } catch {
      /* the SDK itself is broken: nothing more to do */
    }
  }

  return {
    name: 'youtube',
    device: deps.device,
    caps: deps.caps,
    async init() {
      if (!sdk) {
        deps.track('sdk_missing');
        return;
      }
      sdk.system.onPause(() => pauseCbs.forEach((cb) => cb()));
      sdk.system.onResume(() => resumeCbs.forEach((cb) => cb()));
      sdk.system.onAudioEnabledChange((on) => {
        audioOn = on;
        audioCbs.forEach((cb) => cb(on));
      });
      try {
        lang = await sdk.system.getLanguage();
      } catch {
        report('language_failed');
      }
    },
    language: () => gameLanguage(lang),
    firstFrame() {
      sdk?.game.firstFrameReady();
    },
    ready() {
      if (readyDone) return;
      readyDone = true;
      sdk?.game.gameReady();
    },
    gameplayStart() {
      /* no gameplay signal in this SDK */
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
    audioAllowed: () => audioOn,
    onAudioChange(cb) {
      audioCbs.push(cb);
    },
    showInterstitial: () => Promise.resolve({ shown: false }),
    showRewarded: () => Promise.resolve({ rewarded: false, outcome: 'unavailable' as const }),
    setBanner() {
      /* no banner here */
    },
    payments: noPayments(),
    requestReview: () => Promise.resolve({ available: false, sent: false }),
    // M4-04: no sign-in and no servers on YouTube — the leaderboard stays on the device.
    leaders: createLocalLeaders(),
    async load() {
      if (!sdk) return null;
      try {
        const text = await sdk.game.loadData();
        return text ? text : null;
      } catch {
        report('load_failed');
        return null;
      }
    },
    save(data, opts) {
      if (sdk) queue.request(data, Boolean(opts?.flush));
    },
    now: deps.now,
  };
}
