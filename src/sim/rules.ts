// What: pure game formulas over content data (docs/01a): hatch time, rarity and species pick, creature price and feeding, upgrade prices.
// Called by: src/sim/game.ts, scripts/balance-model.ts, tests/*.test.ts.
// Keep: no state and no randomness of its own (a roll in [0, 1) comes in as an argument); every number comes from content.

import type { EggData, EggsData, RarityName, SpeciesData, SpeciesEntry } from '../content/schemas.ts';
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
