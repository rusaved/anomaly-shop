import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { doneMilestone, type FeatureList } from '../scripts/build-label.ts';

/** S-05: the label of the producer link (?debug=1 on Pages) names the newest milestone done, not the last one before an open feature. */
describe('S-05 build label', () => {
  it('an older milestone with an open feature does not hold the label back', () => {
    const list: FeatureList = {
      milestones: [{ code: 'A' }, { code: 'B' }, { code: 'C' }, { code: 'D' }],
      features: [
        { milestone: 'A', passes: true },
        { milestone: 'B', passes: false },
        { milestone: 'C', passes: true },
        { milestone: 'C', deferred: true },
        { milestone: 'D', passes: false },
      ],
    };
    expect(doneMilestone(list)).toBe('C');
  });

  it('the shipped feature list: the label is a milestone code, not the stale «FB»', () => {
    const list = JSON.parse(readFileSync(new URL('../feature_list.json', import.meta.url), 'utf8')) as FeatureList;
    const done = doneMilestone(list);
    expect(done).not.toBe('FB');
    expect(list.milestones!.map((m) => m.code)).toContain(done);
  });
});
