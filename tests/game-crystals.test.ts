import { describe, expect, it } from 'vitest';
import { createRng } from '../src/core/rng.ts';
import { createGame, type GameEvent } from '../src/sim/game.ts';
import { newSave, normalize, parseSave, serialize, type Creature } from '../src/sim/state.ts';
import { createStore } from '../src/sim/store.ts';
import { loadGameContent } from '../scripts/load-game-content.ts';
import { sellViaChat } from './chat-helper.ts';

/** M2-08: crystals — the second currency: rare sales bring them, the courier is bought with them, they are saved. */
const content = loadGameContent();
const cr = (uid: string, species: string): Creature => ({ uid, species, level: 1, fed: 0, hatchedAt: 0, age: 0 });

function sellOne(species: string, crystalSeen = false) {
  const save = newSave(0);
  save.flags.ftue_starter = true;
  save.flags.ftue_done = true;
  if (crystalSeen) save.flags.crystal_seen = true;
  save.creatures = [cr('a', species)];
  save.stats.hatched = 2;
  save.stats.deals = 40;
  const game = createGame(createStore(save, () => 0), content, createRng(3));
  const seen: GameEvent[] = [];
  game.events.on((e) => seen.push(e));
  expect(sellViaChat(game)).toBe(true);
  return { game, seen };
}

describe('M2-08 crystals', () => {
  it('a sale brings crystals by rarity (species.json → crystalsPerSale)', () => {
    for (const [species, rarity] of [['kettle', 'common'], ['cloudcat', 'good'], ['cactus', 'valuable'], ['mirrorfrog', 'premium'], ['teacup_dragon', 'vip'], ['moon_donut', 'exclusive']] as const) {
      const { game, seen } = sellOne(species);
      const n = content.species.crystalsPerSale[rarity];
      expect(game.state.crystals).toBe(n);
      expect(seen.find((e) => e.type === 'sold')).toMatchObject({ crystals: n });
    }
    expect(content.species.crystalsPerSale.common).toBe(0);
    expect(content.species.crystalsPerSale.valuable).toBeGreaterThan(0);
  });

  it('the first crystal is announced once', () => {
    expect(sellOne('cactus').seen.filter((e) => e.type === 'firstCrystal')).toHaveLength(1);
    expect(sellOne('cactus', true).seen.filter((e) => e.type === 'firstCrystal')).toHaveLength(0);
    expect(sellOne('kettle').seen.filter((e) => e.type === 'firstCrystal')).toHaveLength(0);
  });

  it('crystals pay for the courier and survive a reload', () => {
    const { game } = sellOne('teacup_dragon');
    game.state.crystals = 30;
    expect(game.upgradeList().find((u) => u.id === 'helper_courier')).toMatchObject({ affordable: true });
    expect(game.buyUpgrade('helper_courier')).toBe(true);
    expect(game.state.crystals).toBe(5);
    expect(normalize(parseSave(serialize(game.state)), 0).crystals).toBe(5);
  });
});
