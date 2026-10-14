import { describe, expect, it } from 'vitest';
import { createRng } from '../src/core/rng.ts';
import { createGame, type GameEvent } from '../src/sim/game.ts';
import { repLevel } from '../src/sim/rules.ts';
import { newSave } from '../src/sim/state.ts';
import { createStore } from '../src/sim/store.ts';
import { loadGameContent } from '../scripts/load-game-content.ts';
import { sellViaChat } from './chat-helper.ts';

/** UB-08: the seller level grows from deals (content/reputation.json): +perDeal a deal, more for a rare one; repUp once per new level. */
const content = loadGameContent();
const rep = content.reputation;

function shopWith(deals: number, species: string[]) {
  const save = newSave(0);
  Object.assign(save.flags, { ftue_starter: true, ftue_done: true, ftue_fed: true, ftue_bought: true });
  save.stats.deals = deals;
  save.creatures = species.map((sp, i) => ({ uid: `r${i}`, species: sp, level: 1, fed: 0, hatchedAt: 0, age: 0 }));
  const game = createGame(createStore(save, () => 0), content, createRng(7));
  const seen: GameEvent[] = [];
  game.events.on((e) => seen.push(e));
  for (const c of save.creatures) game.list(c.uid);
  return { game, seen };
}

const common = content.species.species.find((s) => s.rarity === 'common')!.id;
const rare = content.species.species.find((s) => (rep.rarityBonus[s.rarity] ?? 0) > 0)!;

describe('UB-08 reputation', () => {
  it('an old save counts its deals; the deal that crosses a threshold emits repUp once', () => {
    const before = rep.levels[1]! / rep.perDeal - 1;
    const { game, seen } = shopWith(before, [common, common]);
    expect(game.reputation()).toMatchObject({ level: 1, xp: before * rep.perDeal });
    expect(sellViaChat(game, 120)).toBe(true);
    expect(game.reputation().level).toBe(2);
    expect(seen.filter((e) => e.type === 'repUp')).toEqual([{ type: 'repUp', level: 2 }]);
    game.list('r1');
    expect(sellViaChat(game, 120)).toBe(true);
    expect(seen.filter((e) => e.type === 'repUp')).toHaveLength(1);
  });

  it('a rare creature gives its rarity bonus on top of the deal', () => {
    const { game } = shopWith(0, [rare.id]);
    expect(sellViaChat(game, 240)).toBe(true);
    expect(game.reputation().xp).toBe(rep.perDeal + rep.rarityBonus[rare.rarity]!);
  });

  it('repLevel: thresholds from the data, the top level has no next', () => {
    expect(repLevel(0, rep.levels)).toEqual({ level: 1, base: 0, next: rep.levels[1] });
    expect(repLevel(rep.levels[1]!, rep.levels).level).toBe(2);
    expect(repLevel(rep.levels.at(-1)! + 1, rep.levels)).toMatchObject({ level: rep.levels.length, next: null });
  });
});
