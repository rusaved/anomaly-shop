import { describe, expect, it } from 'vitest';
import { createRng } from '../src/core/rng.ts';
import { createGame } from '../src/sim/game.ts';
import { priceZone, replyDelay } from '../src/sim/rules.ts';
import { newSave } from '../src/sim/state.ts';
import { createStore } from '../src/sim/store.ts';
import { loadGameContent } from '../scripts/load-game-content.ts';
import style from '../content/style.json';

/** M3-06, MU-06: the price slider — four zones (docs/07); the cheaper the asking price, the sooner a buyer writes (8–15 s at the market). */
const content = loadGameContent();
const m = content.market;

describe('M3-06 price slider', () => {
  const N = m.slider.delay.length;
  it('four equal zones from slider.min to slider.max (green «Fast» → red «Max»); the market price sits in the blue «Market» one', () => {
    expect(N).toBe(4);
    expect(style.priceZones).toHaveLength(N);
    const step = (m.slider.max - m.slider.min) / N;
    for (let z = 0; z < N; z++) expect(priceZone(m.slider.min + step * (z + 0.5), m.slider)).toBe(z);
    expect(priceZone(0, m.slider)).toBe(0);
    expect(priceZone(9, m.slider)).toBe(N - 1);
    expect(priceZone(1, m.slider)).toBe(1);
  });

  it('arrival time by zone: below the market sooner, above later; the market price within 8–15 s', () => {
    const step = (m.slider.max - m.slider.min) / N;
    const mid = (z: number): number => m.slider.min + step * (z + 0.5);
    for (const roll of [0, 0.5, 0.99]) {
      const times = Array.from({ length: N }, (_, z) => replyDelay(mid(z), roll, m));
      for (let z = 1; z < N; z++) expect(times[z]!).toBeGreaterThan(times[z - 1]!);
      expect(times[0]!).toBeLessThan(m.replySec.min);
      expect(times[N - 1]!).toBeGreaterThan(m.replySec.max);
    }
    const atMarket = replyDelay(1, 0.5, m) / (m.slider.delay[priceZone(1, m.slider)] ?? 1);
    expect(atMarket).toBeGreaterThanOrEqual(m.replySec.min);
    expect(atMarket).toBeLessThanOrEqual(m.replySec.max);
  });

  it('setAsk clamps to the slider and survives in the save; the view shows the coins and the zone', () => {
    const save = newSave(0);
    save.creatures = [{ uid: 'a', species: 'cloudcat', level: 2, fed: 0, hatchedAt: 0, age: 0 }];
    const game = createGame(createStore(save, () => 0), content, createRng(1));
    const before = game.view().creatures[0]!;
    expect(before).toMatchObject({ askShare: 1, ask: before.price });
    expect(game.setAsk('a', 99)).toBe(true);
    expect(game.view().creatures[0]).toMatchObject({ askShare: m.slider.max, zone: N - 1 });
    game.setAsk('a', m.slider.min);
    expect(game.view().creatures[0]!.zone).toBe(0);
    expect(game.state.creatures[0]!.askShare).toBe(m.slider.min);
    expect(game.setAsk('nobody', 1)).toBe(false);
  });
});
