// What: the milestone code of the producer link's label (docs/05, section 2): the newest milestone whose features all pass or are deferred.
// Called by: vite.config.ts (buildLabel), tests/build-label.test.ts.
// Keep: S-05 — an older milestone left with an open feature does not hold the label back (it read «FB» for weeks).

export interface FeatureList {
  milestones?: Array<{ code: string }>;
  features?: Array<{ milestone: string; passes?: boolean; deferred?: boolean }>;
}

export function doneMilestone(list: FeatureList): string {
  let done = 'M0';
  const features = list.features ?? [];
  for (const { code } of list.milestones ?? []) {
    const own = features.filter((f) => f.milestone === code);
    if (own.length > 0 && own.every((f) => f.passes || f.deferred)) done = code;
  }
  return done;
}
