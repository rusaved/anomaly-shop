// What: the news ticker in the panel title row (docs/01b, section 4.4; M2-14): «Zone news», a line every 10–15 s, scrolls when long.
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
  let left = 0;
  let current = -1;

  function show(): void {
    current = pickNews(data, context(), recent, Math.random());
    recent.push(current);
    if (recent.length > 8) recent.shift();
    paint();
    left = data.everySec.min + Math.random() * (data.everySec.max - data.everySec.min);
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
      root.hidden = !active;
      titleRow.hidden = active;
      if (!active) return;
      left -= dt;
      if (current < 0 || left <= 0) show();
    },
    refresh() {
      if (current >= 0) paint();
    },
  };
}
