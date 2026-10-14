import { describe, expect, it } from 'vitest';
import { createRng } from '../src/core/rng.ts';
import { STEP_SEC } from '../src/core/runtime.ts';
import { createGame, type Game, type GameEvent } from '../src/sim/game.ts';
import { coins, creatureValue } from '../src/sim/rules.ts';
import { newSave, type Creature } from '../src/sim/state.ts';
import { createStore } from '../src/sim/store.ts';
import { loadGameContent } from '../scripts/load-game-content.ts';
import { waitChat } from './chat-helper.ts';

/** M2-12: the ladder of 8 things (docs/01b, section 5.1): prices 120…2 000, each seen in the shop, opened as rewards, each changes play. */
const content = loadGameContent();
const reply = { ...content.market.replySec };
const LADDER = ['bowl', 'bell', 'mat', 'tags', 'radio', 'board', 'stool', 'cuckoo'];
const up = (id: string) => content.upgrades.upgrades.find((u) => u.id === id)!;
const cr = (uid: string, species = 'kettle', level = 1): Creature => ({ uid, species, level, fed: 0, hatchedAt: 0, age: 0 });

function setup(opts: { deals?: number; creatures?: Creature[]; owned?: string[]; stats?: Record<string, number>; seed?: number } = {}) {
  const save = newSave(0);
  save.flags.ftue_starter = true;
  save.flags.ftue_done = true;
  save.creatures = opts.creatures ?? [];
  save.stats.hatched = 3;
  save.stats.deals = opts.deals ?? 60;
  Object.assign(save.stats, opts.stats ?? { levelUps: 1, haggles: 1 });
  for (const id of opts.owned ?? []) save.upgrades[id] = 1;
  const game = createGame(createStore(save, () => 0), content, createRng(opts.seed ?? 6));
  const seen: GameEvent[] = [];
  game.events.on((e) => seen.push(e));
  return { game, seen };
}
const run = (game: Game, sec: number): void => {
  for (let t = 0; t < sec - 1e-9; t += STEP_SEC) game.tick(STEP_SEC);
};

describe('M2-12 ladder of 8 things', () => {
  it('8 positions in the shop, prices 120 … 2 000 in order, each with a thing to draw and a joke', () => {
    expect(LADDER.map((id) => up(id).price1)).toEqual([120, 180, 260, 400, 650, 900, 1400, 2000]);
    for (const id of LADDER) {
      expect(content.upgrades.shop).toContain(id);
      expect(up(id).decor).toBeTruthy();
      expect(up(id).joke?.ru).toBeTruthy();
    }
  });

  it('open as rewards: bowl after the first level up, bell at seller level 3 (6 deals), mat after the first haggle', () => {
    const ids = (o: Parameters<typeof setup>[0]) => setup(o).game.upgradeList().map((u) => u.id);
    expect(ids({ deals: 4, stats: { levelUps: 0, haggles: 0 } })).not.toEqual(expect.arrayContaining(['bowl']));
    expect(ids({ deals: 4, stats: { levelUps: 1, haggles: 0 } })).toContain('bowl');
    expect(ids({ deals: 5, stats: { levelUps: 1, haggles: 0 } })).not.toContain('bell');
    expect(ids({ deals: 6, stats: { levelUps: 0, haggles: 0 } })).toContain('bell');
    expect(ids({ deals: 5, stats: { levelUps: 0, haggles: 0 } })).not.toContain('mat');
    expect(ids({ deals: 5, stats: { levelUps: 0, haggles: 1 } })).toContain('mat');
  });

  it('a newly opened position is announced once and marked «New!» until the shop is seen', () => {
    const { game, seen } = setup({ deals: 4, stats: { levelUps: 0, haggles: 0 }, creatures: [cr('a')] });
    for (let i = 0; i < 5; i++) game.tapCreature('a');
    run(game, 1);
    expect(seen.filter((e) => e.type === 'upgradeUnlocked' && e.id === 'bowl')).toHaveLength(1);
    expect(game.upgradeList().find((u) => u.id === 'bowl')!.fresh).toBe(true);
    run(game, 2);
    expect(seen.filter((e) => e.type === 'upgradeUnlocked' && e.id === 'bowl')).toHaveLength(1);
    game.seenShop();
    expect(game.upgradeList().find((u) => u.id === 'bowl')!.fresh).toBe(false);
  });

  it('every bought thing shows in the shop scene', () => {
    const { game } = setup({ owned: LADDER });
    expect(Object.keys(game.view().decor).sort()).toEqual(['bell', 'board', 'bowl', 'clock', 'mat', 'radio', 'stool', 'tags']);
  });

  it('bowl: twice the food per tap', () => {
    const { game } = setup({ owned: ['bowl'], creatures: [cr('a')] });
    game.tapCreature('a');
    expect(game.state.creatures[0]!.fed).toBe(2);
  });

  it('bell: one more buyer writes at once (UB-05: the chats are the queue)', () => {
    const five = ['a', 'b', 'c', 'd', 'e'].map((u) => cr(u));
    const plain = setup({ creatures: five, owned: ['stool'] });
    const bell = setup({ creatures: five, owned: ['bell', 'stool'] });
    for (const g of [plain.game, bell.game]) {
      g.state.upgrades.showcase = 4;
      g.state.showcase = five.map((c) => c.uid);
    }
    run(plain.game, 60);
    run(bell.game, 60);
    expect(plain.game.view().queue).toHaveLength(content.customers.queueSize);
    expect(bell.game.view().queue).toHaveLength(content.customers.queueSize + 1);
    expect(bell.game.view().queueSize).toBe(content.customers.queueSize + 1);
  });

  it('mat: buyers give 5 points more to a counter price', () => {
    const counter = (owned: string[]) => {
      // A dear creature: whole coins do not blur 3 points.
      const { game } = setup({ creatures: [cr('a', 'teacup_dragon', 3)], deals: 1, owned });
      const chat = waitChat(game)!;
      const ch = content.customers.characters.find((c) => c.id === 'greedy')!;
      chat.character = ch.id;
      const ask = game.view().talking[0]!.ask;
      // The asking price sits 3 points above what the buyer gives without the mat.
      chat.offer = Math.floor(ask / (1 + ch.give + 0.03));
      game.chatCounter(chat.id);
      return chat.lines.at(-1)!.ctx;
    };
    expect(counter([])).toBe('last');
    expect(counter(['mat'])).toBe('accept');
  });

  it('tags: price tags +5%; radio: shelf growth ×1.5; stool: +1 showcase place', () => {
    // Nobody writes for a while: the creatures stay on the shelf (UB-05).
    content.market.replySec = { min: 1e6, max: 1e6 };
    try {
      const spec = content.species.species.find((s) => s.id === 'cloudcat')!;
      const tags = setup({ owned: ['tags'], creatures: [cr('a', 'cloudcat', 3)] });
      expect(tags.game.view().creatures[0]!.price).toBe(coins(creatureValue(spec, 3) * 1.05));
      const radio = setup({ owned: ['radio'], creatures: [cr('a', 'cloudcat', 3)] });
      run(radio.game, 60);
      expect(radio.game.view().creatures[0]!.price).toBe(coins(creatureValue(spec, 3) * (1 + content.species.shelf.growthPerMin * 1.5)));
      expect(setup({ owned: ['stool'] }).game.showcaseSlots()).toBe(2);
    } finally {
      content.market.replySec = reply;
    }
  });

  it('cuckoo clock: once a minute every creature gets food', () => {
    const { game, seen } = setup({ owned: ['cuckoo'], creatures: [cr('a'), cr('b', 'cloudcat')] });
    run(game, 59.9);
    expect(seen.some((e) => e.type === 'cuckoo')).toBe(false);
    run(game, 0.2);
    expect(seen.filter((e) => e.type === 'cuckoo')).toHaveLength(1);
    expect(seen.filter((e) => e.type === 'fed' && e.by === 'cuckoo')).toHaveLength(2);
    expect(game.state.creatures.every((c) => c.fed === 1)).toBe(true);
  });
});
