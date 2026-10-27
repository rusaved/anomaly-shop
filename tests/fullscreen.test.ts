import { describe, expect, it } from 'vitest';
import { wantsFullscreen } from '../src/ui/fullscreen.ts';
import { feel } from '../src/content/index.ts';

/** S-09: the whole screen on a finger tap — at most once a second, never by a mouse, never while on. */
describe('S-09 fullscreen', () => {
  const gap = feel.fullscreen.askGapSec * 1000;
  it('a finger tap outside the whole screen asks; a mouse never; on — never; again only after askGapSec', () => {
    expect(feel.fullscreen.askGapSec).toBeGreaterThanOrEqual(1);
    expect(wantsFullscreen('touch', false, 5000, -Infinity, gap)).toBe(true);
    expect(wantsFullscreen('pen', false, 5000, -Infinity, gap)).toBe(true);
    expect(wantsFullscreen('mouse', false, 5000, -Infinity, gap)).toBe(false);
    expect(wantsFullscreen('touch', true, 5000, -Infinity, gap)).toBe(false);
    // Refused: the next tap within the second does not ask, the one after it does.
    expect(wantsFullscreen('touch', false, 5000 + gap - 1, 5000, gap)).toBe(false);
    expect(wantsFullscreen('touch', false, 5000 + gap, 5000, gap)).toBe(true);
  });

});
