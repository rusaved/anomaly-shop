// What: the news ticker in the panel title row (docs/01b 4.4; M2-14, M3-18): speaks only with a reason (an event, a round number of deals, a new species), then hides.
// Called by: src/main.ts (create once; tick with game seconds; shows the game title until the first minute is done).
// Keep: the line comes from src/sim/news.ts (pickNews) over content/news.json; the roll uses Math.random here, in ui only.

import type { NewsData } from '../content/schemas.ts';
import { pickNews, type NewsContext } from '../sim/news.ts';

export interface NewsTicker {
  root: HTMLElement;
  /** dt game seconds; active false keeps the title (first minute). */
  tick(dt: number, active: boolean): void;
  /** Shows a new line now (language switch, a fresh event). */
  refresh(): void;
  /** M4-23: a line of the day (the mood of the market) — shown once, as soon as the ticker may speak. */
  announce(text: () => string): void;
}

export function createNewsTicker(titleRow: HTMLElement, data: NewsData, context: () => NewsContext, lang: () => 'ru' | 'en'): NewsTicker {
  const root = document.createElement('div');
  root.className = 'news';
  root.dataset.news = '';
  root.hidden = true;
  root.innerHTML = '<span class="news-tag" aria-hidden="true"></span><span class="news-window"><span class="news-text" data-news-text></span></span>';
  titleRow.after(root);
  const text = root.querySelector('[data-news-text]') as HTMLElement;
  const win = root.querySelector('.news-window') as HTMLElement;
  const recent: number[] = [];
  /** Seconds until the ticker may speak again, and how long the current line stays. */
  let cooldown = 0;
  let showing = 0;
  let current = -1;
  /** A line of the day waiting to be shown, and the one on screen (current = ANNOUNCE). */
  let pending: (() => string) | null = null;
  let custom: (() => string) | null = null;
  const ANNOUNCE = -2;
  // What has already been news: the events, the round numbers of deals, the species seen on the showcase.
  const known = { events: new Set<string>(), round: 0, species: new Set<string>(), shop: '', primed: false };
  /** M6-23: the shop's name for {shop} in a line. */
  let shopName = '';
  /** M6-23: the shop was just named — the next line is about the name. */
  let renamed = false;
  const ROUND = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000];
  /** A reason to speak (M3-18): something new since the last look; the first look only learns what is there. */
  function reason(c: NewsContext): boolean {
    const round = ROUND.filter((n) => c.deals >= n).at(-1) ?? 0;
    let news = round > known.round;
    known.round = round;
    for (const e of c.events)
      if (!known.events.has(e)) {
        known.events.add(e);
        news = true;
      }
    for (const s of c.species)
      if (!known.species.has(s)) {
        known.species.add(s);
        news = true;
      }
    // M6-23: a new name of the shop is news too.
    shopName = c.shop ?? '';
    if (shopName !== known.shop) {
      known.shop = shopName;
      renamed = Boolean(shopName) && known.primed;
      news = true;
    }
    if (!known.primed) {
      known.primed = true;
      return false;
    }
    return news;
  }
  function show(c: NewsContext): void {
    const named = renamed ? data.lines.flatMap((l, k) => (l.when.type === 'named' ? [k] : [])) : [];
    renamed = false;
    const i = named.length ? named[Math.floor(Math.random() * named.length)]! : pickNews(data, c, recent, Math.random(), true);
    if (i < 0) return;
    current = i;
    recent.push(current);
    if (recent.length > 8) recent.shift();
    paint();
    showing = data.showSec ?? 8;
    cooldown = data.everySec.min + Math.random() * (data.everySec.max - data.everySec.min);
  }

  function paint(): void {
    const line = current === ANNOUNCE ? custom?.() : data.lines[current]?.[lang()].replace('{shop}', shopName);
    if (!line) return;
    text.textContent = line;
    text.classList.remove('news-in', 'news-scroll');
    text.style.removeProperty('--news-shift');
    void text.offsetWidth;
    const overflow = text.scrollWidth - win.clientWidth;
    if (overflow > 4) {
      text.style.setProperty('--news-shift', `${-overflow - 8}px`);
      text.style.setProperty('--news-scroll-sec', `${Math.max(4, overflow / 25 + 2)}s`);
      text.classList.add('news-scroll');
    } else text.classList.add('news-in');
  }

  return {
    root,
    tick(dt, active) {
      cooldown -= dt;
      showing -= dt;
      const c = active ? context() : null;
      const why = c ? reason(c) : false;
      if (c && pending && cooldown <= 0) {
        custom = pending;
        pending = null;
        current = ANNOUNCE;
        paint();
        showing = (data.showSec ?? 8) + 4;
        cooldown = data.everySec.min;
      } else if (c && why && cooldown <= 0) show(c);
      const on = active && showing > 0 && current !== -1;
      root.hidden = !on;
      titleRow.hidden = on;
    },
    refresh() {
      if (current !== -1 && showing > 0) paint();
    },
    announce(line) {
      pending = line;
    },
  };
}
