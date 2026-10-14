import { describe, expect, it } from 'vitest';
import { createRng } from '../src/core/rng.ts';
import { createGame } from '../src/sim/game.ts';
import { newSave, normalize, parseSave, serialize } from '../src/sim/state.ts';
import { createStore } from '../src/sim/store.ts';
import { dictionaries } from '../src/content/index.ts';
import { loadGameContent } from '../scripts/load-game-content.ts';

/** M3-13: promo codes — in-game rewards only, each code once; a wrong code gets a soft answer. */
const content = loadGameContent();

describe('M3-13 promo codes', () => {
  it('a code works once, case and spaces do not matter; a wrong one is «unknown»; used codes survive a reload', () => {
    const save = newSave(0);
    save.flags = { ftue_starter: true, ftue_done: true, showcase_m3: true };
    save.incubators = [{ egg: 'egg_basic', startedAt: 0, progress: 0, elapsed: 0, waiting: false }];
    const game = createGame(createStore(save, () => 0), content, createRng(1));
    const coinCode = content.codes.codes.find((c) => c.reward.coins)!;
    expect(game.redeemCode(` ${coinCode.code.toLowerCase()} `)).toBe('ok');
    expect(game.state.coins).toBe(coinCode.reward.coins);
    expect(game.redeemCode(coinCode.code)).toBe('used');
    expect(game.state.coins).toBe(coinCode.reward.coins);
    expect(game.redeemCode('NOPE123')).toBe('unknown');
    const eggCode = content.codes.codes.find((c) => c.reward.egg)!;
    expect(game.redeemCode(eggCode.code)).toBe('ok');
    expect(game.state.myEggs[eggCode.reward.egg!]).toBe(1);
    expect(normalize(parseSave(serialize(game.state)), 0).codes).toEqual([coinCode.code, eggCode.code]);
  });

  it('rewards are in-game only (coins, crystals, eggs); the answers are soft and short', () => {
    for (const c of content.codes.codes) expect(Object.keys(c.reward).every((k) => ['coins', 'crystals', 'egg'].includes(k))).toBe(true);
    for (const lang of ['ru', 'en'] as const) for (const k of ['code.ok', 'code.used', 'code.unknown']) expect(dictionaries[lang][k]!.split(/\s+/).length).toBeLessThanOrEqual(7);
  });
});
