// What: load the save through the platform (parse → migrate → defaults) and write every commit back through it.
// Called by: src/main.ts at boot (loadState) and right after the store exists (bindPersistence).
// Keep: a corrupted or unknown save becomes a fresh profile and is reported, never a crash (SAV-05).

import type { GameStore } from '../sim/store.ts';
import { migrate } from '../sim/migrate.ts';
import { newSave, parseSave, serialize, type SaveData } from '../sim/state.ts';
import type { Platform, PlatformTrack } from './types.ts';

export async function loadState(platform: Platform, track: PlatformTrack): Promise<SaveData> {
  const now = platform.now();
  const text = await platform.load();
  if (!text) return newSave(now);
  const raw = parseSave(text);
  const migrated = raw ? migrate(raw, now) : null;
  if (!migrated) {
    track('save_corrupted');
    return newSave(now);
  }
  return migrated;
}

export interface Persistence {
  /** Writes the current state now (hidden, pagehide). */
  flush(): void;
}

export function bindPersistence(store: GameStore, platform: Platform): Persistence {
  store.onCommit((state, flush) => platform.save(serialize(state), { flush }));
  return {
    flush() {
      platform.save(serialize(store.state), { flush: true });
    },
  };
}
