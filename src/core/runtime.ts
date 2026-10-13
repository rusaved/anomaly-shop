// What: fixed-step clock (docs/02-tech.md, section 4.2): frame time → accumulator → steps of 1/60 s, at most 5 per frame.
// Called by: src/main.ts (one frame per ticker tick), src/test-api (runSim), src/debug (timeScale).
// Keep: steps stop while paused and the accumulator is dropped on resume; onStep is the only way the sim advances.

import { createPauseManager, type PauseManager } from './pause.ts';

export const STEP_SEC = 1 / 60;
export const MAX_STEPS_PER_FRAME = 5;

export interface Runtime {
  readonly pause: PauseManager;
  timeScale: number;
  /** One rendered frame of dtSec real seconds; returns the number of sim steps taken. */
  frame(dtSec: number): number;
  /** Advances the sim by sec game seconds at once (tests and the debug panel). */
  runSim(sec: number): number;
  /** Game seconds stepped so far. */
  elapsed(): number;
}

export function createRuntime(onStep: (dt: number) => void, stepSec = STEP_SEC, maxSteps = MAX_STEPS_PER_FRAME): Runtime {
  const pause = createPauseManager();
  let acc = 0;
  let elapsed = 0;
  pause.onChange((paused) => {
    if (!paused) acc = 0;
  });
  const step = (): void => {
    onStep(stepSec);
    elapsed += stepSec;
  };
  const runtime: Runtime = {
    pause,
    timeScale: 1,
    frame(dtSec) {
      if (pause.isPaused()) return 0;
      const dt = Number.isFinite(dtSec) && dtSec > 0 ? dtSec : 0;
      acc += dt * runtime.timeScale;
      let steps = 0;
      while (acc >= stepSec && steps < maxSteps) {
        step();
        acc -= stepSec;
        steps++;
      }
      if (steps === maxSteps) acc = 0;
      return steps;
    },
    runSim(sec) {
      const steps = Math.max(0, Math.round(sec / stepSec));
      for (let i = 0; i < steps; i++) step();
      return steps;
    },
    elapsed: () => elapsed,
  };
  return runtime;
}
