import { describe, expect, it, vi } from 'vitest';
import { createPauseManager } from '../src/core/pause.ts';
import { createRuntime, MAX_STEPS_PER_FRAME, STEP_SEC } from '../src/core/runtime.ts';

/** Core clock and pause (docs/02-tech.md, section 4.2). */
describe('PauseManager', () => {
  it('SND-04 the game runs only while the reason set is empty; each reason is removed by its owner', () => {
    const p = createPauseManager();
    const seen: boolean[] = [];
    p.onChange((paused) => seen.push(paused));
    expect(p.isPaused()).toBe(false);
    p.pause('ad');
    p.pause('hidden');
    expect(p.isPaused()).toBe(true);
    expect(p.reasons().sort()).toEqual(['ad', 'hidden']);
    p.resume('ad');
    expect(p.isPaused()).toBe(true);
    p.resume('ad');
    p.resume('hidden');
    expect(p.isPaused()).toBe(false);
    expect(seen).toEqual([true, false]);
  });

  it('a resume without a matching pause changes nothing', () => {
    const p = createPauseManager();
    const cb = vi.fn();
    p.onChange(cb);
    p.resume('menu');
    expect(cb).not.toHaveBeenCalled();
    expect(p.isPaused()).toBe(false);
  });
});

describe('runtime clock', () => {
  it('turns frame time into fixed steps, at most 5 per frame', () => {
    const onStep = vi.fn();
    const rt = createRuntime(onStep);
    expect(rt.frame(STEP_SEC * 2)).toBe(2);
    expect(rt.frame(STEP_SEC / 2)).toBe(0);
    expect(rt.frame(STEP_SEC / 2)).toBe(1);
    expect(rt.frame(1)).toBe(MAX_STEPS_PER_FRAME);
    expect(rt.frame(STEP_SEC / 4)).toBe(0);
    expect(onStep).toHaveBeenCalledTimes(3 + MAX_STEPS_PER_FRAME);
    expect(onStep).toHaveBeenLastCalledWith(STEP_SEC);
  });

  it('no steps while paused; the accumulator is dropped on resume', () => {
    const rt = createRuntime(() => undefined);
    rt.frame(STEP_SEC * 0.9);
    rt.pause.pause('ad');
    expect(rt.frame(1)).toBe(0);
    rt.pause.resume('ad');
    expect(rt.frame(STEP_SEC * 0.5)).toBe(0);
    expect(rt.frame(STEP_SEC * 0.5)).toBe(1);
  });

  it('timeScale and runSim advance game time, elapsed counts game seconds', () => {
    const rt = createRuntime(() => undefined);
    rt.timeScale = 4;
    expect(rt.frame(STEP_SEC)).toBe(4);
    expect(rt.runSim(2)).toBe(120);
    expect(rt.elapsed()).toBeCloseTo(124 * STEP_SEC, 6);
    expect(rt.frame(NaN)).toBe(0);
    expect(rt.frame(-1)).toBe(0);
  });
});
