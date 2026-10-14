// What: the news ticker pick (docs/01b, section 4.4; M2-14): which line of news.json fits the shop now, never one of the last few.
// Called by: src/ui/news.ts every 10–15 s; tests/news.test.ts.
// Keep: a pure function of data, context and a roll in [0, 1); the texts live in content/news.json, the code knows no jokes.

import type { NewsData, NewsWhenData } from '../content/schemas.ts';

export interface NewsContext {
  deals: number;
  coins: number;
  /** Species on the showcase now. */
  species: string[];
  /** Upgrades bought at least once. */
  upgrades: string[];
  districts: string[];
  /** Local hour of the device, 0..23. */
  hour: number;
  /** Seconds since the player last touched anything. */
  idleSec: number;
  /** Events seen within the last minute. */
  events: string[];
}

export function newsFits(w: NewsWhenData, c: NewsContext): boolean {
  switch (w.type) {
    case 'always':
      return true;
    case 'deals':
      return c.deals >= w.min;
    case 'species':
      return c.species.includes(w.id);
    case 'upgrade':
      return c.upgrades.includes(w.id);
    case 'hours':
      return w.from <= w.to ? c.hour >= w.from && c.hour < w.to : c.hour >= w.from || c.hour < w.to;
    case 'coins':
      return c.coins >= w.min;
    case 'district':
      return c.districts.includes(w.id);
    case 'idle':
      return c.idleSec >= w.sec;
    case 'event':
      return c.events.includes(w.id);
  }
}

/** Index of the next line: fitting ones, not among the last noRepeat shown, weighted (lines with a condition win specificWeight×). */
export function pickNews(data: NewsData, c: NewsContext, recent: number[], roll: number, specificOnly = false): number {
  const avoid = new Set(recent.slice(-data.noRepeat));
  // M3-18: the ticker speaks only with a reason — then only lines about the shop (no filler, no clock lines).
  let pool = data.lines
    .map((l, i) => ({ i, w: l.when.type === 'always' ? 1 : data.specificWeight, ok: newsFits(l.when, c) && (!specificOnly || (l.when.type !== 'always' && l.when.type !== 'hours')) }))
    .filter((x) => x.ok);
  if (!pool.length) return -1;
  const fresh = pool.filter((x) => !avoid.has(x.i));
  if (fresh.length) pool = fresh;
  const total = pool.reduce((s, x) => s + x.w, 0);
  let r = Math.min(0.999999, Math.max(0, roll)) * total;
  for (const x of pool) {
    r -= x.w;
    if (r < 0) return x.i;
  }
  return pool[pool.length - 1]?.i ?? 0;
}
