import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CLOUD_QUEUE, createSaveQueue } from '../src/platform/save-queue.ts';

/** Cloud write queue (docs/02-tech.md, section 7; docs/03 SAV-02): debounce 2 s, max wait 10 s, one write per 3.5 s. */
describe('save queue', () => {
  beforeEach(() => vi.useFakeTimers({ now: 0 }));
  afterEach(() => vi.useRealTimers());

  const make = () => {
    const writes: Array<[number, string, boolean]> = [];
    const q = createSaveQueue({ ...CLOUD_QUEUE, now: () => Date.now(), write: (d, f) => writes.push([Date.now(), d, f]) });
    return { q, writes };
  };

  it('debounces ordinary requests by 2 s and writes only the latest data', () => {
    const { q, writes } = make();
    q.request('a');
    vi.advanceTimersByTime(1000);
    q.request('b');
    vi.advanceTimersByTime(1999);
    expect(writes).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(writes).toEqual([[3000, 'b', false]]);
    expect(q.pending()).toBe(false);
  });

  it('never waits longer than 10 s while requests keep coming', () => {
    const { q, writes } = make();
    for (let i = 0; i < 20; i++) {
      q.request(`r${i}`);
      vi.advanceTimersByTime(1000);
    }
    expect(writes.map(([t]) => t)).toEqual([10000, 20000]);
  });

  it('a flush writes at once, but never closer than 3.5 s to the previous write', () => {
    const { q, writes } = make();
    q.request('deal1', true);
    expect(writes).toEqual([[0, 'deal1', true]]);
    vi.advanceTimersByTime(1000);
    q.request('deal2', true);
    expect(writes).toHaveLength(1);
    vi.advanceTimersByTime(2499);
    expect(writes).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(writes).toEqual([[0, 'deal1', true], [3500, 'deal2', true]]);
  });

  it('SAV-02 at most 86 writes in 5 minutes under constant pressure', () => {
    const { q, writes } = make();
    for (let t = 0; t < 5 * 60 * 1000; t += 100) {
      q.request(`t${t}`, t % 700 === 0);
      vi.advanceTimersByTime(100);
    }
    expect(writes.length).toBeLessThanOrEqual(86);
    expect(writes.length).toBeGreaterThan(50);
    for (let i = 1; i < writes.length; i++) expect(writes[i]![0] - writes[i - 1]![0]).toBeGreaterThanOrEqual(3500);
  });
});
