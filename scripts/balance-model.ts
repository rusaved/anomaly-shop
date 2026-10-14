// `npm run sim:balance` (docs/01a, section 9): the real game (src/sim) played headless by bots with human pace,
// many seeds per bot; time checks on the slowest 10% of runs (p90), pace checks on the median. Exit 1 when a check fails.
//   Short run (10 min, every bot): F1 first deal ≤ 40 s · F2 100 coins earned ≤ 2 min · F3 first upgrade ≤ 3 min · F4 first rare ≤ 5 min
//     · F5 income per minute at 8–10 min ≥ 1.5 × at 1–3 min · F10 no stall (a deal every minute after the first) without ads
//     · F11 (M2-12) in minutes 3–10 a shop goal (an upgrade or, from M3, a new egg) within 2 minutes of current income at every check
//     · F13–F15 (M3-14): a chat deal within 60 s after the first minute, a market buy resold at a profit by 5 min, the second ladder egg by 10 min
//   Long run (3 days of 30 active minutes and 8 hours away, casual and slow bots): F6 8 h away pays 30–60 min of play (casual)
//     · F7 the rebirth threshold on day 2–3 · F8 district 2 by 10 min, district 3 by 40 min of play. F9 (ads) waits for M4.
//   Keeper (feeds every creature to the top before selling): F12 earns at most ×2 of the casual player in 10 min and
//     crosses the rebirth threshold no earlier than the first night (feeding pays, never breaks the economy).
// Usage: node scripts/balance-model.ts [--seeds 24] [--out docs/evidence/M2/balance.txt]
// Erasable TypeScript only: Node runs this file without a bundler (relative .ts imports).
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createRng } from '../src/core/rng.ts';
import { createGame, type Game, type GameContent, type GameEvent } from '../src/sim/game.ts';
import { ftueHint } from '../src/sim/ftue.ts';
import { newSave } from '../src/sim/state.ts';
import { createStore } from '../src/sim/store.ts';
import { loadGameContent } from './load-game-content.ts';

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
  { id: 'F14', title: 'a market buy resold at a profit', limitSec: 300 },
  { id: 'F15', title: 'an egg of the second ladder step', limitSec: 600 },
];

/** Pace and long-run limits of docs/01a, section 9 (F11 from docs/01b, section 5.1). */
export const LIMITS = {
  F5growth: 1.5,
  F6minutes: [30, 60] as const,
  F7days: [2, 3] as const,
  F8street: 600,
  F8square: 2400,
  F11goalMinutes: 2,
  F12keeperMax: 2,
  /** F11 is the criterion of M2-12 (the ladder of 8 things): reported from M2-09, failing the run from M2-12. */
  F11enforced: true,
};

/** Model step: coarser than the game's 1/60 s, finer than any bot action (0.2 s and up). */
const STEP = 1 / 30;
const SHORT_SEC = 600;
const DAY_ACTIVE_SEC = 30 * 60;
const AWAY_SEC = 8 * 3600;

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

/** One bot plays a game: returns the act function that makes one decision and says how long it took. */
export function botPlayer(bot: Bot, game: Game): () => number {
  let lastHint = '';
  const tap = 1 / bot.tapsPerSec;
  return () => {
    const st = game.state;
    const view = game.view();
    const hint = ftueHint(st, view);
    if (hint) {
      if (hint.step !== lastHint) {
        lastHint = hint.step;
        return bot.reactSec;
      }
      if (hint.step === 'tapEgg' || hint.step === 'hatchRare') game.tapIncubator(hint.target.kind === 'incubator' ? hint.target.index : 0);
      else if (hint.step === 'feed' && view.creatures[0]) game.tapCreature(view.creatures[0].uid);
      else if (hint.step === 'list' && view.inventory[0]) game.list(view.inventory[0].uid);
      else if (hint.step === 'sell') {
        const open = game.chats().find((c) => c.state === 'open');
        if (open) game.chatSell(open.id);
      }
      else if (hint.step === 'buyEgg') game.buyEgg();
      return tap;
    }
    // UB-05: buyers only write — answer (a counter once when the offer is below the asking price, then sell).
    // Only about a creature the bot would sell anyway (its sell level): the rest it keeps feeding, the buyer waits.
    const chat = game.chats().find((c) => c.state === 'open' && view.talking.some((x) => x.uid === c.uid && x.level >= Math.min(bot.sellLevel, x.maxLevel)));
    if (chat) {
      const ask = view.talking.find((c) => c.uid === chat.uid)?.ask ?? 0;
      if (bot.haggleRisk > 0 && chat.offer < ask && game.canCounter(chat.id)) game.chatCounter(chat.id);
      else game.chatSell(chat.id);
      // Two taps: the chat, then «Sell» (the Chats tab carries the count, nothing to notice).
      return tap * 2;
    }
    const lot = game.market().lots.find((l) => !l.sold && l.verdict === 'below' && st.coins >= l.price * 3);
    // UB-05: a bought lot waits in the inventory when the shelf is full, like a hatched one.
    if (lot) {
      game.buyLot(lot.id);
      return tap + bot.reactSec;
    }
    // A new egg with the «New!» badge: tried once as soon as it is affordable (players react to the badge like to the upgrade dot;
    // UB-01: the egg screen is the home screen, the badge is in view all the time).
    const freshEgg = game.eggList().find((e) => e.fresh && e.check.ok && st.coins >= e.check.price * 1.25);
    if (freshEgg) {
      game.buyEgg(freshEgg.id);
      return tap + bot.reactSec;
    }
    // Upgrades as soon as the dot shows (cheapest first).
    const upgrade = game.upgradeList().filter((u) => u.affordable).sort((a, b) => a.price - b.price)[0];
    if (upgrade) {
      game.buyUpgrade(upgrade.id);
      return tap + bot.reactSec;
    }
    // A ready egg waits for a tap (M3-02): a player opens it at once.
    const readyEgg = view.incubators.findIndex((i) => i.ready);
    if (readyEgg >= 0) {
      game.tapIncubator(readyEgg);
      return tap;
    }
    // A hatched creature waits in the inventory: on the shelf it goes while there is room (UB-03: the result's «To the shop»).
    if (view.inventory[0] && game.freeSlots() > 0) {
      game.list(view.inventory[0].uid);
      return tap;
    }
    // Keep the incubators busy: the dearest egg affordable twice over, else a basic one; a player with a pile to sell
    // sells first (UB-05: eggs take no shelf place, so nothing else stops the pile).
    const eggs = view.inventory.length < 2 + view.slots ? game.eggList().filter((e) => e.check.ok) : [];
    const best = bot.bestEggs ? eggs.filter((e) => st.coins >= e.check.price * 2).sort((a, b) => b.check.price - a.check.price)[0] : undefined;
    const pick = best ?? eggs.find((e) => e.id === eggs[0]?.id);
    if (pick && (best || game.canBuyEgg().ok)) {
      game.buyEgg(pick.id);
      return tap;
    }
    // Feed the cheapest creature still below the sale level, else speed up an egg.
    const hungry = [...view.talking, ...view.creatures].filter((c) => c.level < Math.min(bot.sellLevel, c.maxLevel)).sort((a, b) => a.price - b.price)[0];
    if (hungry) {
      game.tapCreature(hungry.uid);
      return tap;
    }
    const egg = view.incubators.findIndex((i) => i.egg && !i.waiting);
    if (egg >= 0) {
      game.tapIncubator(egg);
      return tap;
    }
    // Nothing to sell yet: feed what is there (raises the price).
    const any = view.creatures.find((c) => c.level < c.maxLevel);
    if (any) {
      game.tapCreature(any.uid);
      return tap;
    }
    return tap;
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
      const perMin = m >= 1 ? (earned[m - 1]! - (m >= 2 ? earned[m - 2]! : 0)) : 0;
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
    const away = game.offline(AWAY_SEC);
    if (day === 1) awayMinutes = perMin > 0 ? away.coins / perMin : 0;
    if (rebirthDay === Infinity && game.state.stats.coinsEarned >= threshold && before < threshold) rebirthDay = day + 0.0;
  }
  return { street, square, awayMinutes, rebirthDay };
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
  for (const bot of BOTS.filter((b) => b.name === 'casual' || b.name === 'slow')) {
    const runs = Array.from({ length: longSeeds }, (_, i) => playDays(bot, 2000 + i * 104729, content));
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
  lines.push('F9 rewarded ads +30–100%: not checked until M4 (no ad rewards in the data yet)');
  lines.push(failures.length ? `FAIL: ${failures.join('; ')}` : `F1–F8, F10${LIMITS.F11enforced ? ', F11' : ''}, F12–F15: all green`);
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
