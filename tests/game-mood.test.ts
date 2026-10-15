import { describe, expect, it } from 'vitest';
import { createRng } from '../src/core/rng.ts';
import { createGame } from '../src/sim/game.ts';
import { marketMood } from '../src/sim/rules.ts';
import { newSave } from '../src/sim/state.ts';
import { createStore } from '../src/sim/store.ts';
import { loadGameContent } from '../scripts/load-game-content.ts';

/** M4-23: the mood of the market — one species in fashion (×hot), one fed up with (×cold), by the device's day and the save's seed. */
const content = loadGameContent();
const ids = content.species.species.map((s) => s.id);

describe('M4-23 market mood', () => {
  it('the same day and save give the same pair, two different species; days and saves vary it', () => {
    const a = marketMood('2026-10-15', 1234, ids)!;
    expect(marketMood('2026-10-15', 1234, ids)).toEqual(a);
    expect(a.hot).not.toBe(a.cold);
    const days = new Set(Array.from({ length: 14 }, (_, i) => marketMood(`2026-10-${String(i + 1).padStart(2, '0')}`, 1234, ids)!.hot));
    expect(days.size).toBeGreaterThan(4);
    const saves = new Set(Array.from({ length: 10 }, (_, i) => marketMood('2026-10-15', i * 977, ids)!.hot));
    expect(saves.size).toBeGreaterThan(3);
    expect(marketMood('', 1, ids)).toBeNull();
  });

  it('the price of the species in fashion is ×hot, the fed-up one ×cold; no day — no mood', () => {
    const save = newSave(5000);
    Object.assign(save.flags, { ftue_starter: true, ftue_done: true });
    const m = marketMood('2026-10-15', save.createdAt, ids)!;
    save.creatures = [m.hot, m.cold].map((sp, i) => ({ uid: `m${i}`, species: sp, level: 1, fed: 0, hatchedAt: 0, age: 0 }));
    const game = createGame(createStore(save, () => 0), content, createRng(1));
    const price = (uid: string) => [...game.view().creatures, ...game.view().inventory].find((c) => c.uid === uid)!.price;
    const base = [price('m0'), price('m1')];
    expect(game.mood()).toBeNull();
    game.setDay('2026-10-15');
    expect(game.mood()).toMatchObject({ hot: m.hot, cold: m.cold, hotMult: content.market.mood.hot, coldMult: content.market.mood.cold });
    expect(price('m0') / base[0]!).toBeCloseTo(content.market.mood.hot, 1);
    expect(price('m1') / base[1]!).toBeCloseTo(content.market.mood.cold, 1);
  });
});
