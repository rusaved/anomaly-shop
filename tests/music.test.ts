import { describe, expect, it } from 'vitest';
import { loopPoints, musicOn, musicTrack } from '../src/audio/music.ts';
import { audio } from '../src/content/index.ts';

/** P-07 (Q-051 Б): the music by role — the file of the shop, silence without it; on only after a tap, with the switch, without a pause. */
describe('P-07 music', () => {
  it('the shop takes shop.mp3, else the first file that is no role; no file — silence', () => {
    expect(musicTrack('shop', [['/a/other.ogg', 'u1'], ['/a/shop.mp3', 'u2']])).toBe('u2');
    expect(musicTrack('shop', [['/a/loop.mp3', 'u1']])).toBe('u1');
    expect(musicTrack('shop', [])).toBeNull();
  });

  it('plays only with a track, after the first tap, with «Музыка» on and no pause (an ad, a hidden tab)', () => {
    const base = { track: 'u', unlocked: true, on: true, paused: false };
    expect(musicOn(base)).toBe(true);
    expect(musicOn({ ...base, track: null })).toBe(false);
    expect(musicOn({ ...base, unlocked: false })).toBe(false);
    expect(musicOn({ ...base, on: false })).toBe(false);
    expect(musicOn({ ...base, paused: true })).toBe(false);
  });

  it('the build has no music file yet or each one is within the weight (assets/audio/music)', async () => {
    const { readdirSync, statSync, existsSync, readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const dir = resolve(import.meta.dirname, '../assets/audio/music');
    const max = (JSON.parse(readFileSync(resolve(import.meta.dirname, '../content/audio.json'), 'utf8')) as { music: { maxFileKb: number } }).music.maxFileKb * 1024;
    for (const f of existsSync(dir) ? readdirSync(dir).filter((x) => /\.(mp3|ogg)$/.test(x)) : []) expect(statSync(resolve(dir, f)).size, f).toBeLessThanOrEqual(max);
  });
});

/** H-07: shop.mp3 plays in the shop — a seamless round of exactly loopSec, quieter than the sounds of actions (scripts/audio-levels.mjs). */
describe('H-07 the music of the shop', () => {
  it('the file is there; the loop closes at loopSec (64 s), or at the buffer end when it is shorter', async () => {
    const { existsSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    expect(existsSync(resolve(import.meta.dirname, '../assets/audio/music/shop.mp3'))).toBe(true);
    expect(loopPoints(64.026, 64)).toEqual({ start: 0, end: 64 });
    expect(loopPoints(64, 64)).toEqual({ start: 0, end: 64 });
    expect(loopPoints(30)).toEqual({ start: 0, end: 30 });
    expect(audio.music.loopSec).toBe(64);
    // Measured by scripts/audio-levels.mjs (H-07): at 0.22 the music was 4.7 dB under the sounds — quieter now.
    expect(audio.music.volume).toBeLessThanOrEqual(0.16);
  });
});
