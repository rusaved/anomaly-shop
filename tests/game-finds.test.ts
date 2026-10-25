import { describe, expect, it } from 'vitest';
import { createRng } from '../src/core/rng.ts';
import { createGame, type GameEvent } from '../src/sim/game.ts';
import { newSave } from '../src/sim/state.ts';
import { createStore } from '../src/sim/store.ts';
import { loadGameContent } from '../scripts/load-game-content.ts';

/** M4-20: finds — 30, 10 hidden, a reward once (coins or crystals); the easter eggs (docs/01b §2) give finds; a move keeps them. */
const content = loadGameContent();

function shop(patch: (s: ReturnType<typeof newSave>) => void = () => undefined) {
  const save = newSave(0);
  Object.assign(save.flags, { ftue_starter: true, ftue_done: true, ftue_fed: true, ftue_bought: true });
  patch(save);
  const game = createGame(createStore(save, () => 0), content, createRng(9));
  const seen: GameEvent[] = [];
  game.events.on((e) => seen.push(e));
  return { game, seen };
}

describe('M4-20 finds', () => {
  it('30 finds, 10 hidden (M4-20), and the hidden ones of the M6 secrets; every one gives coins or crystals', () => {
    const extra = ['gardener'];
    expect(content.achievements.items).toHaveLength(30 + extra.length);
    expect(content.achievements.items.filter((x) => x.hidden)).toHaveLength(10 + extra.length);
    for (const id of extra) expect(content.achievements.items.find((x) => x.id === id)?.hidden, id).toBe(true);
    for (const f of content.achievements.items) expect(Boolean(f.reward.coins || f.reward.crystals), f.id).toBe(true);
  });

  it('a met condition marks the find; its reward is taken once by a tap; the view says how far the others are', () => {
    const { game, seen } = shop((s) => {
      s.stats.coinsEarned = 1500;
      s.stats.deals = 12;
      s.coins = 0;
    });
    game.tick(1.1);
    const got = seen.filter((e) => e.type === 'find').map((e) => (e as { id: string }).id);
    expect(got).toEqual(expect.arrayContaining(['first_deal', 'deals_10', 'coins_1k']));
    const coins = game.state.coins;
    game.tick(2);
    expect(seen.filter((e) => e.type === 'find')).toHaveLength(got.length);
    expect(game.state.coins).toBe(coins);
    expect(game.claimFind('first_deal')).toBe(true);
    expect(game.state.coins).toBe(coins + content.achievements.items.find((x) => x.id === 'first_deal')!.reward.coins!);
    expect(game.claimFind('first_deal')).toBe(false);
    expect(game.claimFind('deals_100')).toBe(false);
    const view = game.finds();
    expect(view.find((f) => f.id === 'deals_100')).toMatchObject({ got: false, have: 12, need: 100 });
    expect(view.find((f) => f.id === 'first_deal')?.got).toBe(true);
  });

  it('an easter egg step (the door knocks back) is a hidden find; a move to a new city keeps the finds', () => {
    const { game, seen } = shop((s) => {
      s.stats.coinsEarned = content.upgrades.prestige.thresholdCoinsEarned;
    });
    const door = content.secrets.secrets.find((x) => x.id === 'door')!;
    for (let i = 0; i < door.steps[0]!.at; i++) game.tapThing('door');
    game.tick(1.1);
    expect(seen.some((e) => e.type === 'find' && e.id === 'door_knock')).toBe(true);
    expect(game.finds().find((f) => f.id === 'door_knock')).toMatchObject({ got: true, hidden: true });
    expect(game.rebirth()).toBe(true);
    expect(game.finds().find((f) => f.id === 'door_knock')?.got).toBe(true);
  });
});
