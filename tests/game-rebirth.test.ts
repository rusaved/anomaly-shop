import { describe, expect, it } from 'vitest';
import { createRng } from '../src/core/rng.ts';
import { createGame, type GameEvent } from '../src/sim/game.ts';
import { cityMult, nicePrice, rebirthNeed } from '../src/sim/rules.ts';
import { newSave, normalize } from '../src/sim/state.ts';
import { createStore } from '../src/sim/store.ts';
import { loadGameContent } from '../scripts/load-game-content.ts';

/** M4-06, M4-08: the move to a new city — threshold ×growth per move, income +bonus, what starts over and what stays; the ladder top by city. */
const content = loadGameContent();
const p = content.upgrades.prestige;

function shop(earned: number, rebirths = 0) {
  const save = newSave(0);
  Object.assign(save.flags, { ftue_starter: true, ftue_done: true, ftue_fed: true, ftue_bought: true, open_market: true });
  save.prestige = rebirths;
  save.stats.coinsEarned = earned;
  save.stats.deals = 120;
  save.stats.xp = 900;
  save.coins = 5000;
  save.crystals = 7;
  save.upgrades = { incubator: 2, sign: 3 };
  save.creatures = [{ uid: 'c1', species: 'kettle', level: 3, fed: 0, hatchedAt: 0, age: 0 }];
  save.collection = { kettle: { seen: 1, hatched: 1, sold: 4 } };
  const game = createGame(createStore(save, () => 0), content, createRng(3));
  const seen: GameEvent[] = [];
  game.events.on((e) => seen.push(e));
  return { game, seen };
}

describe('M4-08 rebirth rules', () => {
  it('each move needs thresholdGrowth times more coins earned in the city; income grows by the bonus per move', () => {
    expect(rebirthNeed(0, p)).toBe(p.thresholdCoinsEarned);
    expect(rebirthNeed(1, p)).toBe(nicePrice(p.thresholdCoinsEarned * p.thresholdGrowth));
    expect(cityMult(0, p.incomeBonusPerPrestige)).toBe(1);
    expect(cityMult(2, p.incomeBonusPerPrestige)).toBeCloseTo(1 + 2 * p.incomeBonusPerPrestige);
  });

  it('the top of the egg ladder opens city by city (2–5), cheaper than the next move', () => {
    const top = content.eggs.eggs.filter((e) => e.unlock.type === 'city');
    expect(top.map((e) => (e.unlock.type === 'city' ? e.unlock.n : 0))).toEqual([2, 3, 4, 5]);
    for (const e of top) if (e.unlock.type === 'city') expect(e.price.coins).toBeLessThan(rebirthNeed(e.unlock.n - 1, p));
  });
});

describe('M4-06 rebirth', () => {
  it('not ready: nothing changes, a denied event', () => {
    const { game, seen } = shop(p.thresholdCoinsEarned - 1);
    expect(game.rebirthView()).toMatchObject({ city: 1, ready: false, need: p.thresholdCoinsEarned });
    expect(game.rebirth()).toBe(false);
    expect(game.state.prestige).toBe(0);
    expect(seen.some((e) => e.type === 'denied')).toBe(true);
  });

  it('ready: a new city — coins, upgrades, creatures and the seller level start over; collection, crystals and flags stay', () => {
    const { game, seen } = shop(p.thresholdCoinsEarned);
    expect(game.rebirthView().ready).toBe(true);
    expect(game.rebirth()).toBe(true);
    const st = game.state;
    expect(st.prestige).toBe(1);
    expect(st.coins).toBe(p.startCoins);
    expect(st.upgrades).toEqual({});
    expect(st.creatures).toEqual([]);
    expect(st.incubators).toHaveLength(1);
    expect(st.incubators[0]!.egg).toBe(content.ftue.starterEgg);
    expect(game.reputation().level).toBe(1);
    expect(st.crystals).toBe(7);
    expect(st.collection.kettle?.sold).toBe(4);
    expect(st.flags.open_market).toBe(true);
    expect(seen.some((e) => e.type === 'rebirth' && e.city === 2)).toBe(true);
    // M4-09: a step forward — the gift egg waits in «my eggs», the event names it, the scene gets the new city.
    if (p.giftEgg) {
      expect(st.myEggs[p.giftEgg]).toBe(1);
      expect(seen.some((e) => e.type === 'rebirth' && e.gift === p.giftEgg)).toBe(true);
    }
    expect(game.view().city).toBe(2);
    // The next move counts from here; the city's own egg of the ladder top is open and new.
    expect(game.rebirthView()).toMatchObject({ city: 2, have: 0, need: rebirthNeed(1, p), ready: false });
    const star = content.eggs.eggs.find((e) => e.unlock.type === 'city' && e.unlock.n === 2)!;
    expect(game.eggList().find((e) => e.id === star.id)?.fresh).toBe(true);
  });

  it('in a new city every creature is worth more; the save keeps where the city began', () => {
    const { game } = shop(p.thresholdCoinsEarned);
    const before = game.view().creatures.concat(game.view().inventory).find((c) => c.uid === 'c1')?.price ?? 0;
    game.rebirth();
    game.state.creatures.push({ uid: 'c2', species: 'kettle', level: 3, fed: 0, hatchedAt: 0, age: 0 });
    const after = [...game.view().creatures, ...game.view().inventory].find((c) => c.uid === 'c2')?.price ?? 0;
    expect(after).toBeGreaterThan(before);
    const back = normalize(JSON.parse(JSON.stringify(game.state)), 0);
    expect(back.cityEarnedAt).toBe(p.thresholdCoinsEarned);
    expect(back.prestige).toBe(1);
  });
});
