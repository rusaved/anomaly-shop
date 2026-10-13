// What: a tiny typed event bus (docs/02-tech.md, section 3: core holds the bus): the sim emits, scene, ui, audio and analytics listen.
// Called by: src/sim/game.ts (emit), src/main.ts and src/ui, src/scene, src/audio, src/analytics (on).
// Keep: listeners never throw into the emitter (each call sits in try/catch); no DOM here.

export interface Emitter<E> {
  on(cb: (e: E) => void): () => void;
  emit(e: E): void;
}

export function createEmitter<E>(onError: (err: unknown) => void = () => undefined): Emitter<E> {
  const listeners = new Set<(e: E) => void>();
  return {
    on(cb) {
      listeners.add(cb);
      return () => void listeners.delete(cb);
    },
    emit(e) {
      for (const cb of [...listeners]) {
        try {
          cb(e);
        } catch (err) {
          onError(err);
        }
      }
    },
  };
}
