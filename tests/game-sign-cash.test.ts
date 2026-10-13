import { describe, expect, it } from 'vitest';
import { createRng } from '../src/core/rng.ts';
import { STEP_SEC } from '../src/core/runtime.ts';
import { createGame, type Game, type GameEvent } from '../src/sim/game.ts';
import { upgradePrice } from '../src/sim/rules.ts';
import { newSave, type Creature } from '../src/sim/state.ts';
import { createStore } from '../src/sim/store.ts';
import { loadGameContent } from '../scripts/load-game-content.ts';

/** M2-07: the sign brings customers sooner, the register adds to every deal; both open by deals and show in the shop scene. */
const content = loadGameContent();
const up = (id: string) => content.upgrades.upgrades.find((u) => u.id === id)!;
const cr = (uid: string): Creature => ({ uid, species: 'cloudcat', level: 2, fed: 0, hatchedAt: 0, age: 0 });

function setup(deals: number, levels: Record<string, number> = {}, seed = 5) {
  const save = newSave(0);
  save.flags.ftue_starter = true;
  save.flags.ftue_done = true;
  save.creatures = [cr('a')];
  save.stats.hatched = 3;
  save.stats.deals = deals;
  save.upgrades = { ...levels };
  const store = createStore(save, () => 0);
  const game = createGame(store, content, createRng(seed));
  const seen: GameEvent[] = [];
  game.events.on((e) => seen.push(e));
  return { game, seen };
}
const run = (game: Game, sec: number): void => {
  for (let t = 0; t < sec - 1e-9; t += STEP_SEC) game.tick(STEP_SEC);
};

describe('M2-07 sign and register', () => {
  it('open by deals: the sign after 6, the register after 12; 5 levels each, prices from upgrades.json', () => {
    expect(setup(5).game.upgradeList().map((u) => u.id)).not.toContain('sign');
    expect(setup(6).game.upgradeList().map((u) => u.id)).toContain('sign');
    expect(setup(11).game.upgradeList().map((u) => u.id)).not.toContain('cash');
    const { game } = setup(12);
    expect(game.upgradeList().map((u) => u.id)).toContain('cash');
    for (const id of ['sign', 'cash']) {
      const u = up(id);
      expect(u.levels).toBe(5);
      expect(upgradePrice(u, 0)).toBe(u.price1);
      expect(upgradePrice(u, 4)).toBe(u.priceMax);
    }
  });

  it('the sign: customers come −12% sooner per level (time from the 1st to the 3rd customer)', () => {
    const fill = (levels: Record<string, number>) => {
      const { game, seen } = setup(30, levels);
      let t = 0;
      const at: number[] = [];
      while (at.length < 3 && t < 60) {
        game.tick(STEP_SEC);
        t += STEP_SEC;
        if (seen.filter((e) => e.type === 'customerArrived').length > at.length) at.push(t);
      }
      return at[2]! - at[0]!;
    };
    const plain = fill({});
    expect(Math.abs(plain - content.customers.spawnEverySec * 2)).toBeLessThan(0.1);
    expect(Math.abs(fill({ sign: 1 }) - plain * 0.88)).toBeLessThan(0.1);
    expect(Math.abs(fill({ sign: 5 }) - plain * 0.4)).toBeLessThan(0.1);
  });

  it('the register: +3% to every deal per level', () => {
    const plain = setup(30, {}, 9);
    const rich = setup(30, { cash: 3 }, 9);
    run(plain.game, 7);
    run(rich.game, 7);
    const a = plain.game.deal()!;
    const b = rich.game.deal()!;
    expect(b.customer).toBe(a.customer);
    expect(Math.abs(b.offer / a.offer - 1.09)).toBeLessThan(0.02);
  });

  it('bought ones show in the shop: decor sign and register with their level', () => {
    const { game } = setup(30, { sign: 2, cash: 1 });
    expect(game.view().decor).toMatchObject({ sign: 2, register: 1 });
    expect(setup(30).game.view().decor).toEqual({});
  });
});
