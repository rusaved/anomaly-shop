import { describe, expect, it } from 'vitest';
import { hatchSpinSec } from '../src/sim/rules.ts';
import { feel } from '../src/content/index.ts';

/** H-02 (Q-069 п. 1 Б): the long hatch strip only for the first three eggs and from «ценный» up; the rest 1.5–2 s. */
describe('H-02 the hatch strip', () => {
  it('long (about 5 s) for eggs 1–3 of any rarity and for valuable and rarer; quick (1.5–2 s) for the rest', () => {
    expect(feel.hatchShowSec).toBeGreaterThanOrEqual(4);
    expect(feel.hatchQuickSec).toBeGreaterThanOrEqual(1.5);
    expect(feel.hatchQuickSec).toBeLessThanOrEqual(2);
    for (const n of [1, 2, 3]) expect(hatchSpinSec(feel, 'common', n)).toBe(feel.hatchShowSec);
    for (const n of [4, 5, 40]) {
      expect(hatchSpinSec(feel, 'common', n)).toBe(feel.hatchQuickSec);
      expect(hatchSpinSec(feel, 'good', n)).toBe(feel.hatchQuickSec);
      for (const r of ['valuable', 'premium', 'vip', 'exclusive'] as const) expect(hatchSpinSec(feel, r, n)).toBe(feel.hatchShowSec);
    }
  });
});
