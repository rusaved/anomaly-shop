// What: the ad gate (M5-02, M5-03; docs/03 §2): the common gap of rewarded ads and when an interstitial may show.
// Called by: src/ui/ads.ts (the one ads module); tests/ad-gate.test.ts.
// Keep: pure — times are seconds of play passed in by the caller; the rules are content/ads.json.

export interface AdGateRules {
  rewardedGapSec: number;
  firstSec: number;
  gapSec: number;
  afterRewardedSec: number;
  seriesTaps: number;
  seriesSec: number;
}

export type InterstitialBlock = 'first' | 'gap' | 'rewarded' | 'series' | null;

export interface AdGate {
  /** A tap anywhere (the series of taps blocks the interstitial). */
  tap(t: number): void;
  rewardedReady(t: number): boolean;
  rewardedDone(t: number): void;
  /** Why an interstitial may not show now (null — it may). */
  interstitialBlock(t: number): InterstitialBlock;
  interstitialShown(t: number): void;
}

export function createAdGate(rules: AdGateRules): AdGate {
  let lastRewarded = -Infinity;
  let lastInterstitial = -Infinity;
  let taps: number[] = [];
  return {
    tap(t) {
      taps.push(t);
      if (taps.length > 32) taps = taps.slice(-16);
    },
    rewardedReady: (t) => t - lastRewarded >= rules.rewardedGapSec,
    rewardedDone(t) {
      lastRewarded = t;
    },
    interstitialBlock(t) {
      if (t < rules.firstSec) return 'first';
      if (t - lastInterstitial < rules.gapSec) return 'gap';
      if (t - lastRewarded < rules.afterRewardedSec) return 'rewarded';
      // The tap that leads between screens counts too: a run of taps (feeding, hatching) is not a pause.
      if (taps.filter((x) => t - x <= rules.seriesSec).length > rules.seriesTaps) return 'series';
      return null;
    },
    interstitialShown(t) {
      lastInterstitial = t;
    },
  };
}
