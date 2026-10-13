// What: PauseManager (docs/02-tech.md, section 4.2): a set of reasons; the game runs only while the set is empty.
// Called by: src/core/runtime.ts (steps stop), src/main.ts (sdk, hidden, blur, ad), src/ui (menu, transition).
// Keep: whoever adds a reason removes it; one place decides "paused"; no DOM or SDK here.

export type PauseReason = 'ad' | 'sdk' | 'hidden' | 'blur' | 'menu' | 'transition';
export type PauseListener = (paused: boolean, reasons: PauseReason[]) => void;

export interface PauseManager {
  pause(reason: PauseReason): void;
  resume(reason: PauseReason): void;
  isPaused(): boolean;
  has(reason: PauseReason): boolean;
  reasons(): PauseReason[];
  onChange(cb: PauseListener): () => void;
}

export function createPauseManager(): PauseManager {
  const set = new Set<PauseReason>();
  const listeners = new Set<PauseListener>();
  const notify = (): void => {
    const paused = set.size > 0;
    const list = [...set];
    listeners.forEach((cb) => cb(paused, list));
  };
  return {
    pause(reason) {
      const was = set.size > 0;
      set.add(reason);
      if (!was) notify();
    },
    resume(reason) {
      if (!set.delete(reason)) return;
      if (set.size === 0) notify();
    },
    isPaused: () => set.size > 0,
    has: (reason) => set.has(reason),
    reasons: () => [...set],
    onChange(cb) {
      listeners.add(cb);
      return () => void listeners.delete(cb);
    },
  };
}
