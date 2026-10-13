// What: pure game formulas over content data (docs/01a): hatch time, rarity and species pick, creature price and feeding, upgrade prices.
// Called by: src/sim/game.ts, scripts/balance-model.ts, tests/*.test.ts.
// Keep: no state and no randomness of its own (a roll in [0, 1) comes in as an argument); every number comes from content.

import type { EggData, EggsData, RarityName, SpeciesData, SpeciesEntry, UpgradeData } from '../content/schemas.ts';
import { RARITIES } from '../content/schemas.ts';

const EPS = 1e-6;

/** Seconds an egg needs with the speed upgrade applied (speedBonus is negative: −0.10 = 10% faster). */
export function hatchNeedSec(egg: EggData, speedBonus = 0): number {
  return egg.hatchSec * Math.max(0, 1 + speedBonus);
}

/** True when the egg is done: enough progress (time + taps) and never faster than minHatchSec of real game time. */
export function isHatched(progress: number, elapsed: number, need: number, eggs: EggsData): boolean {
  return progress + EPS >= need && elapsed + EPS >= Math.min(need, eggs.minHatchSec);
}

/** Share of hatching done, 0..1, for the progress ring. */
export function hatchShare(progress: number, need: number): number {
  return need <= 0 ? 1 : Math.min(1, Math.max(0, progress / need));
}

/** Rarity by the egg's percent table; roll is uniform in [0, 1). */
export function pickRarity(chances: EggData['chances'], roll: number): RarityName {
  const total = RARITIES.reduce((s, r) => s + chances[r], 0);
  let x = roll * total;
  for (const r of RARITIES) {
    if (chances[r] <= 0) continue;
    if (x < chances[r]) return r;
    x -= chances[r];
  }
  return [...RARITIES].reverse().find((r) => chances[r] > 0) ?? 'common';
}

/** One species of the rarity, evenly; falls back to the nearest lower rarity that has species. */
export function pickSpecies(data: SpeciesData, rarity: RarityName, roll: number): SpeciesEntry {
  for (let i = RARITIES.indexOf(rarity); i >= 0; i--) {
    const pool = data.species.filter((s) => s.rarity === RARITIES[i]);
    if (pool.length) return pool[Math.min(pool.length - 1, Math.floor(roll * pool.length))] as SpeciesEntry;
  }
  return data.species[0] as SpeciesEntry;
}

/** Appraisal of a creature: basePrice × growth^(level − 1) (docs/01a, section 3); the customer offers a share of it. */
export function creatureValue(spec: SpeciesEntry, level: number): number {
  return spec.basePrice * Math.pow(spec.growth, Math.max(0, Math.min(level, spec.maxLevel) - 1));
}

/** Coins shown and paid: whole coins, at least 1. */
export function coins(value: number): number {
  return Math.max(1, Math.round(value));
}

/** Feeding taps from this level to the next: tapsPerLevelBase + 1 per 2 levels (docs/01a, section 3). */
export function tapsForLevel(level: number, base: number): number {
  return base + Math.floor(Math.max(1, level) / 2);
}

export interface OfferParams {
  /** Share of the appraisal this customer offers, rolled once on arrival (offer.min..offer.max). */
  share: number;
  /** Product of the successful haggles (1 + bonus each). */
  mult: number;
  rarityBonus?: number | undefined;
  levelBonusPerLevel?: number | undefined;
  /** Register upgrade: +x to every deal (docs/01a, section 5). */
  cashBonus?: number | undefined;
}

/** What the customer pays for this creature, in whole coins (docs/01, section 3.4; docs/01a, section 4). */
export function offerFor(spec: SpeciesEntry, level: number, p: OfferParams): number {
  let k = p.share * p.mult * (1 + (p.cashBonus ?? 0));
  if (p.rarityBonus && spec.rarity !== 'common') k *= 1 + p.rarityBonus;
  if (p.levelBonusPerLevel) k *= 1 + p.levelBonusPerLevel * Math.max(0, level - 1);
  return coins(creatureValue(spec, level) * k);
}

/** Two significant digits (117.7 → 120, 1019 → 1000): prices that read at a glance. */
export function nicePrice(x: number): number {
  if (x < 10) return Math.max(1, Math.round(x));
  const p = Math.pow(10, Math.floor(Math.log10(x)) - 1);
  return Math.round(x / p) * p;
}

/** Price of the next purchase when `owned` levels are bought: a geometric row from price1 to priceMax (docs/01a, section 5). */
export function upgradePrice(u: UpgradeData, owned: number): number {
  if (u.levels <= 1) return u.price1;
  const k = Math.max(0, Math.min(owned, u.levels - 1));
  return nicePrice(u.price1 * Math.pow(u.priceMax / u.price1, k / (u.levels - 1)));
}

/** Is the egg on sale for this player (docs/01a, section 2): start, after N deals; districts and milestones open later (M2, M3). */
export function eggUnlocked(egg: EggData, deals: number): boolean {
  if (egg.special) return false;
  if (egg.unlock.type === 'start') return true;
  if (egg.unlock.type === 'deals') return deals >= egg.unlock.count;
  return false;
}
