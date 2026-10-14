import { describe, expect, it } from 'vitest';
import { createRng } from '../src/core/rng.ts';
import { STEP_SEC } from '../src/core/runtime.ts';
import { createGame, type Game, type GameEvent } from '../src/sim/game.ts';
import { newSave, type Creature } from '../src/sim/state.ts';
import { createStore } from '../src/sim/store.ts';
import { loadGameContent } from '../scripts/load-game-content.ts';
import { waitChat } from './chat-helper.ts';

/** M2-03: helpers work without taps (feeder, seller, courier); the shop works on while the player is away. */
const content = loadGameContent();
const cr = (uid: string, species = 'kettle', level = 1): Creature => ({ uid, species, level, fed: 0, hatchedAt: 0, age: 0 });

/** Random events off: they only run live (never while away) and would tilt the live/away comparison. */
const calm = { ...content, events: { ...content.events, events: content.events.events.map((e) => ({ ...e, weight: 0 })) } };

function setup(opts: { creatures?: Creature[]; helpers?: string[]; deals?: number; seed?: number } = {}) {
  const save = newSave(0);
  save.flags.ftue_starter = true;
  save.flags.ftue_done = true;
  save.creatures = opts.creatures ?? [];
  save.stats.hatched = 5;
  save.stats.deals = opts.deals ?? 40;
  save.crystals = 100;
  save.coins = 1e6;
  const store = createStore(save, () => 0);
  const game = createGame(store, calm, createRng(opts.seed ?? 4));
  for (const id of opts.helpers ?? []) expect(game.buyUpgrade(id)).toBe(true);
  game.state.coins = 0;
  const seen: GameEvent[] = [];
  game.events.on((e) => seen.push(e));
  return { game, seen };
}
const run = (game: Game, sec: number): void => {
  for (let t = 0; t < sec - 1e-9; t += STEP_SEC) game.tick(STEP_SEC);
};

describe('M2-03 helpers', () => {
  it('helpers open by deals (10, 20, 30); the courier costs crystals', () => {
    expect(setup({ deals: 9 }).game.upgradeList().map((u) => u.id)).not.toContain('helper_feed');
    expect(setup({ deals: 10 }).game.upgradeList().map((u) => u.id)).toContain('helper_feed');
    expect(setup({ deals: 19 }).game.upgradeList().map((u) => u.id)).not.toContain('helper_sell');
    expect(setup({ deals: 30 }).game.upgradeList().map((u) => u.id)).toEqual(expect.arrayContaining(['helper_feed', 'helper_sell', 'helper_courier']));
    const { game } = setup({ deals: 30 });
    game.state.crystals = 24;
    game.state.coins = 1e6;
    expect(game.buyUpgrade('helper_courier')).toBe(false);
    game.state.crystals = 25;
    expect(game.buyUpgrade('helper_courier')).toBe(true);
    expect(game.state.crystals).toBe(0);
    expect(game.state.coins).toBe(1e6);
  });

  it('the feeder feeds the hungriest creature, one tap a second, no taps of the player', () => {
    const { game, seen } = setup({ creatures: [cr('hi', 'kettle', 4), cr('lo', 'kettle', 1)], helpers: ['helper_feed'] });
    run(game, 5.01);
    const fed = seen.filter((e) => e.type === 'fed');
    expect(fed).toHaveLength(5);
    expect(fed.every((e) => e.type === 'fed' && e.uid === 'lo' && e.by === 'helper')).toBe(true);
    expect(game.state.creatures.find((c) => c.uid === 'lo')!.level).toBe(2);
    expect(game.state.stats.taps).toBe(0);
    expect(game.state.flags.ftue_fed).toBeUndefined();
  });

  it('the seller answers a buyer who waited delaySec in the chat (UB-05), at the offer', () => {
    const { game, seen } = setup({ creatures: [cr('a', 'cloudcat', 2)], helpers: ['helper_sell'] });
    const chat = waitChat(game)!;
    const effect = content.upgrades.upgrades.find((u) => u.id === 'helper_sell')!.effect;
    const delay = effect.type === 'autoSell' ? effect.delaySec : 0;
    expect(delay).toBeGreaterThan(1);
    run(game, delay - 0.2);
    expect(seen.some((e) => e.type === 'sold')).toBe(false);
    run(game, 0.4);
    expect(seen.find((e) => e.type === 'sold')).toMatchObject({ by: 'helper', uid: 'a', price: chat.offer, customerId: chat.id });
    expect(game.state.coins).toBe(chat.offer);
  });

  it('a playing player keeps the chats in hand: the seller waits while the player taps', () => {
    const { game, seen } = setup({ creatures: [cr('a', 'cloudcat', 2), cr('b')], helpers: ['helper_sell'], seed: 11 });
    waitChat(game);
    for (let i = 0; i < 10; i++) {
      game.tapCreature('b');
      run(game, 2);
    }
    expect(seen.some((e) => e.type === 'sold' && e.by === 'helper')).toBe(false);
  });

  it('the courier buys a basic egg into a free incubator while the shelf has room for what it hatches', () => {
    const { game, seen } = setup({ helpers: ['helper_courier'] });
    game.state.coins = 50;
    run(game, 0.1);
    expect(seen.find((e) => e.type === 'eggBought')).toMatchObject({ by: 'helper', egg: 'egg_basic' });
    expect(game.state.coins).toBe(40);
  });

  it('away: the shop works at offlineRate for at most offlineMaxHours; helpers earn, eggs hatch', () => {
    const { game, seen } = setup({ creatures: [cr('a'), cr('b')], helpers: ['helper_feed', 'helper_sell', 'helper_courier'] });
    game.state.coins = 100;
    const t0 = performance.now();
    const r = game.offline(30 * 3600);
    expect(performance.now() - t0).toBeLessThan(3000);
    expect(r.awaySec).toBe(content.upgrades.offlineMaxHours * 3600);
    expect(r.workedSec).toBe(r.awaySec * content.upgrades.offlineRate);
    expect(r.coins).toBeGreaterThan(0);
    expect(r.sold).toBeGreaterThan(10);
    expect(r.hatched).toBeGreaterThan(10);
    // Quiet: no game events while catching up, one change at the end.
    expect(seen.filter((e) => e.type !== 'change')).toHaveLength(0);
  });

  it('away without helpers: eggs hatch, no coins; time going back counts as zero', () => {
    const { game } = setup();
    game.state.coins = 10;
    game.buyEgg();
    const r = game.offline(600);
    expect(r).toMatchObject({ coins: 0, sold: 0, hatched: 1 });
    expect(game.offline(-5000)).toMatchObject({ awaySec: 0, workedSec: 0, coins: 0 });
  });
});

describe('M2-04 offline pace', () => {
  it('away time works at offlineRate of the helpers pace of live play: 20 min away ≈ 20 × rate min of helpers alone', () => {
    const helpers = ['helper_feed', 'helper_sell', 'helper_courier'];
    let live = { coins: 0, deals: 0 };
    let away = { coins: 0, deals: 0 };
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const a = setup({ creatures: [cr('a'), cr('b')], helpers, seed });
      a.game.state.coins = 100;
      const deals = a.game.state.stats.deals;
      run(a.game, 600);
      live = { coins: live.coins + a.game.state.coins - 100, deals: live.deals + a.game.state.stats.deals - deals };
      const b = setup({ creatures: [cr('a'), cr('b')], helpers, seed: seed + 100 });
      b.game.state.coins = 100;
      const r = b.game.offline(1200);
      away = { coins: away.coins + r.coins, deals: away.deals + r.sold };
    }
    // 20 minutes away at offlineRate of the live pace ≈ 20 × rate minutes of helpers alone (rate 0.5 → 10 min).
    // UB-05: the deals keep the pace; the coins follow them with the heavy-tailed noise of the rarities (one rare sale weighs dozens).
    const want = 2 * content.upgrades.offlineRate;
    expect(away.deals / live.deals).toBeGreaterThan(want * 0.85);
    expect(away.deals / live.deals).toBeLessThan(want * 1.2);
    expect(away.coins / live.coins).toBeGreaterThan(want * 0.5);
    expect(away.coins / live.coins).toBeLessThan(want * 2);
  });
});
