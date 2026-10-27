// What: S-09 — the whole screen on the first tap (the browser allows a request only from a tap): any finger tap outside the whole screen
// asks for it, at most once in askGapSec; and the layout recounted after entering, leaving, hiding and turning (the browser sets the
// visible part a moment later).
// Called by: src/main.ts once, with the platform's FullscreenControl (none — VK and OK on the live bridge, YouTube: nothing is installed).
// Keep: a mouse never asks; a refusal leaves the game whole in its window and the next tap asks again; the recount is a «resize» the
// layout already listens to (src/ui/layout.ts watchLayout), echoed on the next frame and after recountMs.

import type { FullscreenControl } from '../platform/types.ts';

/** The rule alone (unit-tested): a finger (or a pen) tap, not in the whole screen, the last request at least gapMs ago. */
export function wantsFullscreen(pointerType: string, on: boolean, now: number, last: number, gapMs: number): boolean {
  return pointerType !== 'mouse' && pointerType !== '' && !on && now - last >= gapMs;
}

export function installFullscreen(fs: FullscreenControl, opts: { askGapSec: number; recountMs: number }, win: Window = window): void {
  let last = -Infinity;
  // pointerup: a touch's pointerdown does not count as a tap for the browser's permission, its release does.
  win.addEventListener(
    'pointerup',
    (e) => {
      const now = win.performance.now();
      if (!wantsFullscreen(e.pointerType, fs.on(), now, last, opts.askGapSec * 1000)) return;
      last = now;
      fs.request();
    },
    { capture: true, passive: true },
  );
  let echo = false;
  const recount = (): void => {
    echo = true;
    win.dispatchEvent(new Event('resize'));
    echo = false;
  };
  const later = (): void => {
    win.requestAnimationFrame(recount);
    win.setTimeout(recount, opts.recountMs);
  };
  win.document.addEventListener('fullscreenchange', () => {
    recount();
    later();
  });
  win.document.addEventListener('visibilitychange', () => {
    if (win.document.visibilityState !== 'visible') return;
    recount();
    later();
  });
  win.addEventListener('resize', () => {
    if (!echo) later();
  });
}
