import { describe, expect, it } from 'vitest';
import { createRng } from '../src/core/rng.ts';
import { createGame, type GameEvent } from '../src/sim/game.ts';
import { newSave, normalize, parseSave, serialize } from '../src/sim/state.ts';
import { createStore } from '../src/sim/store.ts';
import { dictionaries } from '../src/content/index.ts';
import { loadGameContent } from '../scripts/load-game-content.ts';

/** M3-11: «Gifts» — an egg per community once, the golden egg for a review once, 7 days that only go on. */
const content = loadGameContent();

function setup() {
  const save = newSave(0);
  save.flags = { ftue_starter: true, ftue_done: true, showcase_m3: true };
  save.stats.hatched = 5;
  save.incubators = [{ egg: 'egg_basic', startedAt: 0, progress: 0, elapsed: 0, waiting: false }];
  const game = createGame(createStore(save, () => 0), content, createRng(1));
  const seen: GameEvent[] = [];
  game.events.on((e) => seen.push(e));
  return { game, seen };
}

describe('M3-11 gifts', () => {
  it('following a community: its egg once, kept after a reload', () => {
    const { game, seen } = setup();
    const vk = content.gifts.subscribe.find((s) => s.id === 'vk')!;
    expect(game.claimSubscribe('vk')).toBe(true);
    expect(game.state.myEggs[vk.reward.egg!]).toBe(1);
    expect(seen.some((e) => e.type === 'gift' && e.from === 'subscribe')).toBe(true);
    expect(game.claimSubscribe('vk')).toBe(false);
    const back = normalize(parseSave(serialize(game.state)), 0);
    expect(back.gifts.subscribed.vk).toBe(true);
    expect(game.claimSubscribe('nope')).toBe(false);
  });

  it('the review: the golden egg once', () => {
    const { game } = setup();
    expect(game.claimReview()).toBe(true);
    expect(game.state.myEggs[content.gifts.review.reward.egg!]).toBe(1);
    expect(game.claimReview()).toBe(false);
  });

  it('7 days: one gift a day, a missed day loses nothing, after the 7th — the 1st again', () => {
    const { game } = setup();
    expect(game.giftsView('2026-10-14')).toMatchObject({ day: 0, dailyReady: true });
    const coins = game.state.coins;
    expect(game.claimDaily('2026-10-14')).toBe(true);
    expect(game.state.coins).toBe(coins + (content.gifts.daily[0]!.reward.coins ?? 0));
    expect(game.claimDaily('2026-10-14')).toBe(false);
    expect(game.giftsView('2026-10-14').dailyReady).toBe(false);
    // Three days away: the next one is day 2, not day 1.
    expect(game.claimDaily('2026-10-17')).toBe(true);
    expect(game.giftsView('2026-10-18').day).toBe(2);
    for (const d of ['19', '20', '21', '22', '23']) game.claimDaily(`2026-10-${d}`);
    expect(game.state.gifts.days).toBe(7);
    expect(game.giftsView('2026-10-24').day).toBe(0);
  });

  it('gift texts never mention ads or referrals', () => {
    for (const lang of ['ru', 'en'] as const)
      for (const [k, v] of Object.entries(dictionaries[lang])) if (k.startsWith('gifts.')) expect(v.toLowerCase(), k).not.toMatch(/реклам|реферал|advert|referr/);
  });
});
