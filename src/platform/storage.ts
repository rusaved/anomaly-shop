// What: prefixed key-value mirror over localStorage or any Storage-like backend; never throws (private mode, quota).
// Called by: src/platform/null.ts, yandex.ts; tests/platform.test.ts with a fake backend.
// Keep: every backend call sits in try/catch; keys carry the game prefix (docs/02-tech.md, section 4.3).

export interface KeyValue {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface Mirror {
  get(key: string): string | null;
  set(key: string, value: string): boolean;
  remove(key: string): void;
}

export function createMirror(backend: KeyValue | null, prefix: string): Mirror {
  const full = (key: string): string => `${prefix}:${key}`;
  return {
    get(key) {
      try {
        return backend ? backend.getItem(full(key)) : null;
      } catch {
        return null;
      }
    },
    set(key, value) {
      try {
        backend?.setItem(full(key), value);
        return backend !== null;
      } catch {
        return false;
      }
    },
    remove(key) {
      try {
        backend?.removeItem(full(key));
      } catch {
        /* nothing to remove */
      }
    },
  };
}

/** window.localStorage when it works (a probe write succeeds), otherwise null. */
export function browserStorage(): KeyValue | null {
  try {
    const s = window.localStorage;
    const probe = `${__GAME__.id}:probe`;
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

/** In-memory backend for the fallbacks and tests. */
export function memoryStorage(): KeyValue {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, String(v)),
    removeItem: (k) => void m.delete(k),
  };
}
