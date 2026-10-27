// What: the `null` profile (docs/02-tech.md, section 6.4): no SDK, localStorage saves, navigator language, no ads.
// Called by: src/platform/index.ts (profile null); tests/platform.test.ts with injected deps.
// Keep: never touches the network; the yandex profile falls back to this behaviour when sdk.js is missing.

import type { DeviceType, Platform, PlatformCaps } from './types.ts';
import { browserStorage, createMirror, type KeyValue } from './storage.ts';
import { browserFullscreen, createLocalLeaders, gameLanguage, guessDevice, noPayments, once, profileCaps } from './shared.ts';

export const SAVE_KEY = 'save';

export interface NullDeps {
  storage: KeyValue | null;
  languageCode: string;
  device: DeviceType;
  now(): number;
  caps: PlatformCaps;
  prefix: string;
}

export function browserDeps(): NullDeps {
  return {
    storage: browserStorage(),
    languageCode: navigator.language,
    device: guessDevice({ userAgent: navigator.userAgent, touchPoints: navigator.maxTouchPoints, width: window.innerWidth, height: window.innerHeight }),
    now: () => Date.now(),
    caps: profileCaps(),
    prefix: __GAME__.id,
  };
}

export function createNullPlatform(deps: NullDeps = browserDeps()): Platform {
  const mirror = createMirror(deps.storage, deps.prefix);
  let readyCalls = 0;
  const markReady = once(() => void readyCalls++);
  return {
    name: 'null',
    // S-09: no platform frame — the browser's whole screen.
    ...(typeof document === 'undefined' ? {} : { fullscreen: browserFullscreen() }),
    device: deps.device,
    caps: deps.caps,
    async init() {
      /* nothing to initialise */
    },
    language: () => gameLanguage(deps.languageCode),
    firstFrame() {
      /* no SDK to tell */
    },
    ready: markReady,
    gameplayStart() {
      /* no SDK to tell */
    },
    gameplayStop() {
      /* no SDK to tell */
    },
    onPause() {
      /* the platform never pauses the game; the browser lifecycle is handled in main */
    },
    onResume() {
      /* see onPause */
    },
    audioAllowed: () => true,
    onAudioChange() {
      /* always allowed */
    },
    showInterstitial: () => Promise.resolve({ shown: false }),
    showRewarded: () => Promise.resolve({ rewarded: false, outcome: 'unavailable' as const }),
    setBanner() {
      /* no banner here */
    },
    payments: noPayments(),
    // No platform here: the review is a stand-in (docs/01 §3 p. 15), so the gift can be tried in the null profile.
    requestReview: () => Promise.resolve({ available: true, sent: true }),
    leaders: createLocalLeaders(),
    load: () => Promise.resolve(mirror.get(SAVE_KEY)),
    save(data) {
      mirror.set(SAVE_KEY, data);
    },
    now: deps.now,
  };
}
