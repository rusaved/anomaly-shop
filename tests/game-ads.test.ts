import { describe, expect, it } from 'vitest';
import { createRng } from '../src/core/rng.ts';
import { createGame } from '../src/sim/game.ts';
import { newSave, normalize, parseSave, serialize } from '../src/sim/state.ts';
import { createStore } from '../src/sim/store.ts';
import { loadGameContent } from '../scripts/load-game-content.ts';

/** M5-02: rewards of the rewarded ads in the game — egg ads (2 cards, per day, with a gap), hatch now, ×2 deal, the sales boost. */
const content = loadGameContent();
const ads = content.ads!;

function setup() {
  const save = newSave(0);
  save.flags = { ftue_starter: true, ftue_done: true, showcase_m3: true };
  save.stats.hatched = 5;
  save.incubators = [{ egg: 'egg_odd', startedAt: 0, progress: 0, elapsed: 0, waiting: false }];
  const game = createGame(createStore(save, () => 0), content, createRng(1));
  return { game };
}

describe('M5-02 ad rewards', () => {
  it('two egg-ad cards; together perDay a day with a gap; a new day starts over; kept after a reload', () => {
    const { game } = setup();
    const cards = game.adEggs('2026-10-23');
    expect(cards).toHaveLength(2);
    expect(cards.every((c) => c.left === ads.eggs.perDay && c.waitSec === 0)).toBe(true);
    expect(cards[1]!.egg).toBe('egg_gold');
    expect(game.claimAdEgg('2026-10-23', 'ad_gold')).toBe(true);
    expect(game.claimAdEgg('2026-10-23', 'ad_ladder')).toBe(false);
    expect(game.adEggs('2026-10-23')[0]!.waitSec).toBe(ads.eggs.gapSec);
    for (let i = 1; i < ads.eggs.perDay; i++) {
      game.tick(ads.eggs.gapSec);
      expect(game.claimAdEgg('2026-10-23', 'ad_ladder')).toBe(true);
    }
    game.tick(ads.eggs.gapSec);
    expect(game.adEggs('2026-10-23')[0]!.left).toBe(0);
    expect(game.claimAdEgg('2026-10-23', 'ad_ladder')).toBe(false);
    const back = normalize(parseSave(serialize(game.state)), 0);
    expect(back.ads).toMatchObject({ day: '2026-10-23', eggs: ads.eggs.perDay });
    expect(game.adEggs('2026-10-24')[0]!.left).toBe(ads.eggs.perDay);
    expect(game.claimAdEgg('2026-10-24', 'ad_ladder')).toBe(true);
  });

  it('the ladder card gives the best open ladder egg', () => {
    const { game } = setup();
    expect(game.adEggs('d')[0]!.egg).toBe('egg_basic');
  });

  it('hatch now: the egg in the incubator is ready at once; a ready or empty one is refused', () => {
    const { game } = setup();
    expect(game.view().incubators[0]!.leftSec).toBeGreaterThan(ads.hatch.minLeftSec);
    expect(game.hatchNow(0)).toBe(true);
    expect(game.view().incubators[0]!.ready).toBe(true);
    expect(game.view().incubators[0]!.leftSec).toBe(0);
    expect(game.hatchNow(0)).toBe(false);
    expect(game.hatchNow(5)).toBe(false);
  });

  it('×2 deal doubles the last deal of the player once; the boost multiplies sales only while it lasts', () => {
    const { game } = setup();
    expect(game.adDouble()).toBe(0);
    game.state.incubators = [];
    game.state.creatures.push({ uid: 'c1', species: game.state.creatures[0]?.species ?? content.species.species[0]!.id, level: 1, xp: 0, rarity: 'common' } as never);
    game.state.showcase = ['c1'];
    const before = game.state.coins;
    expect(game.sellNow('c1')).toBe(true);
    const got = game.state.coins - before;
    expect(got).toBeGreaterThan(0);
    expect(game.adDouble()).toBe(got);
    expect(game.state.coins - before).toBe(got * 2);
    expect(game.adDouble()).toBe(0);
    expect(game.startBoost('d')).toBe(true);
    expect(game.boostLeft()).toBe(ads.boost.sec);
    for (let i = 1; i < ads.boost.perDay; i++) expect(game.startBoost('d')).toBe(true);
    expect(game.boostsLeft('d')).toBe(0);
    expect(game.startBoost('d')).toBe(false);
    expect(game.boostsLeft('d2')).toBe(ads.boost.perDay);
    game.tick(1);
    expect(game.boostLeft()).toBeCloseTo(ads.boost.sec - 1);
    game.offline(3600);
    expect(game.boostLeft()).toBeCloseTo(ads.boost.sec - 1);
  });

  it('a pack: coins by income, eggs into my eggs, crystals', () => {
    const { game } = setup();
    const c0 = game.state.crystals;
    const got = game.grantPack({ coinsMin: 10, eggs: { egg_gold: 2 }, crystals: 5 });
    expect(got).toBeGreaterThan(0);
    expect(game.state.crystals - c0).toBe(5);
    expect((game.state.myEggs.egg_gold ?? 0) + game.state.incubators.filter((i) => i.egg === 'egg_gold').length).toBe(2);
  });
});
