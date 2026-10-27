import { describe, expect, it } from 'vitest';
import { checkLinkAllowed, hasCheckLink, presetSave, readCheckLink } from '../src/core/check-link.ts';
import { newSave } from '../src/sim/state.ts';

describe('N-05 the producer check link', () => {
  it('reads the presets, ignores junk', () => {
    expect(readCheckLink('?fresh=1&coins=500&hatched=3&deals=2&time=4')).toEqual({ fresh: true, coins: 500, hatched: 3, deals: 2, time: 4 });
    expect(readCheckLink('?fresh=yes&coins=-1&hatched=abc&deals=&time=2.7')).toEqual({ fresh: false, coins: null, hatched: null, deals: null, time: 2 });
    expect(hasCheckLink(readCheckLink('?mock=vk'))).toBe(false);
  });

  it('works on the Pages link and the VK stand-in only', () => {
    expect(checkLinkAllowed(true, 'yandex', false)).toBe(true);
    expect(checkLinkAllowed(false, 'yandex', false)).toBe(false);
    expect(checkLinkAllowed(false, 'youtube', false)).toBe(false);
    expect(checkLinkAllowed(false, 'vk', true)).toBe(true);
    expect(checkLinkAllowed(false, 'vk', false)).toBe(false);
  });

  it('?fresh=1 starts a new save; the presets go on top; deals end the first minute', () => {
    const old = newSave(0);
    old.coins = 999;
    old.stats.deals = 40;
    const s = presetSave(old, readCheckLink('?fresh=1&coins=120&deals=3'), 5);
    expect(s).not.toBe(old);
    expect(s.coins).toBe(120);
    expect(s.stats.deals).toBe(3);
    expect(s.stats.xp).toBe(3);
    expect(s.stats.hatched).toBe(3);
    expect(s.flags.ftue_done).toBe(true);
    const kept = presetSave(old, readCheckLink('?coins=7'), 5);
    expect(kept).toBe(old);
    expect(kept.coins).toBe(7);
    expect(kept.stats.deals).toBe(40);
  });

  it('?time=N moves the timers of free eggs', () => {
    const s = newSave(0);
    s.freeIn = { egg_gift: 300 };
    expect(presetSave(s, readCheckLink('?time=3'), 0).freeIn.egg_gift).toBe(120);
  });
});
