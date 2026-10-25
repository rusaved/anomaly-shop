// What: load the save through the platform (parse → migrate → defaults) and write every commit back through it.
// Called by: src/main.ts at boot (loadState) and right after the store exists (bindPersistence).
// Keep: a corrupted or unknown save becomes a fresh profile and is reported, never a crash (SAV-05).

import type { GameStore } from '../sim/store.ts';
import { migrate } from '../sim/migrate.ts';
import { newSave, parseSave, SAVE_LIMIT_BYTES, serialize, type SaveData } from '../sim/state.ts';
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

export function bindPersistence(store: GameStore, platform: Platform, track: PlatformTrack = () => undefined): Persistence {
  // SAV-02: a save over our ceiling (100 KB, Yandex takes 200 KB) is refused and reported once, the last good one stays.
  let reported = false;
  const write = (state: SaveData, flush: boolean) => {
    const text = serialize(state);
    if (new TextEncoder().encode(text).length > SAVE_LIMIT_BYTES) {
      if (!reported) track('save_too_big');
      reported = true;
      return;
    }
    platform.save(text, { flush });
  };
  store.onCommit((state, flush) => write(state, flush));
  return {
    flush() {
      write(store.state, true);
    },
  };
}
