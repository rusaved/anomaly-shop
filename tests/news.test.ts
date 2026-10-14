import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as v from 'valibot';
import { NewsFile } from '../src/content/schemas.ts';
import { newsFits, pickNews, type NewsContext } from '../src/sim/news.ts';

/** M2-14: the news ticker — 40+ lines ru/en with conditions; a line fits the shop, never one of the last three. */
const data = v.parse(NewsFile, JSON.parse(readFileSync(resolve(import.meta.dirname, '../content/news.json'), 'utf8')));
const ctx = (patch: Partial<NewsContext> = {}): NewsContext => ({ deals: 0, coins: 0, species: [], upgrades: [], districts: ['yard'], hour: 13, idleSec: 0, events: [], ...patch });

describe('M2-14 news ticker', () => {
  it('40+ lines, ru and en, every kind of condition of docs/01b §4.4', () => {
    expect(data.lines.length).toBeGreaterThanOrEqual(40);
    const kinds = new Set(data.lines.map((l) => l.when.type));
    for (const k of ['always', 'deals', 'species', 'upgrade', 'hours', 'coins', 'idle', 'event']) expect(kinds).toContain(k);
    expect(data.everySec).toEqual({ min: 10, max: 15 });
  });

  it('conditions: deals, showcase species, time of day across midnight, idle', () => {
    expect(newsFits({ type: 'deals', min: 10 }, ctx({ deals: 9 }))).toBe(false);
    expect(newsFits({ type: 'deals', min: 10 }, ctx({ deals: 10 }))).toBe(true);
    expect(newsFits({ type: 'species', id: 'kettle' }, ctx({ species: ['kettle'] }))).toBe(true);
    expect(newsFits({ type: 'hours', from: 22, to: 6 }, ctx({ hour: 23 }))).toBe(true);
    expect(newsFits({ type: 'hours', from: 22, to: 6 }, ctx({ hour: 3 }))).toBe(true);
    expect(newsFits({ type: 'hours', from: 22, to: 6 }, ctx({ hour: 12 }))).toBe(false);
    expect(newsFits({ type: 'idle', sec: 20 }, ctx({ idleSec: 25 }))).toBe(true);
  });

  it('only fitting lines, and never one of the last three', () => {
    const recent: number[] = [];
    const c = ctx({ deals: 30, coins: 1500, species: ['kettle', 'cloudcat'], upgrades: ['mat'], hour: 23 });
    for (let i = 0; i < 300; i++) {
      const pick = pickNews(data, c, recent, (i * 0.6180339) % 1);
      expect(newsFits(data.lines[pick]!.when, c)).toBe(true);
      expect(recent.slice(-3)).not.toContain(pick);
      recent.push(pick);
    }
    expect(new Set(recent).size).toBeGreaterThan(15);
  });

  it('lines about the shop come more often than the general ones', () => {
    const c = ctx({ species: ['kettle'] });
    const kettle = data.lines.findIndex((l) => l.when.type === 'species' && l.when.id === 'kettle');
    let hits = 0;
    for (let i = 0; i < 1000; i++) if (pickNews(data, c, [], i / 1000) === kettle) hits += 1;
    const always = data.lines.filter((l) => l.when.type === 'always').length;
    expect(hits / 1000).toBeGreaterThan(1 / (always + 1));
  });
});

import { loadContent } from '../scripts/validate-content.mjs';
import { validateContent } from '../src/content/validate.ts';

describe('M2-14 validate:content for news.json', () => {
  const game = JSON.parse(readFileSync(resolve(import.meta.dirname, '../game.json'), 'utf8')) as Record<string, unknown>;
  const files = () => JSON.parse(JSON.stringify((loadContent() as { files: Record<string, Record<string, unknown>> }).files)) as Record<string, Record<string, unknown>>;
  type Line = { when: Record<string, unknown>; ru: string; en: string };

  it('parity by design (ru and en in every line), no full stop, no long dash, known ids, 40+ lines', () => {
    const f1 = files();
    const lines = f1['news.json']!.lines as Line[];
    delete (lines[0] as Partial<Line>).en;
    expect(validateContent(f1, game).errors.some((e) => e.startsWith('news.json: lines.0.en'))).toBe(true);
    const f2 = files();
    (f2['news.json']!.lines as Line[])[1]!.ru = 'Конец.';
    (f2['news.json']!.lines as Line[])[2]!.en = 'Some — dash';
    (f2['news.json']!.lines as Line[])[3]!.when = { type: 'species', id: 'unicorn' };
    const errors = validateContent(f2, game).errors.join('\n');
    expect(errors).toContain('lines.1.ru — no full stop');
    expect(errors).toContain('lines.2.en — no long dash');
    expect(errors).toContain('unknown species "unicorn"');
    const f3 = files();
    f3['news.json']!.lines = (f3['news.json']!.lines as Line[]).slice(0, 10);
    expect(validateContent(f3, game).errors.join('\n')).toContain('40 at least');
  });
});
