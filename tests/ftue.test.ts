import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRng } from '../src/core/rng.ts';
import { STEP_SEC } from '../src/core/runtime.ts';
import { createGame, type GameEvent } from '../src/sim/game.ts';
import { eggHint, ftueHint, onEggsTab, shelfHint, tabHint, upgradeHint, type FtueStep } from '../src/sim/ftue.ts';
import { TABS } from '../src/ui/nav.ts';
import { newSave } from '../src/sim/state.ts';
import { createStore } from '../src/sim/store.ts';
import { loadGameContent } from '../scripts/load-game-content.ts';

/** M1-09: the first minute (docs/01, section 4) played headless by following the hints, on many seeds. */
const content = loadGameContent();
const dict = (lang: string) => JSON.parse(readFileSync(resolve(__dirname, `../content/i18n/${lang}.json`), 'utf8')) as Record<string, string>;

function playFirstMinute(seed: number) {
  const store = createStore(newSave(0), () => 0);
  const game = createGame(store, content, createRng(seed));
  const seen: Array<GameEvent & { at: number }> = [];
  let t = 0;
  game.events.on((e) => seen.push({ ...e, at: t }));
  const steps: FtueStep[] = [];
  const wait = (sec: number) => {
    for (let x = 0; x < sec - 1e-9; x += STEP_SEC) {
      game.tick(STEP_SEC);
      t += STEP_SEC;
    }
  };
  wait(2); // reads the screen
  for (let guard = 0; guard < 2000; guard++) {
    const hint = ftueHint(game.state, game.view());
    if (!hint) break;
    if (steps.at(-1) !== hint.step) {
      steps.push(hint.step);
      wait(0.8); // notices the new hint
    }
    if (hint.step === 'tapEgg' || hint.step === 'hatchRare') game.tapIncubator(hint.target.kind === 'incubator' ? hint.target.index : 0);
    else if (hint.step === 'list') game.list(game.view().inventory[0]!.uid);
    else if (hint.step === 'feed') game.tapCreature(game.view().creatures[0]!.uid);
    else if (hint.step === 'sell') game.chatSell(game.chats().find((c) => c.state === 'open')!.id);
    else if (hint.step === 'buyEgg') game.buyEgg();
    wait(0.25); // about 4 taps a second
  }
  return { game, seen, steps, t };
}

describe('M1-09 first minute', () => {
  it('the hints go tap egg → put on sale → feed → (a buyer writes) → sell in the chat → buy egg → rare, and end with «that is how fortunes are made»', () => {
    for (const seed of [1, 2, 3, 42, 777, 2026]) {
      const { game, seen, steps, t } = playFirstMinute(seed);
      expect(steps.filter((s) => s !== 'waitCustomer')).toEqual(['tapEgg', 'list', 'feed', 'sell', 'buyEgg', 'hatchRare']);
      const hatched = seen.filter((e) => e.type === 'hatched');
      expect(hatched.map((e) => (e.type === 'hatched' ? e.rarity : ''))).toEqual(['common', 'valuable']);
      expect(seen.some((e) => e.type === 'ftueDone')).toBe(true);
      const sale = seen.find((e) => e.type === 'sold');
      expect(sale && sale.type === 'sold' ? sale.price : 0).toBeGreaterThanOrEqual(content.eggs.eggs[0]!.price.coins);
      // F1: the first deal well inside 40 s; the whole script inside the first minute.
      expect(sale!.at).toBeLessThan(40);
      expect(t).toBeLessThan(60);
      expect(ftueHint(game.state, game.view())).toBeNull();
    }
  });

  it('M6-02 a first deal below the egg price never dead-ends: the egg already in the incubator is tapped, a pet waiting is listed, a buyer is answered', () => {
    // sim:balance F10 found it: the cheapest common sold to a thrifty buyer for 9 < 10 coins; the rescue egg sat in the incubator
    // while the hint kept pointing at an egg the player could not pay for.
    const game = createGame(createStore(newSave(0), () => 0), content, createRng(5));
    const st = game.state;
    st.stats.hatched = 1;
    st.stats.deals = 1;
    st.coins = 9;
    st.incubators[0] = { ...st.incubators[0]!, egg: content.eggs.eggs[0]!.id, progress: 99, elapsed: 99, waiting: false };
    expect(ftueHint(st, game.view())).toMatchObject({ step: 'tapEgg', target: { kind: 'incubator', index: 0 } });
    // A gift egg ready to take still comes first (круг правок FB-3 п. 6).
    expect(ftueHint(st, game.view(), 'egg_gift')).toMatchObject({ step: 'buyEgg', key: 'ftue.freeEgg' });
    // No egg in the incubator: a pet in the storage is listed, then the buyer who writes is answered.
    st.incubators[0] = { ...st.incubators[0]!, egg: null };
    st.creatures.push({ uid: 'p1', species: 'kettle', level: 1, fed: 0, hatchedAt: 0, age: 0 });
    expect(ftueHint(st, game.view())?.step).toBe('list');
    game.list('p1');
    for (let guard = 0; guard < 4000 && game.view().queue.length === 0; guard++) game.tick(STEP_SEC);
    expect(ftueHint(game.state, game.view())?.step).toBe('sell');
    // The egg in the incubator is the second hatch: it closes the first minute (the scripted rare), the shop goes on as usual.
    game.state.incubators[0] = { ...game.state.incubators[0]!, egg: content.eggs.eggs[0]!.id, progress: 99, elapsed: 99, waiting: false };
    game.tapIncubator(0);
    expect(game.state.flags.ftue_done).toBe(true);
  });

  it('every first-minute hint has at most 6 words in ru and en', () => {
    for (const lang of ['ru', 'en']) {
      const d = dict(lang);
      for (const step of ['tapEgg', 'list', 'feed', 'waitCustomer', 'sell', 'buyEgg', 'hatchRare', 'rich']) {
        const text = d[`ftue.${step}`];
        expect(text, `${lang} ftue.${step}`).toBeDefined();
        expect(text!.trim().split(/\s+/).length).toBeLessThanOrEqual(content.ftue.maxHintWords);
      }
    }
  });

  it('UB-06 every tab but the home one has its one hint (6 words at most), shown on the very first visit only', () => {
    for (const tab of TABS.filter((x) => x !== 'home')) {
      const hint = tabHint(tab)!;
      expect(hint.target.kind).toBe('el');
      for (const lang of ['ru', 'en']) expect(dict(lang)[hint.key!]!.trim().split(/\s+/).length, `${lang} ${hint.key}`).toBeLessThanOrEqual(content.ftue.maxHintWords);
    }
    expect(tabHint('home')).toBeNull();
    // W (the usability review): with no egg to buy the «Яйца» hint points at nothing — never at «МОИ ЯЙЦА» over the player's own egg.
    expect((tabHint('eggs')!.target as { selectors: string[] }).selectors.some((x) => x.includes('.mu-head'))).toBe(false);
    const game = createGame(createStore(newSave(0), () => 0), content, createRng(1));
    expect(game.seenTab('market')).toBe(true);
    expect(game.seenTab('market')).toBe(false);
    expect(game.state.flags.tab_market).toBe(true);
  });

  it('a returning player (tutorial done) sees no hints and gets the normal odds', () => {
    const save = newSave(0);
    save.flags = { ftue_starter: true, ftue_fed: true, ftue_bought: true, ftue_done: true };
    save.stats.hatched = 5;
    const game = createGame(createStore(save, () => 0), content, createRng(1));
    expect(ftueHint(game.state, game.view())).toBeNull();
    expect(game.state.incubators[0]!.egg).toBeNull();
  });
});

describe('Круг правок FB-3 п. 6: a free gift egg in the first minute', () => {
  it('the «new egg» hint leads to the gift egg ready to take; taking it is the step done, the rare one still hatches', () => {
    const store = createStore(newSave(0), () => 0);
    const game = createGame(store, content, createRng(7));
    const free = (): string | null => game.eggShop().eggs.find((e) => e.section === 'free' && e.open && e.freeIn === 0)?.id ?? null;
    const steps: string[] = [];
    const rarities: string[] = [];
    game.events.on((e) => e.type === 'hatched' && rarities.push(e.rarity));
    for (let guard = 0; guard < 4000; guard++) {
      const hint = ftueHint(game.state, game.view(), free());
      if (!hint) break;
      const name = hint.key ?? hint.step;
      if (steps.at(-1) !== name) steps.push(name);
      if (hint.step === 'tapEgg' || hint.step === 'hatchRare') game.tapIncubator(hint.target.kind === 'incubator' ? hint.target.index : 0);
      else if (hint.step === 'list') game.list(game.view().inventory[0]!.uid);
      else if (hint.step === 'feed') game.tapCreature(game.view().creatures[0]!.uid);
      else if (hint.step === 'sell') game.chatSell(game.chats().find((c) => c.state === 'open')!.id);
      else if (hint.step === 'buyEgg') {
        expect(hint.target).toEqual({ kind: 'button', action: 'egg-free-egg_gift|tab-eggs' });
        expect(game.claimFree('egg_gift')).toBe(true);
      }
      for (let x = 0; x < 0.25; x += STEP_SEC) game.tick(STEP_SEC);
    }
    expect(steps.filter((x) => x !== 'waitCustomer')).toEqual(['tapEgg', 'list', 'feed', 'sell', 'ftue.freeEgg', 'hatchRare']);
    expect(rarities).toEqual(['common', 'valuable']);
    expect(game.state.coins).toBeGreaterThan(0);
  });
});

describe('M4-09 empty shelf hint', () => {
  it('after the first minute, an empty shelf with pets in the inventory brings «List it» back once the player is idle', () => {
    const save = newSave(0);
    save.flags.ftue_done = true;
    save.creatures = [{ uid: 'a', species: 'kettle', level: 1, fed: 0, hatchedAt: 0, age: 0 }];
    save.showcase = [];
    const game = createGame(createStore(save, () => 0), content, createRng(1));
    game.unlist('a');
    const view = game.view();
    expect(view.creatures).toHaveLength(0);
    expect(view.inventory).toHaveLength(1);
    expect(shelfHint(game.state, view, 3, 8)).toBeNull();
    expect(shelfHint(game.state, view, 9, 8)?.step).toBe('list');
    game.list('a');
    expect(shelfHint(game.state, game.view(), 9, 8)).toBeNull();
  });
});

describe('P-04 (Q-056 Б) hints after the first minute', () => {
  const price = content.eggs.eggs.find((e) => e.id === content.ftue.starterEgg)!.price.coins;
  const setup = (coins: number) => {
    const save = newSave(0);
    Object.assign(save.flags, { ftue_starter: true, ftue_fed: true, ftue_bought: true, ftue_done: true });
    save.stats.hatched = 3;
    save.coins = coins;
    const game = createGame(createStore(save, () => 0), content, createRng(1));
    return game;
  };

  it('«Купи новое яйцо» on the empty incubator after eggHintSec of idling, only when its tap buys the egg', () => {
    const game = setup(price);
    const idle = content.ftue.eggHintSec;
    expect(eggHint(game.state, game.view(), idle - 0.1, idle, price)).toBeNull();
    expect(eggHint(game.state, game.view(), idle, idle, price)).toEqual({ step: 'buyEgg', target: { kind: 'incubator', index: 0 } });
    // Too few coins: the tap would be refused — no call.
    expect(eggHint(setup(price - 1).state, game.view(), idle, idle, price)).toBeNull();
    // An egg of «Мои яйца» waits: no «buy».
    game.state.myEggs = { egg_basic: 1 };
    expect(eggHint(game.state, game.view(), idle, idle, price)).toBeNull();
  });

  it('the «rare egg» and «tap the egg» steps on «Яйца» stand on «Открыть» of the row; other hints stay as they are', () => {
    expect(onEggsTab({ step: 'hatchRare', target: { kind: 'incubator', index: 1 } })).toEqual({ step: 'hatchRare', target: { kind: 'button', action: 'egg-open-1|tab-home' } });
    expect(onEggsTab({ step: 'tapEgg', target: { kind: 'incubator', index: 0 } })).toEqual({ step: 'tapEgg', target: { kind: 'button', action: 'egg-open-0|tab-home' } });
    expect(onEggsTab({ step: 'feed', target: { kind: 'slot', index: 0 } })).toEqual({ step: 'feed', target: { kind: 'slot', index: 0 } });
    expect(onEggsTab(null)).toBeNull();
  });
});

describe('P-08 (ревизор геймдизайна) the first upgrade', () => {
  it('«Купи улучшение» after the first minute, idle, with coins for one, until the first upgrade', () => {
    const save = newSave(0);
    Object.assign(save.flags, { ftue_starter: true, ftue_done: true });
    expect(upgradeHint(save, 8, 8, true)?.key).toBe('ftue.upgrade');
    expect(upgradeHint(save, 7, 8, true)).toBeNull();
    expect(upgradeHint(save, 8, 8, false)).toBeNull();
    save.upgrades = { incubator_speed: 1 };
    expect(upgradeHint(save, 8, 8, true)).toBeNull();
    save.upgrades = {};
    save.flags.ftue_done = false;
    expect(upgradeHint(save, 8, 8, true)).toBeNull();
  });
});
