// What: the «while you were away» window (docs/01, section 2; M2-04): time away and what the shop did — coins, sales, hatches, levels.
// Called by: src/main.ts after game.offline() at boot and on return to a tab hidden for a minute or more.
// Keep: the coins are already in the wallet when it shows (closing loses nothing); M4 adds «×2 for an ad» here.

import type { OfflineReport } from '../sim/game.ts';
import { button, createOverlay, type Overlay } from './overlay.ts';

export interface AwayLookups {
  t(key: string, vars?: Record<string, string | number>): string;
  lang(): string;
}

export interface AwayWindow {
  overlay: Overlay;
  /** Shows the report when the shop did something; false when there is nothing to tell. */
  show(report: OfflineReport): boolean;
  close(): void;
}

/** Reports shorter than this are not worth a window. */
export const AWAY_MIN_SEC = 60;

export function createAwayWindow(parent: HTMLElement, look: AwayLookups): AwayWindow {
  const overlay = createOverlay(parent, 'away', () => win.close(), { dismiss: () => win.close() });
  overlay.card.classList.add('card-away');
  const title = document.createElement('h2');
  title.dataset.i18n = 'away.title';
  const time = document.createElement('p');
  time.className = 'away-time';
  const coins = document.createElement('div');
  coins.className = 'away-coins';
  coins.innerHTML = '<span class="coin" aria-hidden="true"></span><b data-away-coins></b>';
  const list = document.createElement('ul');
  list.className = 'away-list';
  const ok = button('away-ok', 'away.ok', 'btn-primary');
  overlay.card.append(title, time, coins, list, ok);
  ok.addEventListener('click', () => win.close());

  const win: AwayWindow = {
    overlay,
    show(r) {
      if (r.awaySec < AWAY_MIN_SEC || (r.coins <= 0 && r.hatched <= 0 && r.levelUps <= 0)) return false;
      const fmt = new Intl.NumberFormat(look.lang());
      const h = Math.floor(r.awaySec / 3600);
      const m = h > 0 ? Math.floor((r.awaySec % 3600) / 60) : Math.max(1, Math.round(r.awaySec / 60));
      const parts = [h > 0 ? look.t('away.hours', { n: h }) : '', m > 0 ? look.t('away.minutes', { n: m }) : ''].filter(Boolean);
      time.textContent = look.t('away.time', { time: parts.join(' ') });
      (coins.querySelector('[data-away-coins]') as HTMLElement).textContent = `+${fmt.format(Math.round(r.coins))}`;
      coins.hidden = r.coins <= 0;
      list.replaceChildren();
      for (const [key, n] of [['away.sold', r.sold], ['away.hatched', r.hatched], ['away.levelUps', r.levelUps]] as const) {
        if (n <= 0) continue;
        const li = document.createElement('li');
        li.textContent = look.t(key, { n: fmt.format(n) });
        list.appendChild(li);
      }
      if (r.coins <= 0) {
        const li = document.createElement('li');
        li.className = 'away-hint';
        li.textContent = look.t('away.hint');
        list.appendChild(li);
      }
      title.textContent = look.t('away.title');
      ok.textContent = look.t('away.ok');
      overlay.show();
      return true;
    },
    close() {
      overlay.hide();
    },
  };
  return win;
}
