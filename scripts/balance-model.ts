// `npm run sim:balance` (docs/01a, section 9): the real game (src/sim) played headless by bots with human pace,
// many seeds per bot; time checks on the slowest 10% of runs (p90), pace checks on the median. Exit 1 when a check fails.
//   Short run (10 min, every bot): F1 first deal ≤ 40 s · F2 100 coins earned ≤ 2 min · F3 first upgrade ≤ 3 min · F4 first rare ≤ 5 min
//     · F5 income per minute at 8–10 min ≥ 1.3 × at 1–3 min (Q-027 B: 1.5 at the bot pace; live, the first minutes carry the
//       first-minute script's rare sale and deals wait for buyers) · F10 no stall (a deal every minute after the first) without ads
//     · F11 (M2-12) in minutes 3–10 a shop goal (an upgrade or, from M3, a new egg) within 3 minutes of income (Q-027 B: the last
//       two minutes, live tempo) at every check
//     · F13–F15 (M3-14): a chat deal within 60 s after the first minute, a market buy resold at a profit by 5 min, the second ladder egg by 10 min
//     · F16 (UB-08, Q-027 B): seller levels 2–5 by 1.5, 3, 4.5 and 6 minutes
//   Q-027 B (M4-00): the bots play at a live tempo — the hatch show and its result, tab switches, chats and cards cost the
//     seconds of content/pace.json and feel.json hatchShowSec; the limits of F1–F3, F11, F16 are for that tempo.
//   Long run (3 days of 30 active minutes and 8 hours away, casual and slow bots): F6 8 h away pays 30–60 min of play (casual)
//     · F19 (FB-03, Q-039 B) an hour away pays 30–50 % of an hour of play (up to 2 hours), the seller level grows ≤ 1 away
//   F20 (FB-05): full egg care at least doubles the VIP and exclusive share of every ladder egg and pays for its food.
//     · F7 the rebirth threshold on day 2–3 · F8 district 2 by 10 min, district 3 by 40 min of play. F9 (ads, M5-02): the share of eggs for videos and what the ad points add at most in a day of 30 minutes (info).
//   Week (M4-08, casual): F17 something new opens every day of 7, the guest zone pays its upkeep (M4-05) · F18 the second city
//     1–3 days after the first, its egg bought.
//   Keeper (feeds every creature to the top before selling): F12 earns at most ×2 of the casual player in 10 min and
//     crosses the rebirth threshold no earlier than the first night (feeding pays, never breaks the economy).
// Usage: node scripts/balance-model.ts [--seeds 24] [--out docs/evidence/M2/balance.txt]
// Erasable TypeScript only: Node runs this file without a bundler (relative .ts imports).
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createRng } from '../src/core/rng.ts';
import { createGame, type Game, type GameContent, type GameEvent } from '../src/sim/game.ts';
import { ftueHint } from '../src/sim/ftue.ts';
import { careChances } from '../src/sim/rules.ts';
import { RARITIES } from '../src/content/schemas.ts';
import { newSave } from '../src/sim/state.ts';
import { createStore } from '../src/sim/store.ts';
import { loadGameContent, loadPace, type Pace } from './load-game-content.ts';

export interface Bot {
  name: string;
  /** Taps (any action) per second. */
  tapsPerSec: number;
  /** Seconds to notice a new hint, an affordable upgrade or a new egg. */
  reactSec: number;
  /** Feeds a creature up to this level before selling it. */
  sellLevel: number;
  /** Haggles once when the leave risk is at most this (0 = never). */
  haggleRisk: number;
  /** Buys the dearest open egg it can afford twice over (false: basic eggs only). */
  bestEggs: boolean;
  /** Never taps a creature (the «feeding pays» check, Q-027 B). */
  noFeed?: boolean;
  /** Never decorates the guest zone (the «decorations pay their upkeep» check, M4-05). */
  noDecor?: boolean;
}

export const BOTS: Bot[] = [
  { name: 'casual', tapsPerSec: 3, reactSec: 1.2, sellLevel: 2, haggleRisk: 0, bestEggs: true },
  { name: 'rusher', tapsPerSec: 2.5, reactSec: 1.5, sellLevel: 1, haggleRisk: 0, bestEggs: true },
  { name: 'tapper', tapsPerSec: 5, reactSec: 0.8, sellLevel: 3, haggleRisk: 0.25, bestEggs: true },
  { name: 'slow', tapsPerSec: 1.5, reactSec: 3, sellLevel: 2, haggleRisk: 0, bestEggs: true },
];

/** Feeds every creature to its max level before selling it (a natural way to play with the MAX badge, M2 review). */
export const KEEPER: Bot = { name: 'keeper', tapsPerSec: 3, reactSec: 1.2, sellLevel: 99, haggleRisk: 0, bestEggs: true };

export interface Check {
  id: string;
  title: string;
  limitSec: number;
}

export const CHECKS: Check[] = [
  { id: 'F1', title: 'first deal', limitSec: 40 },
  { id: 'F2', title: '100 coins earned', limitSec: 120 },
  { id: 'F3', title: 'first upgrade', limitSec: 180 },
  { id: 'F4', title: 'first rare', limitSec: 300 },
  // M3 (docs/01 §3 p. 13–14): the genre-standard frame pays early.
  { id: 'F13', title: 'first deal through a chat, after the first minute', limitSec: 60 },
  // Q-026 B, Q-027 B: the Market opens at seller level 3 (2–3 minutes live) — the first resale within 10 minutes.
  { id: 'F14', title: 'a market buy resold at a profit', limitSec: 600 },
  { id: 'F15', title: 'an egg of the second ladder step', limitSec: 600 },
  // UB-08, Q-027 B: the seller level grows from deals — at a live tempo a new level every 1–1.5 minutes
  // (the UB game designer: do not lower the level thresholds for F16, live it is already one a minute or so).
  { id: 'F16.2', title: 'seller level 2', limitSec: 90 },
  { id: 'F16.3', title: 'seller level 3', limitSec: 180 },
  { id: 'F16.4', title: 'seller level 4', limitSec: 270 },
  { id: 'F16.5', title: 'seller level 5', limitSec: 360 },
];

/** Pace and long-run limits of docs/01a, section 9 (F11 from docs/01b, section 5.1). */
export const LIMITS = {
  F5growth: 1.3,
  F6minutes: [30, 60] as const,
  F7days: [2, 3] as const,
  F8street: 600,
  F8square: 2400,
  F11goalMinutes: 3,
  F12keeperMax: 2,
  /** M4-08: F17 — at least this many new things a day (opened or first bought: eggs, districts, upgrades; a city) in each of 7 days. */
  F17opensPerDay: 1,
  /** M4-05: F17 — in a week the guest zone adds to the deals at least this share of what it costs (decorations and upkeep). */
  F17decorMin: 1,
  /** M4-08: F18 — days from the first move to the second. */
  F18gapDays: [1, 3] as const,
  /** FB-03 (Q-039 B): an hour away against an hour of play. */
  F19share: [0.3, 0.5] as const,
  /** F11 is the criterion of M2-12 (the ladder of 8 things): reported from M2-09, failing the run from M2-12. */
  F11enforced: true,
};

/** Model step: coarser than the game's 1/60 s, finer than any bot action (0.2 s and up). */
const STEP = 1 / 30;
const SHORT_SEC = 600;
const DAY_ACTIVE_SEC = 30 * 60;
const AWAY_SEC = 8 * 3600;
const WEEK_DAYS = 7;

export interface RunResult {
  times: Record<string, number>;
  deals5min: number;
  coins5min: number;
  /** coinsEarned at the end of every whole minute. */
  earned: number[];
  /** Checks in minutes 3–10 without a shop goal within reach. */
  goalMisses: number;
  /** A whole minute without a deal after the first minute. */
  stalled: boolean;
}

/** One bot plays a game: returns the act function that makes one decision and says how long it took (Q-027 B: with the interface). */
export function botPlayer(bot: Bot, game: Game, pace: Pace = loadPace()): () => number {
  let lastHint = '';
  const tap = 1 / bot.tapsPerSec;
  /** The tab the bot is on: another one costs a tab switch, home «Eggs» (the shop and its eggs) a close (M4-00: ✕, the tab, the shop). */
  let at = 'eggs';
  const go = (tab: string): number => {
    if (tab === at) return 0;
    at = tab;
    return tab === 'eggs' ? pace.closeSec : pace.tabSec;
  };
  /** Opening an egg: the strip runs, the result shows, a button; the creature goes to the shop from the result («To the shop»). */
  const hatchCost = (): number => {
    const v = game.view();
    const fresh = v.inventory[v.inventory.length - 1];
    if (fresh && game.freeSlots() > 0) game.list(fresh.uid);
    return tap + pace.hatchSec + pace.resultSec;
  };
  const ladder = new Set(game.content.eggs.eggs.filter((e) => e.section === 'ladder').map((e) => e.id));
  const cityEggs = new Set(game.content.eggs.eggs.filter((e) => e.unlock.type === 'city').map((e) => e.id));
  /** The bot's own clock (the sum of its action times) and what it earned a minute ago: its sense of income. */
  let clock = 0;
  const seen: Array<{ at: number; earned: number }> = [];
  const perMin = (): number => {
    const earned = game.state.stats.coinsEarned;
    seen.push({ at: clock, earned });
    while (seen.length > 1 && clock - seen[1]!.at >= 60) seen.shift();
    const first = seen[0]!;
    return clock - first.at >= 30 ? ((earned - first.earned) * 60) / (clock - first.at) : 0;
  };
  const decide = (): number => {
    const st = game.state;
    // M4-06: a live player moves to the new city once the «Next» card says it is ready (the card, then «Move»).
    if (game.rebirthView().ready && game.rebirth()) {
      at = 'eggs';
      return pace.cardSec * 2;
    }
    const view = game.view();
    const hint = ftueHint(st, view);
    if (hint) {
      if (hint.step !== lastHint) {
        lastHint = hint.step;
        return bot.reactSec;
      }
      if (hint.step === 'tapEgg' || hint.step === 'hatchRare') {
        const before = st.stats.hatched;
        game.tapIncubator(hint.target.kind === 'incubator' ? hint.target.index : 0);
        return game.state.stats.hatched > before ? go('eggs') + hatchCost() : tap;
      }
      if (hint.step === 'feed' && view.creatures[0]) game.tapCreature(view.creatures[0].uid);
      else if (hint.step === 'list' && view.inventory[0]) {
        game.list(view.inventory[0].uid);
        return go('sales') + pace.cardSec;
      } else if (hint.step === 'sell') {
        const open = game.chats().find((c) => c.state === 'open');
        if (open) game.chatSell(open.id);
        return go('chats') + pace.chatSec;
      } else if (hint.step === 'buyEgg') {
        game.buyEgg();
        return go('eggs') + pace.cardSec;
      }
      return tap;
    }
    // UB-05: buyers only write — answer (a counter once when the offer is below the asking price, then sell).
    // Only about a creature the bot would sell anyway (its sell level): the rest it keeps feeding, the buyer waits.
    // Q-027 B: a live player does not keep a buyer waiting long — after 15 s, or with two letters waiting, the creature goes as it is.
    const open = game.chats().filter((c) => c.state === 'open');
    const chat = open.find((c) => open.length >= 2 || (c.age ?? 0) >= 15 || view.talking.some((x) => x.uid === c.uid && x.level >= Math.min(bot.sellLevel, x.maxLevel)));
    if (chat) {
      const ask = view.talking.find((c) => c.uid === chat.uid)?.ask ?? 0;
      if (bot.haggleRisk > 0 && chat.offer < ask && game.canCounter(chat.id)) game.chatCounter(chat.id);
      else game.chatSell(chat.id);
      // The Chats tab (its count is in view), the letter, «Sell».
      return go('chats') + pace.chatSec;
    }
    const lot = game.market().lots.find((l) => !l.sold && l.verdict === 'below' && st.coins >= l.price * 3);
    // UB-05: a bought lot waits in the inventory when the shelf is full, like a hatched one.
    if (lot) {
      game.buyLot(lot.id);
      return go('market') + pace.cardSec + bot.reactSec;
    }
    // A new egg with the «New!» badge: tried once as soon as it is affordable (players react to the badge like to the upgrade dot;
    // UB-01: the egg screen is the home screen, the badge is in view all the time).
    const freshEgg = game.eggList().find((e) => e.fresh && e.check.ok && st.coins >= e.check.price * (cityEggs.has(e.id) ? 1 : 1.25));
    if (freshEgg) {
      game.buyEgg(freshEgg.id);
      return go('eggs') + pace.cardSec + bot.reactSec;
    }
    // Q-027 B: a new egg of the ladder with its «New!» badge is what a live player saves for (eggs are the main sink of the genre
    // standard): the upgrades wait until it is bought. Upgrades as soon as the dot shows otherwise (cheapest first).
    // Within reach: the egg costs at most 3 minutes of the income of the last minute; the egg a new city opens (the top of
    // the ladder, M4-08: the «Next» card shows it) is worth a whole session of saving.
    const income = perMin();
    const goal = game.eggList().find((e) => e.fresh && ladder.has(e.id) && e.check.price <= st.coins + income * (cityEggs.has(e.id) ? 30 : 3));
    const saving = Boolean(goal);
    // Helpers first (the shop works while the player is away — the idle goal a player aims at once it shows).
    const helper = (id: string): number => (id.startsWith('helper_') ? 0 : 1);
    // Saving still allows the small things (≤ 5% of the egg): a day of saving is not a day of nothing.
    const upgrade = game.upgradeList().filter((u) => u.affordable && (!goal || u.price <= goal.check.price * 0.05)).sort((a, b) => helper(a.id) - helper(b.id) || a.price - b.price)[0];
    if (upgrade) {
      game.buyUpgrade(upgrade.id);
      return go('shop') + tap + bot.reactSec;
    }
    // M4-05: the guest zone — a decoration once it is affordable twice over (cheapest first), not while saving.
    const zone = bot.noDecor || goal ? null : game.guestZone();
    const decoration = zone?.open ? zone.items.filter((x) => !x.owned && st.coins >= x.price * 2).sort((a, b) => a.price - b.price)[0] : undefined;
    if (decoration && game.buyGuest(decoration.id)) return go('shop') + pace.cardSec;
    // A ready egg waits for a tap (M3-02; FB-08: it never opens by itself): a player opens it once the shop's
    // own errands are done (FB-08: it never opens by itself, the courier opens only the eggs it brought).
    const readyEgg = view.incubators.findIndex((i) => i.ready);
    if (readyEgg >= 0) {
      const before = st.stats.hatched;
      game.tapIncubator(readyEgg);
      return game.state.stats.hatched > before ? go('eggs') + hatchCost() : tap;
    }
    // A hatched creature waits in the inventory: on the shelf it goes while there is room (UB-03: the result's «To the shop»).
    if (view.inventory[0] && game.freeSlots() > 0) {
      game.list(view.inventory[0].uid);
      // From the hatch result «To the shop» opens the price card (UB-10): a look at the slider, then back.
      return go('sales') + pace.cardSec;
    }
    // The creature on the shelf is right there in the shop: a live player taps it while the buyer is on the way (its price grows,
    // the buyer's offer follows the level it has when the buyer writes).
    const onShelf = bot.noFeed ? undefined : view.creatures.filter((c) => c.level < Math.min(bot.sellLevel, c.maxLevel)).sort((a, b) => a.price - b.price)[0];
    if (onShelf) {
      game.tapCreature(onShelf.uid);
      return go('eggs') + tap;
    }
    // Keep the incubators busy: the dearest egg affordable 1.5 times over (Q-027 B), else a basic one; a player with a pile to sell
    // sells first (UB-05: eggs take no shelf place, so nothing else stops the pile).
    const eggs = view.inventory.length < 2 + view.slots ? game.eggList().filter((e) => e.check.ok) : [];
    const best = bot.bestEggs ? eggs.filter((e) => st.coins >= e.check.price * 1.5).sort((a, b) => b.check.price - a.check.price)[0] : undefined;
    const pick = best ?? eggs.find((e) => e.id === eggs[0]?.id);
    if (pick && (best || game.canBuyEgg().ok)) {
      game.buyEgg(pick.id);
      return go('eggs') + pace.cardSec;
    }
    // Feed the cheapest creature still below the sale level, else speed up an egg.
    const hungry = bot.noFeed ? undefined : [...view.talking, ...view.creatures].filter((c) => c.level < Math.min(bot.sellLevel, c.maxLevel)).sort((a, b) => a.price - b.price)[0];
    if (hungry) {
      game.tapCreature(hungry.uid);
      return go('eggs') + tap;
    }
    const egg = view.incubators.findIndex((i) => i.egg && !i.waiting);
    if (egg >= 0) {
      game.tapIncubator(egg);
      return go('eggs') + tap;
    }
    // Nothing to sell yet: feed what is there (raises the price).
    const any = bot.noFeed ? undefined : view.creatures.find((c) => c.level < c.maxLevel);
    if (any) {
      game.tapCreature(any.uid);
      return tap;
    }
    return tap;
  };
  return () => {
    const d = decide();
    clock += d;
    return d;
  };
}

function freshGame(content: GameContent, seed: number): Game {
  return createGame(createStore(newSave(0), () => 0), content, createRng(seed));
}

/** Is there a shop goal the player reaches within `minutes` of the current income (docs/01b, section 5.1, F11)? */
function goalWithin(game: Game, perMin: number, minutes: number): boolean {
  const reach = game.state.coins + perMin * minutes;
  // From M3 a new egg of the ladder (opened, not bought yet) is a goal too: eggs are the main coin sink of the genre standard.
  if (game.eggList().some((e) => e.fresh && e.check.price <= reach)) return true;
  return game.upgradeList().some((u) => !u.maxed && u.price <= (game.content.upgrades.upgrades.find((x) => x.id === u.id)?.currency === 'crystals' ? game.state.crystals : reach));
}

/** One bot plays one fresh profile for 10 game minutes. */
export function playOnce(bot: Bot, seed: number, content: GameContent = loadGameContent()): RunResult {
  const game = freshGame(content, seed);
  const times: Record<string, number> = {};
  let t = 0;
  let busyUntil = 1.5; // looks at the screen first
  const paid = new Map<string, number>();
  let ftueAt = -1;
  const secondEgg = content.eggs.eggs.filter((e) => e.section === 'ladder')[1]?.id;
  game.events.on((e: GameEvent) => {
    if (e.type === 'ftueDone') ftueAt = t;
    if (e.type === 'sold' && e.customerId > 0 && times.F13 === undefined && ftueAt >= 0) times.F13 = t - ftueAt;
    if (e.type === 'lotBought') paid.set(e.uid, e.price);
    if (e.type === 'sold' && times.F14 === undefined && (paid.get(e.uid) ?? Infinity) < e.price) times.F14 = t;
    if (e.type === 'eggBought' && e.egg === secondEgg && times.F15 === undefined) times.F15 = t;
    if (e.type === 'sold' && times.F1 === undefined) times.F1 = t;
    if (e.type === 'upgradeBought' && times.F3 === undefined) times.F3 = t;
    if (e.type === 'repUp' && e.level >= 2 && e.level <= 5) for (let l = 2; l <= e.level; l++) times[`F16.${l}`] ??= t;
    if (e.type === 'hatched' && e.rarity !== 'common' && times.F4 === undefined) times.F4 = t;
  });
  const act = botPlayer(bot, game);
  let deals5min = 0;
  let coins5min = 0;
  const earned: number[] = [];
  const dealsAt: number[] = [];
  let goalMisses = 0;
  let nextGoalCheck = 180;
  while (t < SHORT_SEC) {
    if (t >= busyUntil) busyUntil = t + act();
    game.tick(STEP);
    t += STEP;
    const st = game.state;
    if (times.F2 === undefined && st.stats.coinsEarned >= 100) times.F2 = t;
    if (deals5min === 0 && t >= 300) {
      deals5min = st.stats.deals;
      coins5min = st.stats.coinsEarned;
    }
    if (t >= (earned.length + 1) * 60) {
      earned.push(st.stats.coinsEarned);
      dealsAt.push(st.stats.deals);
    }
    if (t >= nextGoalCheck) {
      nextGoalCheck += 10;
      const m = earned.length;
      // Q-027 B: the income of the last two minutes — a live player feels the pace over a couple of minutes, not one dip.
      const back = Math.min(2, m);
      const perMin = m >= 1 ? (earned[m - 1]! - (m > back ? earned[m - 1 - back]! : 0)) / back : 0;
      if (!goalWithin(game, perMin, LIMITS.F11goalMinutes)) goalMisses += 1;
    }
  }
  const stalled = dealsAt.some((d, i) => i >= 1 && d === dealsAt[i - 1]);
  return { times, deals5min, coins5min, earned, goalMisses, stalled };
}

export interface DaysResult {
  /** Active seconds when the street and the square opened (Infinity: not in 3 days). */
  street: number;
  square: number;
  /** Minutes of the last 10 active minutes of day 1 that 8 hours away pay. */
  awayMinutes: number;
  /** Day (1-based, fractional within the active part) the rebirth threshold of coins earned was crossed. */
  rebirthDay: number;
  /** FB-03: coins an hour of play (the last 10 minutes of day 1) and an hour away (the night of day 1, its counted hours). */
  onlineHour: number;
  offlineHour: number;
  /** FB-03: seller levels gained in the night of day 1. */
  awayLevels: number;
  /** M5-02: eggs hatched and deals made in the 30 active minutes of day 1 (the share of eggs for videos is measured against them). */
  hatchedDay1: number;
  dealsDay1: number;
}

/** Three days of a player: 30 active minutes, then 8 hours away (the shop works on), twice, then a third active half hour. */
export function playDays(bot: Bot, seed: number, content: GameContent = loadGameContent()): DaysResult {
  const game = freshGame(content, seed);
  const act = botPlayer(bot, game);
  const threshold = content.upgrades.prestige.thresholdCoinsEarned;
  let active = 0;
  let street = Infinity;
  let square = Infinity;
  let rebirthDay = Infinity;
  let awayMinutes = 0;
  let onlineHour = 0;
  let offlineHour = 0;
  let awayLevels = 0;
  let hatchedDay1 = 0;
  let dealsDay1 = 0;
  game.events.on((e: GameEvent) => {
    if (e.type === 'districtOpened' && e.district === 'street') street = Math.min(street, active);
    if (e.type === 'districtOpened' && e.district === 'square') square = Math.min(square, active);
  });
  for (let day = 1; day <= 3; day++) {
    let busyUntil = active + 1.5;
    const dayEnd = active + DAY_ACTIVE_SEC;
    let tenMinBefore = 0;
    while (active < dayEnd) {
      if (active >= busyUntil) busyUntil = active + act();
      game.tick(STEP);
      active += STEP;
      if (rebirthDay === Infinity && game.state.stats.coinsEarned >= threshold) rebirthDay = day - 1 + (active - (dayEnd - DAY_ACTIVE_SEC)) / DAY_ACTIVE_SEC;
      if (tenMinBefore === 0 && active >= dayEnd - 600) tenMinBefore = game.state.stats.coinsEarned;
    }
    if (day === 3) break;
    const perMin = (game.state.stats.coinsEarned - tenMinBefore) / 10;
    const before = game.state.stats.coinsEarned;
    const level = game.reputation().level;
    const away = game.offline(AWAY_SEC);
    if (day === 1) {
      hatchedDay1 = game.state.stats.hatched;
      dealsDay1 = game.state.stats.deals;
      awayMinutes = perMin > 0 ? away.coins / perMin : 0;
      onlineHour = perMin * 60;
      offlineHour = away.coins / (Math.min(AWAY_SEC, content.upgrades.offlineMaxHours * 3600) / 3600);
      awayLevels = game.reputation().level - level;
    }
    if (rebirthDay === Infinity && game.state.stats.coinsEarned >= threshold && before < threshold) rebirthDay = day + 0.0;
  }
  return { street, square, awayMinutes, rebirthDay, onlineHour, offlineHour, awayLevels, hatchedDay1, dealsDay1 };
}

export interface WeekResult {
  /** Days (fractional, 1-based) of every move to a new city. */
  moves: number[];
  /** Day the egg that opens in the second city was bought (Infinity: never). */
  cityEgg: number;
  /** New things each day 1–7: an egg, a district or an upgrade opens or is bought for the first time here, a new city. */
  opens: number[];
  /** Coins earned in the week. */
  earned: number;
  /** M4-05: what the guest zone added to the deals (its share of each offer) against what it cost (decorations and upkeep). */
  zoneGain: number;
  zoneCost: number;
  /** FB-02: per ladder egg — the best it can give (its exclusive) and what each hatch gave, in 5 minutes of income at that moment. */
  rewards: Record<string, { best: number[]; got: number[] }>;
}

/** M4-08: a week of a player — 30 active minutes and 8 hours away a day, moving to a new city whenever it is ready. */
export function playWeek(bot: Bot, seed: number, content: GameContent = loadGameContent()): WeekResult {
  const game = freshGame(content, seed);
  const act = botPlayer(bot, game);
  const cityEggs = new Set(content.eggs.eggs.filter((e) => e.unlock.type === 'city' && e.unlock.n === 2).map((e) => e.id));
  const moves: number[] = [];
  const opens = Array.from({ length: WEEK_DAYS }, () => 0);
  let cityEgg = Infinity;
  const boughtHere = new Set<string>();
  let day = 1;
  let part = 0;
  let zoneGain = 0;
  let zoneCost = 0;
  const decor = new Map<string, { price: number; upkeep: number }>(content.decor.items.map((x) => [x.id, x]));
  const upkeep = (): number => (game.state.guest.unpaid ? 0 : game.state.guest.items.reduce((n, id) => n + (decor.get(id)?.upkeep ?? 0), 0));
  const rewards: WeekResult['rewards'] = {};
  const fiveMin = (): number => 5 * Math.max(content.eggs.income.floorPerMin, game.state.stats.income ?? 0);
  const eggOf = new Map(content.eggs.eggs.map((x) => [x.id, x]));
  game.events.on((e: GameEvent) => {
    const egg = e.type === 'eggBought' || e.type === 'hatched' ? eggOf.get(e.egg) : undefined;
    if (egg && egg.section === 'ladder') {
      const r = (rewards[egg.id] ??= { best: [], got: [] });
      if (e.type === 'eggBought' && e.by === 'player') r.best.push((egg.price.coins * (egg.value?.exclusive ?? 0)) / fiveMin());
      if (e.type === 'hatched') {
        const cr = game.state.creatures.find((x) => x.uid === e.uid);
        const spec = content.species.species.find((x) => x.id === e.species);
        if (cr && spec) r.got.push((spec.basePrice * (cr.mult ?? 1)) / fiveMin());
      }
    }
    // The zone's bonus is a share of the buyer's offer (cashBonus): its part of the price, other bonuses left aside (a little in its favor).
    if (e.type === 'sold' && e.by !== 'now') {
      const b = game.guestZone().bonus;
      zoneGain += (e.price * b) / (1 + b);
    }
    const when = day - 1 + part;
    if (e.type === 'rebirth') moves.push(when);
    if (e.type === 'eggBought' && cityEggs.has(e.egg) && e.by === 'player' && cityEgg === Infinity) cityEgg = when;
    // Something new: a thing opens, an upgrade level, an egg kind bought for the first time in this city, a new city.
    const first = e.type === 'eggBought' && e.by === 'player' && !boughtHere.has(e.egg);
    if (first) boughtHere.add(e.egg);
    if (e.type === 'rebirth') boughtHere.clear();
    if (first || e.type === 'eggUnlocked' || e.type === 'districtOpened' || e.type === 'upgradeUnlocked' || e.type === 'upgradeBought' || e.type === 'rebirth') opens[day - 1] = (opens[day - 1] ?? 0) + 1;
  });
  let active = 0;
  for (day = 1; day <= WEEK_DAYS; day++) {
    let busyUntil = active + 1.5;
    const start = active;
    while (active < start + DAY_ACTIVE_SEC) {
      if (active >= busyUntil) {
        const had = new Set(game.state.guest.items);
        busyUntil = active + act();
        for (const id of game.state.guest.items) if (!had.has(id)) zoneCost += decor.get(id)?.price ?? 0;
      }
      zoneCost += (upkeep() * STEP) / 60;
      game.tick(STEP);
      active += STEP;
      part = (active - start) / DAY_ACTIVE_SEC;
    }
    part = 1;
    if (day < WEEK_DAYS) {
      zoneCost += (upkeep() * AWAY_SEC) / 60;
      game.offline(AWAY_SEC);
    }
  }
  return { moves, cityEgg, opens, earned: game.state.stats.coinsEarned, zoneGain, zoneCost, rewards };
}

const quantile = (xs: number[], q: number): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * (s.length - 1) + 0.5))] ?? Infinity;
};
const fmt = (x: number, digits = 0): string => (Number.isFinite(x) ? x.toFixed(digits) : '∞');

export interface BalanceReport {
  ok: boolean;
  lines: string[];
  failures: string[];
}

export function runBalance(seeds = 24, longSeeds = Math.max(3, Math.round(seeds / 3))): BalanceReport {
  const content = loadGameContent();
  const lines: string[] = [];
  const failures: string[] = [];
  lines.push(`sim:balance — ${BOTS.length} bots × ${seeds} seeds × 10 min; p50 / p90 of game seconds (limit in brackets)`);
  for (const bot of BOTS) {
    const runs = Array.from({ length: seeds }, (_, i) => playOnce(bot, 1000 + i * 7919, content));
    const cells = CHECKS.map((c) => {
      const xs = runs.map((r) => r.times[c.id] ?? Infinity);
      const p50 = quantile(xs, 0.5);
      const p90 = quantile(xs, 0.9);
      const pass = p90 <= c.limitSec;
      if (!pass) failures.push(`${bot.name} ${c.id} ${c.title}: p90 ${fmt(p90)} s > ${c.limitSec} s`);
      return `${c.id} ${fmt(p50)}/${fmt(p90)} (${c.limitSec}) ${pass ? 'ok' : 'FAIL'}`;
    });
    // F5: income per minute grows: minutes 8–10 against minutes 1–3 (median run).
    const growth = quantile(
      runs.map((r) => ((r.earned[9]! - r.earned[7]!) / 2) / Math.max(1, (r.earned[2]! - r.earned[0]!) / 2)),
      0.5,
    );
    const f5 = growth >= LIMITS.F5growth;
    if (!f5) failures.push(`${bot.name} F5 income growth ×${growth.toFixed(2)} < ×${LIMITS.F5growth}`);
    // F10: never stuck without ads: a deal every minute after the first, in every run.
    const stalls = runs.filter((r) => r.stalled).length;
    if (stalls > 0) failures.push(`${bot.name} F10 ${stalls} run(s) with a minute without deals`);
    // F11: a goal within 2 minutes of income at every check of minutes 3–10, in 90% of runs.
    const missed = runs.filter((r) => r.goalMisses > 0).length;
    const f11 = missed <= Math.floor(runs.length * 0.1);
    if (!f11 && LIMITS.F11enforced) failures.push(`${bot.name} F11 ${missed}/${runs.length} runs had a moment without a near goal`);
    const deals = quantile(runs.map((r) => r.deals5min), 0.5);
    const coins = quantile(runs.map((r) => r.coins5min), 0.5);
    const coins10 = quantile(runs.map((r) => r.earned[9] ?? 0), 0.5);
    lines.push(
      `${bot.name.padEnd(7)} ${cells.join(' · ')} · F5 ×${growth.toFixed(1)} ${f5 ? 'ok' : 'FAIL'} · F10 ${stalls ? 'FAIL' : 'ok'} · F11 ${missed}/${runs.length} ${f11 ? 'ok' : LIMITS.F11enforced ? 'FAIL' : 'miss (from M2-12)'}` +
        ` · 5 min: ${deals} deals, ${coins} coins; 10 min: ${coins10} coins (p50)`,
    );
  }
  lines.push(`long run — casual and slow × ${longSeeds} seeds: 3 days of 30 active minutes + 8 h away`);
  const casualDays: DaysResult[] = [];
  for (const bot of BOTS.filter((b) => b.name === 'casual' || b.name === 'slow')) {
    const runs = Array.from({ length: longSeeds }, (_, i) => playDays(bot, 2000 + i * 104729, content));
    if (bot.name === 'casual') casualDays.push(...runs);
    const street = quantile(runs.map((r) => r.street), 0.9);
    const square = quantile(runs.map((r) => r.square), 0.9);
    const away = quantile(runs.map((r) => r.awayMinutes), 0.5);
    const rebirth = quantile(runs.map((r) => r.rebirthDay), 0.5);
    // F6 is about the typical player (casual); a slow one gets more for the night relative to own play, by design.
    const typical = bot.name === 'casual';
    const f6 = !typical || (away >= LIMITS.F6minutes[0] && away <= LIMITS.F6minutes[1]);
    const f7 = rebirth >= LIMITS.F7days[0] - 1 && rebirth <= LIMITS.F7days[1];
    const f8 = street <= LIMITS.F8street && square <= LIMITS.F8square;
    if (!f6) failures.push(`${bot.name} F6 8 h away = ${fmt(away)} min of play, want ${LIMITS.F6minutes.join('–')}`);
    if (!f7) failures.push(`${bot.name} F7 rebirth threshold on day ${fmt(rebirth, 1)}, want day ${LIMITS.F7days.join('–')}`);
    if (!f8) failures.push(`${bot.name} F8 districts at ${fmt(street)} s / ${fmt(square)} s (p90), want ≤ ${LIMITS.F8street} / ${LIMITS.F8square}`);
    // FB-03 (Q-039 B): an hour away pays 30–50 % of an hour of play (up to offlineMaxHours), the seller level grows ≤ offlineMaxLevels.
    const onHour = quantile(runs.map((r) => r.onlineHour), 0.5);
    const offHour = quantile(runs.map((r) => r.offlineHour), 0.5);
    const share = onHour > 0 ? offHour / onHour : 0;
    const lvl = Math.max(...runs.map((r) => r.awayLevels));
    // The brief's band (30–50 % of the income of play) measured against the coins actually earned an hour (the data floor sits higher: the income
    // a reward or the time away reads leaves big spikes out, FB-15).
    const f19 = share >= LIMITS.F19share[0] && share <= LIMITS.F19share[1] && lvl <= content.upgrades.offlineMaxLevels;
    if (!f19) failures.push(`${bot.name} F19 an hour away = ${Math.round(share * 100)} % of an hour of play, seller levels +${lvl} away`);
    lines.push(`${bot.name.padEnd(7)} F19 income an hour of play / away: ${fmt(onHour)} / ${fmt(offHour)} (${Math.round(share * 100)} %, want ${LIMITS.F19share[0] * 100}–${LIMITS.F19share[1] * 100} %), seller levels away +${lvl} (≤ ${content.upgrades.offlineMaxLevels}) ${f19 ? 'ok' : 'FAIL'}`);
    lines.push(
      `${bot.name.padEnd(7)} F6 8 h away = ${fmt(away)} min of play (${LIMITS.F6minutes.join('–')}) ${typical ? (f6 ? 'ok' : 'FAIL') : 'info'}` +
        ` · F7 rebirth threshold on day ${fmt(rebirth, 1)} (${LIMITS.F7days.join('–')}) ${f7 ? 'ok' : 'FAIL'}` +
        ` · F8 street ${fmt(street)} s, square ${fmt(square)} s p90 (${LIMITS.F8street} / ${LIMITS.F8square}) ${f8 ? 'ok' : 'FAIL'}`,
    );
  }
  // F12: the keeper's 10 minutes against the casual player's, and the keeper's rebirth day (median runs).
  {
    const casual = BOTS.find((b) => b.name === 'casual')!;
    const n = Math.max(3, Math.round(seeds / 3));
    const ten = (bot: Bot) => quantile(Array.from({ length: n }, (_, i) => playOnce(bot, 3000 + i * 7919, content).earned[9] ?? 0), 0.5);
    const ratio = ten(KEEPER) / Math.max(1, ten(casual));
    const day = quantile(Array.from({ length: Math.max(2, Math.round(longSeeds / 2)) }, (_, i) => playDays(KEEPER, 4000 + i * 104729, content).rebirthDay), 0.5);
    const f12 = ratio <= LIMITS.F12keeperMax && day >= LIMITS.F7days[0] - 1;
    if (!f12) failures.push(`keeper F12 ×${ratio.toFixed(2)} of casual in 10 min (≤ ×${LIMITS.F12keeperMax}), rebirth threshold on day ${fmt(day, 1)} (not before the first night)`);
    lines.push(`keeper  F12 10 min = ×${ratio.toFixed(2)} of casual (≤ ×${LIMITS.F12keeperMax}) · rebirth threshold on day ${fmt(day, 1)} (≥ 1.0) ${f12 ? 'ok' : 'FAIL'}`);
  }
  // F17, F18 (M4-08): a week of a casual player — something new opens every day; the second city comes 1–3 days after the first
  // (the economy after a move: income ×1.25, the threshold ×3) and the egg the second city opens is bought there.
  {
    const casual = BOTS.find((b) => b.name === 'casual')!;
    const runs = Array.from({ length: longSeeds }, (_, i) => playWeek(casual, 5000 + i * 104729, content));
    const daily = Array.from({ length: WEEK_DAYS }, (_, d) => quantile(runs.map((r) => r.opens[d] ?? 0), 0.5));
    const f17 = daily.every((n) => n >= LIMITS.F17opensPerDay);
    const first = quantile(runs.map((r) => r.moves[0] ?? Infinity), 0.5);
    const gap = quantile(runs.map((r) => (r.moves[1] ?? Infinity) - (r.moves[0] ?? Infinity)), 0.5);
    const egg = quantile(runs.map((r) => r.cityEgg), 0.5);
    const f18 = gap >= LIMITS.F18gapDays[0] && gap <= LIMITS.F18gapDays[1] && egg <= WEEK_DAYS;
    // M4-05 (F17): the guest zone pays for itself within the week — what it added to the deals against its decorations and upkeep
    // (counted in the same week: comparing two different weeks was noise, ×0.99…×1.30 between runs).
    const decorRatio = quantile(runs.map((r) => (r.zoneCost > 0 ? r.zoneGain / r.zoneCost : 0)), 0.5);
    const fDecor = decorRatio >= LIMITS.F17decorMin;
    if (!fDecor) failures.push(`casual F17 the guest zone costs more than it brings: it adds ×${decorRatio.toFixed(2)} of its cost in a week`);
    if (!f17) failures.push(`casual F17 a day without anything new: ${daily.join(' / ')}`);
    if (!f18) failures.push(`casual F18 the second city ${fmt(gap, 1)} days after the first (want ${LIMITS.F18gapDays.join('–')}), its egg on day ${fmt(egg, 1)} (want ≤ ${WEEK_DAYS})`);
    lines.push(
      `week    F17 new things by day ${daily.join(' / ')} (≥ ${LIMITS.F17opensPerDay} a day) ${f17 ? 'ok' : 'FAIL'}` +
        ` · guest zone pays back ×${decorRatio.toFixed(2)} (≥ ${LIMITS.F17decorMin}) ${fDecor ? 'ok' : 'FAIL'}` +
        ` · F18 moves on day ${fmt(first, 1)}, the next ${fmt(gap, 1)} days later (${LIMITS.F18gapDays.join('–')}), the city egg on day ${fmt(egg, 1)} ${f18 ? 'ok' : 'FAIL'}`,
    );
  }
  // FB-02: the share of the best reward in 5 minutes of income by ladder step — what the egg can give at most (its exclusive)
  // when bought (p50) and the dearest hatch seen (p90 of hatches, all runs): info, the free rewards are capped in the game itself.
  {
    const casual = BOTS.find((b) => b.name === 'casual')!;
    const runs = Array.from({ length: longSeeds }, (_, i) => playWeek(casual, 5000 + i * 104729, content));
    const cells = content.eggs.eggs
      .filter((e) => e.section === 'ladder')
      .flatMap((e) => {
        const best = runs.flatMap((r) => r.rewards[e.id]?.best ?? []);
        const got = runs.flatMap((r) => r.rewards[e.id]?.got ?? []);
        return best.length || got.length ? [`${e.id.replace('egg_', '')} ${fmt(quantile(best, 0.5), 1)}/${fmt(quantile(got, 0.9), 2)}`] : [];
      });
    lines.push(`rewards FB-02 best reward in 5 min of income by ladder step (exclusive when bought p50 / hatch p90): ${cells.join(' · ')}; free rewards ≤ ${content.eggs.income.rewardCapMin} min (capped)`);
  }
  // FB-05: care moves the odds — VIP and exclusive without care and with full care, and what an egg gives back (EV in its price)
  // without care and with full care less the food it costs; F20: full care at least doubles the top share and pays for its food.
  {
    const c = content.eggs.care;
    const food = c.feed.steps * c.feed.priceShare;
    const cells: string[] = [];
    let f20 = true;
    for (const e of content.eggs.eggs.filter((x) => x.section === 'ladder' && x.value)) {
      const up = careChances(e.chances, c.maxBonus, e.careTop ?? c.topShare);
      const top = (x: typeof e.chances): number => x.vip + x.exclusive;
      const ev = (x: typeof e.chances): number => RARITIES.reduce((n, r) => n + (x[r] / 100) * e.value![r], 0);
      const gain = ev(up) - food - ev(e.chances);
      if (top(up) < top(e.chances) * 1.95 || gain <= 0) f20 = false;
      cells.push(`${e.id.replace('egg_', '')} ${fmt(top(e.chances), 1)}→${fmt(top(up), 1)} % · ×${ev(e.chances).toFixed(2)}→×${(ev(up) - food).toFixed(2)}`);
    }
    if (!f20) failures.push('F20 full care does not double VIP and exclusive or does not pay for its food');
    lines.push(`care    F20 VIP+exclusive without → with full care (b ${c.maxBonus}, top ${c.topShare}), EV in egg prices less food: ${cells.join(' · ')} ${f20 ? 'ok' : 'FAIL'}`);
  }
  // M5-02 (brief «Ресейл 9»): the share of eggs for videos in a day of 30 active minutes (casual p50) and F9 — what the ad points add
  // at most in that day: the sales boost for its seconds, «×2 deal» once per its gap (never more deals than were made), the egg ads
  // at the gift price (FB-15: their expected value in minutes of income). Info: the player chooses the videos.
  if (content.ads && casualDays.length) {
    const a = content.ads;
    const day = 1800;
    const hatched = quantile(casualDays.map((r) => r.hatchedDay1), 0.5);
    const deals = quantile(casualDays.map((r) => r.dealsDay1), 0.5);
    const adEggs = Math.min(a.eggs.perDay, Math.floor(day / Math.max(1, a.eggs.gapSec)) + 1);
    const share = adEggs / Math.max(1, hatched + adEggs);
    const boost = ((a.boost.mult - 1) * Math.min(a.boost.sec, day)) / day;
    const dealGap = a.rewarded.placementGapSec?.deal_x2 ?? a.rewarded.gapSec;
    const doubled = Math.min(deals, Math.floor(day / Math.max(1, dealGap)));
    const double = doubled / Math.max(1, deals);
    // An egg for a video hatches at the gift price: its expected value in minutes of income (the ladder card counts as the gift egg).
    const evMin = a.eggs.cards.map((c) => {
      const e = content.eggs.eggs.find((x) => x.id === (c.egg === 'ladder' ? 'egg_gift' : c.egg));
      const ev = e?.value ? RARITIES.reduce((n, r) => n + (e.chances[r] / 100) * e.value![r], 0) : 1;
      return Math.min(content.eggs.income.rewardCapMin, (e?.valueIncomeMin ?? 1) * ev);
    });
    const eggs = (adEggs * (evMin.reduce((x, y) => x + y, 0) / evMin.length)) / (day / 60);
    const total = boost + double + eggs;
    lines.push(
      `ads     M5-02 casual day of 30 min (p50): eggs for videos ${adEggs} of ${fmt(hatched + adEggs, 0)} (${fmt(share * 100, 0)} %) · boost +${fmt(boost * 100, 0)} %` +
        ` · ×2 deal ${doubled} of ${fmt(deals, 0)} deals (+${fmt(double * 100, 0)} %) · egg ads ≈ +${fmt(eggs * 100, 0)} % · F9 at most +${fmt(total * 100, 0)} % (want 30–100 %) ${total >= 0.3 && total <= 1 ? 'ok' : 'info'}`,
    );
  } else lines.push('F9 rewarded ads: no ads data');
  lines.push(failures.length ? `FAIL: ${failures.join('; ')}` : `F1–F8, F10${LIMITS.F11enforced ? ', F11' : ''}, F12–F20: all green`);
  return { ok: failures.length === 0, lines, failures };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const args = process.argv.slice(2);
  const seedsAt = args.indexOf('--seeds');
  const outAt = args.indexOf('--out');
  const t0 = Date.now();
  const report = runBalance(seedsAt >= 0 ? Number(args[seedsAt + 1]) : 24);
  const text = report.lines.join('\n') + `\n(${((Date.now() - t0) / 1000).toFixed(1)} s)\n`;
  process.stdout.write(text);
  if (outAt >= 0 && args[outAt + 1]) {
    const file = resolve(import.meta.dirname, '..', args[outAt + 1] as string);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
  }
  process.exit(report.ok ? 0 : 1);
}
