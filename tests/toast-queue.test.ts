import { describe, expect, it } from 'vitest';
import { enqueue, TOAST_MIN_MS, type ToastItem } from '../src/ui/toast.ts';
import { pickNews } from '../src/sim/news.ts';
import { news } from '../src/content/index.ts';

/** M3-18: less noise — toasts one at a time in a queue (at least 2 s each), the news ticker only with a reason. */
const t = (text: string, kind: ToastItem['kind'] = 'info'): ToastItem => ({ text, kind, ms: 1000 });

describe('M3-18 noise', () => {
  it('the toast queue: in order, no repeats of a text shown or waiting, at most 4 waiting with the rare ones kept', () => {
    const q: ToastItem[] = [];
    enqueue(q, t('a'), null);
    enqueue(q, t('a'), null);
    enqueue(q, t('b'), 'b');
    expect(q.map((x) => x.text)).toEqual(['a']);
    enqueue(q, t('r', 'rare'), null);
    for (const x of ['c', 'd', 'e', 'f']) enqueue(q, t(x), null);
    expect(q).toHaveLength(4);
    expect(q.some((x) => x.text === 'r')).toBe(true);
    expect(q.map((x) => x.text)).toEqual(['r', 'd', 'e', 'f']);
    expect(TOAST_MIN_MS).toBeGreaterThanOrEqual(2000);
  });

  it('the ticker with a reason picks only lines about the shop (no filler, no clock), or nothing', () => {
    const ctx = { deals: 0, coins: 0, species: [], upgrades: [], districts: [], hour: 12, idleSec: 0, events: [] };
    const i = pickNews(news, ctx, [], 0.5, true);
    if (i >= 0) expect(['always', 'hours']).not.toContain(news.lines[i]!.when.type);
    const rich = { ...ctx, deals: 120, coins: 5000, species: ['kettle'], events: ['golden'] };
    for (let k = 0; k < 20; k++) {
      const j = pickNews(news, rich, [], k / 20, true);
      expect(j).toBeGreaterThanOrEqual(0);
      expect(['always', 'hours']).not.toContain(news.lines[j]!.when.type);
    }
    expect(news.everySec.min).toBeGreaterThanOrEqual(25);
    expect(news.everySec.max).toBeLessThanOrEqual(40);
  });
});

describe('H-04 one queue, the important first', () => {
  it('an answer to a tap first, then a refusal, rare, good, the rest; calm news after the answers of its kind; same rank keeps its order', () => {
    const q: ToastItem[] = [];
    enqueue(q, t('plain1'), null);
    enqueue(q, { text: 'level', kind: 'rare', ms: 1000, calm: true }, null);
    enqueue(q, t('rare1', 'rare'), null);
    enqueue(q, { text: 'answer', kind: 'info', ms: 1000, now: true }, null);
    expect(q.map((x) => x.text)).toEqual(['answer', 'rare1', 'level', 'plain1']);
    enqueue(q, t('plain2'), null);
    expect(q.at(-1)!.text).toBe('plain2');
  });
});
