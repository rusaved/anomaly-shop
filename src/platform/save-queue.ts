// What: write queue for cloud saves (docs/02-tech.md, section 7): debounce 2 s, at most 10 s of waiting, one write per 3.5 s.
// Called by: src/platform/yandex.ts (player.setData), src/platform/youtube.ts (ytgame.game.saveData); tests/save-queue.test.ts.
// Keep: a flush writes at the earliest allowed moment; only the latest data is ever written; timers are global (fakeable).

export interface SaveQueueOptions {
  debounceMs: number;
  maxWaitMs: number;
  minIntervalMs: number;
  now(): number;
  write(data: string, flush: boolean): void;
}

export const CLOUD_QUEUE = { debounceMs: 2000, maxWaitMs: 10000, minIntervalMs: 3500 };

export interface SaveQueue {
  request(data: string, flush?: boolean): void;
  /** True while a write is scheduled. */
  pending(): boolean;
  /** Number of writes done so far. */
  writes(): number;
}

export function createSaveQueue(o: SaveQueueOptions): SaveQueue {
  let data: string | null = null;
  let flushWanted = false;
  let firstRequestAt: number | null = null;
  let lastWriteAt = -Infinity;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let count = 0;

  const write = (): void => {
    timer = null;
    if (data === null) return;
    const payload = data;
    const flush = flushWanted;
    data = null;
    flushWanted = false;
    firstRequestAt = null;
    lastWriteAt = o.now();
    count += 1;
    o.write(payload, flush);
  };

  return {
    request(next, flush = false) {
      const now = o.now();
      data = next;
      flushWanted = flushWanted || flush;
      if (firstRequestAt === null) firstRequestAt = now;
      const earliest = lastWriteAt + o.minIntervalMs;
      const due = flushWanted ? Math.max(now, earliest) : Math.max(Math.min(now + o.debounceMs, firstRequestAt + o.maxWaitMs), earliest);
      if (timer !== null) clearTimeout(timer);
      if (due <= now) write();
      else timer = setTimeout(write, due - now);
    },
    pending: () => timer !== null,
    writes: () => count,
  };
}
