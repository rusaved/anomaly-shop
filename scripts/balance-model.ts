// `npm run sim:balance` (docs/01a, section 9): the real game (src/sim) played headless by bots with human pace,
// many seeds per bot; checks F1–F4 on the slowest 10% of runs (p90). Exit 1 when a check fails.
//   F1 first deal ≤ 40 s · F2 100 coins earned ≤ 2 min · F3 first upgrade ≤ 3 min · F4 first rare ≤ 5 min
// Usage: node scripts/balance-model.ts [--seeds 40] [--out docs/evidence/M1/balance.txt]
// Erasable TypeScript only: Node runs this file without a bundler (relative .ts imports).
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createRng } from '../src/core/rng.ts';
import { STEP_SEC } from '../src/core/runtime.ts';
import { createGame, type Game, type GameEvent } from '../src/sim/game.ts';
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
  /** Buys the warm egg when it is open and affordable. */
  warmEggs: boolean;
}

export const BOTS: Bot[] = [
  { name: 'casual', tapsPerSec: 3, reactSec: 1.2, sellLevel: 2, haggleRisk: 0, warmEggs: false },
  { name: 'rusher', tapsPerSec: 2.5, reactSec: 1.5, sellLevel: 1, haggleRisk: 0, warmEggs: false },
  { name: 'tapper', tapsPerSec: 5, reactSec: 0.8, sellLevel: 3, haggleRisk: 0.25, warmEggs: true },
  { name: 'slow', tapsPerSec: 1.5, reactSec: 3, sellLevel: 2, haggleRisk: 0, warmEggs: false },
];

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
];

export interface RunResult {
  times: Record<string, number>;
  deals5min: number;
  coins5min: number;
}

const HORIZON_SEC = 330;

/** One bot plays one fresh profile for HORIZON_SEC game seconds. */
export function playOnce(bot: Bot, seed: number): RunResult {
  const content = loadGameContent();
  const store = createStore(newSave(0), () => 0);
  const game: Game = createGame(store, content, createRng(seed));
  const times: Record<string, number> = {};
  let t = 0;
  let busyUntil = 1.5; // looks at the screen first
  let lastHint = '';
  let haggledWith = -1;
  game.events.on((e: GameEvent) => {
    if (e.type === 'sold' && times.F1 === undefined) times.F1 = t;
    if (e.type === 'upgradeBought' && times.F3 === undefined) times.F3 = t;
    if (e.type === 'hatched' && e.rarity !== 'common' && times.F4 === undefined) times.F4 = t;
  });
  const tap = 1 / bot.tapsPerSec;

  const act = (): number => {
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
      else if (hint.step === 'sell') game.accept();
      else if (hint.step === 'buyEgg') game.buyEgg();
      return tap;
    }
    // Upgrades as soon as the dot shows (cheapest first).
    const upgrade = game.upgradeList().filter((u) => u.affordable).sort((a, b) => a.price - b.price)[0];
    if (upgrade) {
      game.buyUpgrade(upgrade.id);
      return tap + bot.reactSec;
    }
    // A creature ready for sale: select it (a tap), then sell or haggle.
    const ready = view.creatures.filter((c) => c.level >= Math.min(bot.sellLevel, c.maxLevel)).sort((a, b) => b.price - a.price)[0];
    const deal = view.deal;
    if (deal && ready) {
      if (deal.uid !== ready.uid) {
        game.tapCreature(ready.uid);
        return tap;
      }
      if (bot.haggleRisk > 0 && deal.canHaggle && deal.bargains === 0 && deal.leaveChance <= bot.haggleRisk && haggledWith !== deal.id) {
        haggledWith = deal.id;
        game.haggle();
        return tap;
      }
      game.accept();
      return tap;
    }
    // Keep the incubators busy.
    const warm = bot.warmEggs ? game.eggList().find((e) => e.id === 'egg_warm' && e.check.ok) : undefined;
    if (warm && st.coins >= 60 + 10) {
      game.buyEgg('egg_warm');
      return tap;
    }
    if (game.canBuyEgg().ok) {
      game.buyEgg();
      return tap;
    }
    // Feed the cheapest creature still below the sale level, else speed up an egg.
    const hungry = view.creatures.filter((c) => c.level < Math.min(bot.sellLevel, c.maxLevel)).sort((a, b) => a.price - b.price)[0];
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

  let deals5min = 0;
  let coins5min = 0;
  while (t < HORIZON_SEC) {
    if (t >= busyUntil) busyUntil = t + act();
    game.tick(STEP_SEC);
    t += STEP_SEC;
    if (times.F2 === undefined && game.state.stats.coinsEarned >= 100) times.F2 = t;
    if (deals5min === 0 && t >= 300) {
      deals5min = game.state.stats.deals;
      coins5min = game.state.stats.coinsEarned;
    }
  }
  return { times, deals5min, coins5min };
}

const quantile = (xs: number[], q: number): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * (s.length - 1) + 0.5))] ?? Infinity;
};

export interface BalanceReport {
  ok: boolean;
  lines: string[];
  failures: string[];
}

export function runBalance(seeds = 40): BalanceReport {
  const lines: string[] = [];
  const failures: string[] = [];
  lines.push(`sim:balance — ${BOTS.length} bots × ${seeds} seeds, p50 / p90 of game seconds (limit in brackets)`);
  for (const bot of BOTS) {
    const runs = Array.from({ length: seeds }, (_, i) => playOnce(bot, 1000 + i * 7919));
    const cells = CHECKS.map((c) => {
      const xs = runs.map((r) => r.times[c.id] ?? Infinity);
      const p50 = quantile(xs, 0.5);
      const p90 = quantile(xs, 0.9);
      const pass = p90 <= c.limitSec;
      if (!pass) failures.push(`${bot.name} ${c.id} ${c.title}: p90 ${p90.toFixed(0)} s > ${c.limitSec} s`);
      return `${c.id} ${p50.toFixed(0)}/${Number.isFinite(p90) ? p90.toFixed(0) : '∞'} (${c.limitSec}) ${pass ? 'ok' : 'FAIL'}`;
    });
    const deals = quantile(runs.map((r) => r.deals5min), 0.5);
    const coins = quantile(runs.map((r) => r.coins5min), 0.5);
    lines.push(`${bot.name.padEnd(7)} ${cells.join(' · ')} · 5 min: ${deals} deals, ${coins} coins (p50)`);
  }
  lines.push(failures.length ? `FAIL: ${failures.join('; ')}` : 'F1–F4: all green');
  return { ok: failures.length === 0, lines, failures };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const args = process.argv.slice(2);
  const seedsAt = args.indexOf('--seeds');
  const outAt = args.indexOf('--out');
  const report = runBalance(seedsAt >= 0 ? Number(args[seedsAt + 1]) : 40);
  const text = report.lines.join('\n') + '\n';
  process.stdout.write(text);
  if (outAt >= 0 && args[outAt + 1]) {
    const file = resolve(import.meta.dirname, '..', args[outAt + 1] as string);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
  }
  process.exit(report.ok ? 0 : 1);
}
