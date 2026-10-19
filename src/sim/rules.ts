// What: pure game formulas over content data (docs/01a): hatch time, rarity and species pick, creature price and feeding, upgrade prices.
// Called by: src/sim/game.ts, scripts/balance-model.ts, tests/*.test.ts.
// Keep: no state and no randomness of its own (a roll in [0, 1) comes in as an argument); every number comes from content.

import type { EggData, EggsData, RarityName, ShelfData, SpeciesData, SpeciesEntry, UnlockData, UpgradeData } from '../content/schemas.ts';
import { RARITIES, type CareData } from '../content/schemas.ts';

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
/** Egg care so far (docs/01 §3 p. 12): taps of warmth, portions of food, seconds ready and waiting. */
export interface CareState {
  taps: number;
  fed: number;
  ripeSec: number;
}

/** The care bonus b: warmth steps, food portions and ripening, capped at maxBonus. */
export function careBonus(c: CareState, data: CareData): number {
  const warm = Math.min(data.warm.steps, Math.floor(c.taps / data.warm.tapsPerStep)) * data.warm.bonus;
  const food = Math.min(data.feed.steps, c.fed) * data.feed.bonus;
  const ripe = c.ripeSec >= data.ripe.afterSec ? data.ripe.bonus : 0;
  return Math.min(data.maxBonus, warm + food + ripe);
}

/**
 * Care shifts the odds: share b of every rarity moves one step up (the top keeps its own), so they still sum to 100.
 * FB-05: into VIP and exclusive only b × topShare moves — their price is a jump (10–15× the egg), the step below them is not.
 */
export function careChances(chances: EggData['chances'], b: number, topShare = 1): EggData['chances'] {
  const out = { ...chances };
  const vip = RARITIES.indexOf('vip');
  const share = (to: number): number => (to >= vip ? b * topShare : b);
  RARITIES.forEach((r, i) => {
    const below = i > 0 ? chances[RARITIES[i - 1]!] * share(i) : 0;
    out[r] = (i === RARITIES.length - 1 ? chances[r] : chances[r] * (1 - share(i + 1))) + below;
  });
  return out;
}

/** The shell color step for the care bonus: 0 — the egg's own color, then one step per share of maxBonus. */
export function careLevel(b: number, data: CareData): number {
  const top = data.shell.length - 1;
  if (b <= 1e-9 || data.maxBonus <= 0) return 0;
  return Math.min(top, Math.max(1, Math.round((b / data.maxBonus) * top)));
}

/** What is inside an egg (the egg card, M3-04): every species it can hatch with its chance — the rarity share split evenly. */
export function eggOdds(chances: EggData['chances'], data: SpeciesData): Array<{ species: string; rarity: RarityName; chance: number }> {
  const out: Array<{ species: string; rarity: RarityName; chance: number }> = [];
  for (const r of RARITIES) {
    const pool = data.species.filter((s) => s.rarity === r);
    if (chances[r] <= 0 || !pool.length) continue;
    for (const s of pool) out.push({ species: s.id, rarity: r, chance: chances[r] / pool.length });
  }
  return out;
}

/** The price range of a creature (M3-05): low — «sell now» at once, high — the top of «above the market». */
export function priceRange(appraisal: number, range: { low: number; high: number }): { low: number; high: number } {
  return { low: Math.max(1, coins(appraisal * range.low)), high: Math.max(1, coins(appraisal * range.high)) };
}

/** The zone of an asking price on the slider (M3-06): 0…5 from far below the market to far above; share = ask / appraisal. */
export function priceZone(share: number, slider: { min: number; max: number; delay: readonly number[] }): number {
  const n = slider.delay.length;
  const k = (share - slider.min) / (slider.max - slider.min);
  return Math.min(n - 1, Math.max(0, Math.floor(k * n)));
}

/** Seconds until a buyer writes (M3-06): the base 8–15 s by roll, times the zone's delay — cheap goes fast, dear takes long. */
export function replyDelay(share: number, roll: number, market: { replySec: { min: number; max: number }; slider: { min: number; max: number; delay: readonly number[] } }): number {
  const base = market.replySec.min + (market.replySec.max - market.replySec.min) * roll;
  return base * (market.slider.delay[priceZone(share, market.slider)] ?? 1);
}

/** Side job (M3-12): coins per tap and the price of the next level on the ×priceGrowth ladder. */
export function workPay(level: number, w: { coinsPerTap: number; incomeGrowth: number }): number {
  return Math.max(1, coins(w.coinsPerTap * Math.pow(w.incomeGrowth, Math.max(0, level - 1))));
}
export function workPrice(level: number, w: { price1: number; priceGrowth: number }): number {
  return Math.max(1, coins(w.price1 * Math.pow(w.priceGrowth, Math.max(0, level - 1))));
}

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

/** FB-02: the mean base price of the species of a rarity (a value table names the rarity's worth; species keep their spread). */
export function rarityMean(data: SpeciesData, rarity: RarityName): number {
  const pool = data.species.filter((s) => s.rarity === rarity);
  return pool.length ? pool.reduce((n, s) => n + s.basePrice, 0) / pool.length : 1;
}

/** FB-02: the price an egg's value table counts from — its coin price, valuePrice, or minutes of the player's income. */
export function eggValuePrice(egg: EggData, incomePerMin: number): number {
  if (egg.valueIncomeMin !== undefined) return Math.max(egg.valuePrice ?? 1, incomePerMin * egg.valueIncomeMin);
  return egg.valuePrice ?? Math.max(1, egg.price.coins);
}

/** FB-02: the price multiplier of a creature hatched from the egg: value[rarity] × the egg's price over the rarity's mean (valueMult without a table). */
export function hatchMult(egg: EggData, rarity: RarityName, data: SpeciesData, incomePerMin: number): number {
  if (!egg.value) return egg.valueMult ?? 1;
  return (eggValuePrice(egg, incomePerMin) * egg.value[rarity]) / rarityMean(data, rarity);
}

/** FB-02: the moving average of income — coins earned in dt seconds into coins a minute, over tau seconds. */
export function incomeStep(rate: number, earned: number, dt: number, tauSec: number): number {
  const k = Math.min(1, dt / tauSec);
  return Math.max(0, rate + ((earned * 60) / Math.max(dt, 1e-9) - rate) * k);
}

/** Appraisal of a creature: basePrice × growth^(level − 1) (docs/01a, section 3); the customer offers a share of it. */
export function creatureValue(spec: SpeciesEntry, level: number): number {
  return spec.basePrice * Math.pow(spec.growth, Math.max(0, Math.min(level, spec.maxLevel) - 1));
}

/** Coins shown and paid: whole coins, at least 1. */
export function coins(value: number): number {
  return Math.max(1, Math.round(value));
}

/** Feeding taps from this level to the next: tapsPerLevelBase + 1 per 2 levels (docs/01a, section 3), and from M2 at least
 * base × tapGrowth^(level − 1): high levels cost more taps, so feeding to the top pays but never breaks the economy. */
export function tapsForLevel(level: number, base: number, tapGrowth = 1): number {
  const l = Math.max(1, level);
  return Math.max(base + Math.floor(l / 2), Math.ceil(base * Math.pow(tapGrowth, l - 1) - 1e-9));
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
  /** Price-tag multiplier on top of the level price: shelf growth and price tags (1 = none). */
  valueMult?: number | undefined;
}

/** What the customer pays for this creature, in whole coins (docs/01, section 3.4; docs/01a, section 4). */
export function offerFor(spec: SpeciesEntry, level: number, p: OfferParams): number {
  let k = p.share * p.mult * (1 + (p.cashBonus ?? 0)) * (p.valueMult ?? 1);
  if (p.rarityBonus && spec.rarity !== 'common') k *= 1 + p.rarityBonus;
  if (p.levelBonusPerLevel) k *= 1 + p.levelBonusPerLevel * Math.max(0, level - 1);
  return coins(creatureValue(spec, level) * k);
}

/** Showcase growth (docs/01, section 3.5): +growthPerMin of the price per minute on the shelf, capped; speed multiplies the rate (radio). */
export function shelfBonus(ageSec: number, shelf: ShelfData, speed = 1): number {
  return Math.min(shelf.maxBonus, Math.max(0, (ageSec / 60) * shelf.growthPerMin * speed));
}

export interface UnlockFacts {
  deals: number;
  /** The seller level (UB-08, reputation.json). */
  level: number;
  hatched: number;
  levelUps: number;
  haggles: number;
  /** Upgrade levels bought. */
  upgrades: Record<string, number>;
  /** M4-08: the city of the shop, 1 + rebirths (missing: 1). */
  city?: number;
  /** Open district ids. */
  districts: string[];
}

/** Is a condition of content (unlock of an egg, a district, a shop position) met for this player. */
export function unlockMet(u: UnlockData | undefined, f: UnlockFacts): boolean {
  if (!u || u.type === 'start') return true;
  if (u.type === 'deals') return f.deals >= u.count;
  if (u.type === 'stat') return f[u.stat] >= u.count;
  if (u.type === 'upgrade') return (f.upgrades[u.id] ?? 0) > 0;
  if (u.type === 'district') return f.districts.includes(u.id);
  if (u.type === 'level') return f.level >= u.n;
  if (u.type === 'city') return (f.city ?? 1) >= u.n;
  return false;
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

/** Is the egg on sale for this player (docs/01a, section 2): start, after N deals, with a district; special eggs come with M3. */
export function eggUnlocked(egg: EggData, facts: UnlockFacts): boolean {
  return !egg.special && unlockMet(egg.unlock, facts);
}

/** UB-08: the seller level for reputation points (levels[i] — points for level i + 1): the level, its threshold and the next one (null at the top). */
export function repLevel(xp: number, levels: readonly number[]): { level: number; base: number; next: number | null } {
  let i = 0;
  while (i + 1 < levels.length && xp + 1e-9 >= (levels[i + 1] ?? Infinity)) i++;
  return { level: i + 1, base: levels[i] ?? 0, next: levels[i + 1] ?? null };
}

/** M4-06, M4-08: what the next move to a new city needs — coins earned in this city — and the income multiplier it brings. */
export function rebirthNeed(rebirths: number, p: { thresholdCoinsEarned: number; thresholdGrowth: number }): number {
  return nicePrice(p.thresholdCoinsEarned * Math.pow(p.thresholdGrowth, Math.max(0, rebirths)));
}
export function cityMult(rebirths: number, bonus: number): number {
  return 1 + bonus * Math.max(0, rebirths);
}

/** M4-07, M4-23: a stable number for a day of the device and a save (FNV-1a of «day:seed»): the same day, the same pick. */
export function dayHash(day: string, seed: number): number {
  let h = 0x811c9dc5;
  for (const ch of `${day}:${Math.floor(seed)}`) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/**
 * M4-23: the mood of the market for a day — one species in fashion, another everybody is fed up with; the same day and save
 * always give the same pair (FNV-1a of «day:seed»), a new day a new pair.
 */
export function marketMood(day: string, seed: number, ids: readonly string[]): { hot: string; cold: string } | null {
  if (!day || ids.length < 2) return null;
  const h = dayHash(day, seed);
  const hot = h % ids.length;
  const cold = (hot + 1 + ((h >>> 8) % (ids.length - 1))) % ids.length;
  return { hot: ids[hot]!, cold: ids[cold]! };
}

/** M4-21: a weighted pick — roll in [0, 1) over the weights; the events (and anything else by weight) choose this way. */
export function pickWeighted<T extends { weight: number }>(items: readonly T[], roll: number): T | undefined {
  const total = items.reduce((n, x) => n + Math.max(0, x.weight), 0);
  if (!items.length || total <= 0) return undefined;
  let r = Math.min(0.999999, Math.max(0, roll)) * total;
  for (const x of items) if ((r -= Math.max(0, x.weight)) < 0) return x;
  return items[items.length - 1];
}
