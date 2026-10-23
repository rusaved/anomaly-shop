// What: the one ads module (M5-02, M5-03; docs/03 §2): every rewarded video and interstitial of the game goes through here.
// Called by: src/main.ts (created once; the egg cards, the market, the chat, the return window, «Gifts» and the store get it).
// Keep: reason «ad» around every call; the reward only on «rewarded» (late too), once; «no ads» stops only the interstitial and banner.

import type { AdsData } from '../content/schemas.ts';
import { createAdGate, type InterstitialBlock } from '../core/ad-gate.ts';
import type { PauseManager } from '../core/pause.ts';
import type { Platform, RewardedOutcome } from '../platform/types.ts';

export type Track = (event: string, params?: Record<string, string | number>) => void;

export interface AdsDeps {
  platform: Platform;
  pause: PauseManager;
  track: Track;
  rules: AdsData;
  /** Seconds of play this visit (the runtime's elapsed time: stands still on pause). */
  playSec(): number;
  /** «No ads» bought (M5-05). */
  noAds(): boolean;
  /** The game is in a moment an interstitial must not break (the hatch show, a deal in a chat). */
  busyNow(): boolean;
  /** A short note to the player: closed early, no video now, wait a little. */
  note(kind: 'closed' | 'unavailable' | 'wait'): void;
  /** Redraw the screens (a button is locked while its video runs). */
  changed(): void;
}

export interface Ads {
  /** The platform shows ads at all (the yandex profile); without them no ad button is drawn. */
  readonly on: boolean;
  /** A video runs now: every ad button is locked. */
  busy(): boolean;
  /** The rewarded video; give() runs once and only when the reward is due. */
  rewarded(placement: string, give: () => void): Promise<RewardedOutcome | 'wait' | 'busy'>;
  /** A step between screens by the player's tap (a window closed, a tab changed): maybe an interstitial. */
  betweenScreens(placement: string): Promise<boolean>;
  /** Why an interstitial would not show now (test API and the debug panel). */
  interstitialBlock(): InterstitialBlock | 'noads' | 'off' | 'busy';
  /** «No ads» changed: the banner follows it. */
  syncBanner(): void;
}

export function createAds(deps: AdsDeps): Ads {
  const gate = createAdGate({ rewardedGapSec: deps.rules.rewarded.gapSec, ...deps.rules.interstitial });
  const on = deps.platform.caps.ads;
  let running = false;
  /** Play seconds of the last reward of each place (a place may have its own longer gap). */
  const placeAt = new Map<string, number>();
  const placeReady = (placement: string): boolean => deps.playSec() - (placeAt.get(placement) ?? -Infinity) >= (deps.rules.rewarded.placementGapSec?.[placement] ?? 0);
  if (typeof window !== 'undefined') window.addEventListener('pointerdown', () => gate.tap(deps.playSec()), { capture: true, passive: true });

  async function run<T>(fn: () => Promise<T>): Promise<T> {
    running = true;
    deps.pause.pause('ad');
    deps.changed();
    try {
      return await fn();
    } finally {
      running = false;
      deps.pause.resume('ad');
      deps.track('ad_resume_ok');
      deps.changed();
    }
  }

  const ads: Ads = {
    on,
    busy: () => running,
    async rewarded(placement, give) {
      if (!on) return 'busy';
      if (running) return 'busy';
      if (!gate.rewardedReady(deps.playSec()) || !placeReady(placement)) {
        deps.note('wait');
        return 'wait';
      }
      deps.track('gameRewardedRequest', { placement });
      const r = await run(() => deps.platform.showRewarded(placement));
      if (r.outcome === 'rewarded') {
        gate.rewardedDone(deps.playSec());
        placeAt.set(placement, deps.playSec());
        deps.track('gameRewardedEarned', { placement });
        give();
        deps.changed();
      } else if (r.outcome === 'closed') {
        deps.track('gameRewardedClose', { placement });
        deps.note('closed');
      } else {
        deps.track('gameRewardedError', { placement });
        deps.note('unavailable');
      }
      return r.outcome;
    },
    interstitialBlock() {
      if (!on) return 'off';
      if (deps.noAds()) return 'noads';
      if (running || deps.busyNow()) return 'busy';
      return gate.interstitialBlock(deps.playSec());
    },
    async betweenScreens(placement) {
      if (ads.interstitialBlock() !== null) return false;
      deps.track('gameFullscreenRequest', { placement });
      const r = await run(() => deps.platform.showInterstitial(placement));
      // The cooldown starts only when the ad was really shown (docs/03 §2).
      if (r.shown) {
        gate.interstitialShown(deps.playSec());
        deps.track('gameFullscreenClose', { placement });
      } else deps.track('gameFullscreenError', { placement });
      return r.shown;
    },
    syncBanner() {
      if (on) deps.platform.setBanner(!deps.noAds());
    },
  };
  return ads;
}
