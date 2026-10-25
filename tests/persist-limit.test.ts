import { describe, expect, it } from 'vitest';
import { bindPersistence } from '../src/platform/persist.ts';
import type { Platform } from '../src/platform/types.ts';
import { newSave, SAVE_LIMIT_BYTES } from '../src/sim/state.ts';
import { createStore } from '../src/sim/store.ts';

describe('SAV-02 save size ceiling (M7-01)', () => {
  it('a save over 100 KB never reaches the platform and is reported once; a normal one goes through', () => {
    const writes: string[] = [];
    const events: string[] = [];
    const platform = { save: (text: string) => writes.push(text) } as unknown as Platform;
    const store = createStore(newSave(0), () => 0);
    const persistence = bindPersistence(store, platform, (e) => events.push(e));
    store.commit();
    expect(writes).toHaveLength(1);
    store.state.shopName = 'x'.repeat(SAVE_LIMIT_BYTES + 1);
    store.commit({ flush: true });
    persistence.flush();
    expect(writes).toHaveLength(1);
    expect(events).toEqual(['save_too_big']);
    store.state.shopName = 'Лавка';
    persistence.flush();
    expect(writes).toHaveLength(2);
  });
});
