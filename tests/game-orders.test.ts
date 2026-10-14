import { describe, expect, it } from 'vitest';
import { createRng } from '../src/core/rng.ts';
import { STEP_SEC } from '../src/core/runtime.ts';
import { createGame, type Game, type GameContent, type GameEvent } from '../src/sim/game.ts';
import { coins, creatureValue } from '../src/sim/rules.ts';
import { newSave, normalize, parseSave, serialize, type Creature } from '../src/sim/state.ts';
import { createStore } from '../src/sim/store.ts';
import { loadGameContent } from '../scripts/load-game-content.ts';

/** M2-19: the order board — one collector order (species + level → ×2–3 of the price), 5 minutes, then a new one; no penalty. */
const base = loadGameContent();
const calm: GameContent = { ...base, events: { ...base.events, events: base.events.events.map((e) => ({ ...e, weight: 0 })) } };
const cr = (uid: string, species: string, level: number): Creature => ({ uid, species, level, fed: 0, hatchedAt: 0, age: 0 });

function setup(opts: { board?: boolean; deals?: number; seed?: number; creatures?: Creature[] } = {}) {
  const save = newSave(0);
  save.flags.ftue_starter = true;
  save.flags.ftue_done = true;
  save.stats.hatched = 5;
  save.stats.deals = opts.deals ?? 40;
  save.creatures = opts.creatures ?? [];
  save.coins = 1e6;
  if (opts.board !== false) save.upgrades.board = 1;
  const game = createGame(createStore(save, () => 0), calm, createRng(opts.seed ?? 3));
  const seen: GameEvent[] = [];
  game.events.on((e) => seen.push(e));
  return { game, seen };
}
const run = (game: Game, sec: number): void => {
  for (let t = 0; t < sec - 1e-9; t += STEP_SEC) game.tick(STEP_SEC);
};

describe('M2-19 order board', () => {
  it('no board, no orders; the board brings one at once', () => {
    const none = setup({ board: false });
    run(none.game, 5);
    expect(none.game.state.order).toBeNull();
    const { game, seen } = setup();
    run(game, 0.1);
    expect(game.state.order).not.toBeNull();
    expect(seen.filter((e) => e.type === 'orderNew')).toHaveLength(1);
  });

  it('only species the player can get (rarities of the open eggs), level 2–5, reward ×2–3 of the price at that level', () => {
    for (let seed = 1; seed < 40; seed++) {
      const { game } = setup({ deals: 6, seed });
      run(game, 0.1);
      const o = game.state.order!;
      const spec = base.species.species.find((s) => s.id === o.species)!;
      // At 6 deals the basic and warm eggs are open: common … legendary (the warm egg has 1% legendary).
      expect(['common', 'rare', 'epic', 'legendary']).toContain(spec.rarity);
      expect(o.level).toBeGreaterThanOrEqual(2);
      expect(o.level).toBeLessThanOrEqual(5);
      const value = creatureValue(spec, o.level);
      expect(o.reward).toBeGreaterThanOrEqual(Math.floor(value * 2));
      expect(o.reward).toBeLessThanOrEqual(Math.ceil(value * 3));
      expect(coins(value)).toBeLessThan(o.reward);
    }
  });

  it('only the basic egg open: only common species are ordered', () => {
    const only = { ...calm, eggs: { ...calm.eggs, eggs: calm.eggs.eggs.map((e) => (e.id === 'egg_basic' ? { ...e, chances: { common: 100, rare: 0, epic: 0, legendary: 0 } } : e)) } };
    for (let seed = 1; seed < 20; seed++) {
      const save = newSave(0);
      save.flags.ftue_starter = true;
      save.flags.ftue_done = true;
      save.upgrades.board = 1;
      save.stats.deals = 1;
      const game = createGame(createStore(save, () => 0), only, createRng(seed));
      game.tick(0.1);
      expect(base.species.species.find((s) => s.id === game.state.order!.species)!.rarity).toBe('common');
    }
  });

  it('a sale of a fitting creature pays at least the reward and a new order comes', () => {
    const { game, seen } = setup();
    run(game, 0.1);
    const o = game.state.order!;
    game.state.creatures = [cr('fit', o.species, o.level)];
    run(game, 7);
    const deal = game.deal()!;
    expect(deal.order).toBe(true);
    expect(deal.offer).toBeGreaterThanOrEqual(o.reward);
    expect(game.accept()).toBe(true);
    expect(seen).toContainEqual(expect.objectContaining({ type: 'orderDone', species: o.species }));
    run(game, 0.1);
    expect(game.state.order).not.toBeNull();
  });

  it('a lower level does not fit; expiry after 5 minutes takes nothing and brings a new order; the order is saved', () => {
    const { game, seen } = setup();
    run(game, 0.1);
    const o = game.state.order!;
    game.state.creatures = [cr('low', o.species, o.level - 1)];
    run(game, 7);
    expect(game.deal()!.order).toBe(false);
    const back = normalize(parseSave(serialize(game.state)), 0);
    expect(back.order).toMatchObject({ species: o.species, level: o.level, reward: o.reward });
    const coinsBefore = game.state.coins;
    run(game, base.customers.orders.minutes * 60);
    expect(seen.some((e) => e.type === 'orderExpired')).toBe(true);
    expect(seen.filter((e) => e.type === 'orderNew').length).toBeGreaterThanOrEqual(2);
    expect(game.state.coins).toBe(coinsBefore);
    expect(game.state.creatures.map((c) => c.uid)).toEqual(['low']);
  });
});
