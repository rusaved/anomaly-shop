// What: seeded random numbers (mulberry32) for the sim: egg rarity, customer offers, haggle outcomes.
// Called by: src/sim/game.ts (one rng per game), tests and scripts/balance-model.ts with fixed seeds.
// Keep: no Math.random in core and sim (architecture test); the same seed gives the same sequence everywhere.

export interface Rng {
  /** Uniform in [0, 1). */
  next(): number;
  /** Uniform in [min, max). */
  range(min: number, max: number): number;
  /** Integer in [0, n). */
  int(n: number): number;
  /** Current internal state (to continue a sequence later). */
  state(): number;
}

export function createRng(seed: number): Rng {
  let s = Math.floor(seed) >>> 0 || 0x9e3779b9;
  const next = (): number => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (min, max) => min + (max - min) * next(),
    int: (n) => Math.min(n - 1, Math.floor(next() * n)),
    state: () => s,
  };
}
