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
  // What has already been news: the events, the round numbers of deals, the species seen on the showcase.
  const known = { events: new Set<string>(), round: 0, species: new Set<string>(), primed: false };
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
    if (!known.primed) {
      known.primed = true;
      return false;
    }
    return news;
  }
  function show(c: NewsContext): void {
    const i = pickNews(data, c, recent, Math.random(), true);
    if (i < 0) return;
    current = i;
    recent.push(current);
    if (recent.length > 8) recent.shift();
    paint();
    showing = data.showSec ?? 8;
    cooldown = data.everySec.min + Math.random() * (data.everySec.max - data.everySec.min);
  }

  function paint(): void {
    const line = data.lines[current];
    if (!line) return;
    text.textContent = line[lang()];
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
      if (c && why && cooldown <= 0) show(c);
      const on = active && showing > 0 && current >= 0;
      root.hidden = !on;
      titleRow.hidden = on;
    },
    refresh() {
      if (current >= 0 && showing > 0) paint();
    },
  };
}
