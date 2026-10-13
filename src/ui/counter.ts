// What: a rolling number for the HUD (M1-07): the shown value glides to the target with ease-out, never jumps or runs backwards past it.
// Called by: src/ui/hud.ts (one per counter, stepped by requestAnimationFrame); tests/counter.test.ts (pure, no DOM).
// Keep: set() retargets from the value on screen; snap() for loads and language switches; step() returns true while moving.

export interface Counter {
  /** The value on screen (may be fractional while rolling). */
  shown(): number;
  target(): number;
  /** Glide to a new value over `sec` seconds, starting after `delaySec` (coins still flying). */
  set(value: number, sec: number, delaySec?: number, restart?: boolean): void;
  snap(value: number): void;
  step(dt: number): boolean;
}

export function createCounter(initial: number): Counter {
  let shown = initial;
  let from = initial;
  let to = initial;
  let t = 1;
  let dur = 0;
  let wait = 0;
  return {
    shown: () => shown,
    target: () => to,
    set(value, sec, delaySec = 0, restart = false) {
      if (value === to && !restart) return;
      from = shown;
      to = value;
      t = 0;
      dur = Math.max(0, sec);
      wait = Math.max(0, delaySec);
      if (dur === 0 && wait === 0) {
        shown = to;
        t = 1;
      }
    },
    snap(value) {
      shown = from = to = value;
      t = 1;
      wait = 0;
    },
    step(dt) {
      if (t >= 1) return false;
      if (wait > 0) {
        wait -= dt;
        return true;
      }
      t = dur > 0 ? Math.min(1, t + dt / dur) : 1;
      const e = 1 - Math.pow(1 - t, 3);
      shown = from + (to - from) * e;
      if (t >= 1) shown = to;
      return t < 1;
    },
  };
}
