import { describe, expect, it } from 'vitest';
import { createAdGate } from '../src/core/ad-gate.ts';
import { loadGameContent } from '../scripts/load-game-content.ts';

/** M5-03: the interstitial timer — not in the first 3 minutes, once in 3 minutes, not within 60 s of a rewarded ad, not in a run of taps. */
const ads = loadGameContent().ads!;
const rules = { rewardedGapSec: ads.rewarded.gapSec, ...ads.interstitial };

describe('M5-03 ad gate', () => {
  it('the content numbers are the brief: 180 s first, 180 s gap, 60 s after a rewarded ad', () => {
    expect([ads.interstitial.firstSec, ads.interstitial.gapSec, ads.interstitial.afterRewardedSec]).toEqual([180, 180, 60]);
  });

  it('not before firstSec of play; then once in gapSec', () => {
    const g = createAdGate(rules);
    expect(g.interstitialBlock(0)).toBe('first');
    expect(g.interstitialBlock(179.9)).toBe('first');
    expect(g.interstitialBlock(180)).toBeNull();
    g.interstitialShown(180);
    expect(g.interstitialBlock(200)).toBe('gap');
    expect(g.interstitialBlock(359.9)).toBe('gap');
    expect(g.interstitialBlock(360)).toBeNull();
  });

  it('not within afterRewardedSec of a rewarded ad; rewarded ads keep their common gap', () => {
    const g = createAdGate(rules);
    expect(g.rewardedReady(10)).toBe(true);
    g.rewardedDone(300);
    expect(g.rewardedReady(300 + rules.rewardedGapSec - 1)).toBe(false);
    expect(g.rewardedReady(300 + rules.rewardedGapSec)).toBe(true);
    expect(g.interstitialBlock(359)).toBe('rewarded');
    expect(g.interstitialBlock(360)).toBeNull();
  });

  it('a run of taps blocks it; a single tap between screens does not', () => {
    const g = createAdGate(rules);
    g.tap(400);
    expect(g.interstitialBlock(400)).toBeNull();
    for (let i = 0; i < rules.seriesTaps; i++) g.tap(400.2 + i * 0.1);
    expect(g.interstitialBlock(400.6)).toBe('series');
    expect(g.interstitialBlock(400.6 + rules.seriesSec + 0.1)).toBeNull();
  });
});
