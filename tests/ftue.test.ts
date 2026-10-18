import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRng } from '../src/core/rng.ts';
import { STEP_SEC } from '../src/core/runtime.ts';
import { createGame, type GameEvent } from '../src/sim/game.ts';
import { ftueHint, shelfHint, tabHint, type FtueStep } from '../src/sim/ftue.ts';
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
