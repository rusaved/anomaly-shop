// What: save migrations vN → vN+1 (docs/02-tech.md, section 4.3): raw object of any older version → current SaveData.
// Called by: src/platform/persist.ts on load; tests/save.test.ts.
// Keep: one function per version step in MIGRATIONS, never edit an old step; a newer version than ours means a fresh profile.

import { normalize, SAVE_VERSION, type SaveData } from './state.ts';

export type Migration = (raw: Record<string, unknown>) => Record<string, unknown>;

/** MIGRATIONS[n] turns a v(n) save into v(n+1). Index 1 appears with the first schema change. */
export const MIGRATIONS: Record<number, Migration> = {};

export function runMigrations(raw: Record<string, unknown>, table: Record<number, Migration>, target: number): Record<string, unknown> | null {
  let cur = raw;
  let v = typeof cur.v === 'number' ? cur.v : 0;
  if (v > target) return null;
  while (v < target) {
    const step = table[v];
    if (!step) return null;
    cur = { ...step(cur), v: v + 1 };
    v += 1;
  }
  return cur;
}

/** Current SaveData from a raw save of any supported version; null when it cannot be migrated. */
export function migrate(raw: Record<string, unknown>, now: number): SaveData | null {
  const upgraded = runMigrations(raw, MIGRATIONS, SAVE_VERSION);
  return upgraded ? normalize(upgraded, now) : null;
}
