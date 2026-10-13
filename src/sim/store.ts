// What: the live game state and its commit log: commands change state, then commit(); listeners persist it.
// Called by: src/sim commands, src/platform/persist.ts (subscribes), src/ui and src/scene (read state), debug panel.
// Keep: every change to state ends with commit(); flush marks key moments (deal, hatch, purchase, reward, rebirth).

import type { SaveData } from './state.ts';

export type CommitListener = (state: SaveData, flush: boolean) => void;

export interface GameStore {
  readonly state: SaveData;
  commit(opts?: { flush?: boolean }): void;
  onCommit(cb: CommitListener): () => void;
  /** Replaces the whole state (reset, debug); commits with flush. */
  replace(next: SaveData): void;
}

export function createStore(initial: SaveData, now: () => number): GameStore {
  let state = initial;
  const listeners = new Set<CommitListener>();
  const store: GameStore = {
    get state() {
      return state;
    },
    commit(opts) {
      state.rev += 1;
      state.savedAt = now();
      const flush = Boolean(opts?.flush);
      listeners.forEach((cb) => cb(state, flush));
    },
    onCommit(cb) {
      listeners.add(cb);
      return () => void listeners.delete(cb);
    },
    replace(next) {
      state = next;
      store.commit({ flush: true });
    },
  };
  return store;
}
