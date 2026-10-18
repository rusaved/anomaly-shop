// What: the general leaders (M4-04; docs/01 §6 «Лидеры» in the top bar): a panel with the top of the platform board and the player's own row.
// Called by: src/main.ts (the top bar button; the score — coins earned — goes to the platform on open and every few minutes).
// Keep: the platform does the network (src/platform); a «lite» Yandex player is asked to sign in by a button, never by itself.

import type { Leaders } from '../platform/types.ts';
import { button, createOverlay, type Overlay } from './overlay.ts';

export interface LeadersLookups {
  t(key: string, vars?: Record<string, string | number>): string;
  lang(): string;
  /** The score to send: coins earned in all cities. */
  score(): number;
}

export interface LeadersWindow {
  overlay: Overlay;
  open(): void;
  /** Sends the score when it changed (the caller's timer). */
  sync(): void;
}

/** How many rows of the top the panel shows. */
const TOP = 10;

export function createLeadersWindow(parent: HTMLElement, leaders: Leaders, look: LeadersLookups): LeadersWindow {
  // UB-02: a top bar button opens a panel from the right; the shop stays in view.
  const overlay = createOverlay(parent, 'leaders', () => overlay.hide());
  overlay.card.classList.add('card-detail', 'card-leaders');
  overlay.card.innerHTML =
    // M4-00: one panel model — a panel of the top bar closes with ✕ (a tab or a tap on the shop close it too); «Back» lives only inside a tab.
    `<button type="button" class="sheet-close panel-close" data-action="leaders-back" aria-label="✕">✕</button><h2 data-i18n="leaders.title"></h2>` +
    '<p class="card-sub" data-leaders-note></p><div data-leaders-login></div><ol class="leaders-list" data-leaders-list></ol>';
  const back = overlay.card.querySelector('[data-action="leaders-back"]') as HTMLElement;
  back.addEventListener('click', () => overlay.hide());
  const note = overlay.card.querySelector('[data-leaders-note]') as HTMLElement;
  const loginBox = overlay.card.querySelector('[data-leaders-login]') as HTMLElement;
  const list = overlay.card.querySelector('[data-leaders-list]') as HTMLElement;
  const login = button('leaders-login', 'leaders.login', 'btn-primary');
  login.textContent = look.t('leaders.login');
  login.addEventListener('click', () => {
    void leaders.login().then((ok) => {
      if (ok) void refresh(true);
    });
  });
  let sent = -1;
  const fmt = (n: number): string => new Intl.NumberFormat(look.lang()).format(Math.floor(n));

  async function refresh(force = false): Promise<void> {
    const score = Math.floor(look.score());
    if (force || score !== sent) {
      sent = score;
      await leaders.submit(score);
    }
    if (!overlay.isOpen()) return;
    const lite = leaders.needsLogin();
    note.textContent = look.t(lite ? 'leaders.lite' : 'leaders.note');
    loginBox.replaceChildren(...(lite ? [login] : []));
    const { entries, me } = await leaders.top(TOP);
    const rows = entries.map((e) => row(e.rank, e.name, e.score, e.me));
    if (me && !entries.some((e) => e.me)) rows.push(row(me.rank, me.name, me.score, true));
    if (!rows.length) rows.push(Object.assign(document.createElement('li'), { className: 'card-sub', textContent: look.t('leaders.empty') }));
    list.replaceChildren(...rows);
  }
  function row(rank: number, name: string, score: number, me: boolean): HTMLElement {
    const li = document.createElement('li');
    li.className = `leaders-row${me ? ' me' : ''}`;
    li.dataset.rank = String(rank);
    if (me) li.dataset.me = '';
    li.innerHTML = '<b class="leaders-rank"></b><span class="leaders-name"></span><span class="leaders-score"><span class="coin coin-sm" aria-hidden="true"></span><b></b></span>';
    (li.querySelector('.leaders-rank') as HTMLElement).textContent = rank > 0 ? String(rank) : '—';
    (li.querySelector('.leaders-name') as HTMLElement).textContent = me ? look.t('leaders.you') : name || look.t('leaders.player');
    (li.querySelector('.leaders-score b') as HTMLElement).textContent = fmt(score);
    return li;
  }
  return {
    overlay,
    open() {
      overlay.show();
      void refresh(true);
    },
    sync() {
      void refresh();
    },
  };
}
