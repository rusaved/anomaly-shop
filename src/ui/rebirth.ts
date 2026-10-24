// What: the move to a new city (M4-06; docs/01 §3 p. 10): a popup — the city now and next, the income multiplier, what starts over and what stays, «Move».
// Called by: src/main.ts (the «Next» card when the move is ready, the city line of the seller level panel).
// Keep: the numbers come from game.rebirthView(); the move itself is game.rebirth() — the window only asks and confirms.

import type { Game } from '../sim/game.ts';
import { button, closeX, createOverlay, type Overlay } from './overlay.ts';

export interface RebirthLookups {
  t(key: string, vars?: Record<string, string | number>): string;
  lang(): string;
  /** M4-09: the gift egg's name. */
  eggName(id: string): string;
}

export interface RebirthWindow {
  overlay: Overlay;
  open(): void;
  render(): void;
}

export function createRebirthWindow(parent: HTMLElement, game: Game, look: RebirthLookups): RebirthWindow {
  // UB-02: what matters (the whole shop starts over) — a popup in the centre, asked once more.
  const overlay = createOverlay(parent, 'rebirth', () => overlay.hide());
  overlay.card.classList.add('card-rebirth');
  overlay.card.innerHTML =
    '<h2 data-rebirth-title></h2><p class="rebirth-mult" data-rebirth-mult></p><div class="rep-bar" aria-hidden="true"><i data-rebirth-bar></i></div>' +
    '<p class="card-sub" data-rebirth-have></p><p class="rebirth-gift" data-rebirth-gift></p><p class="card-sub" data-rebirth-reset></p><p class="card-sub" data-rebirth-keep></p><div class="rebirth-buttons"></div>';
  const move = button('rebirth-move', 'rebirth.move', 'btn-primary');
  const later = button('rebirth-later', 'rebirth.later');
  (overlay.card.querySelector('.rebirth-buttons') as HTMLElement).append(move, later);
  later.addEventListener('click', () => overlay.hide());
  // RD-02: the ✕ in the corner like every other window (07 rule 13).
  closeX(overlay.card, '✕', () => overlay.hide(), 'rebirth-x');
  move.addEventListener('click', () => {
    if (game.rebirth()) overlay.hide();
  });
  const q = (sel: string): HTMLElement => overlay.card.querySelector(sel) as HTMLElement;
  const win: RebirthWindow = {
    overlay,
    open() {
      overlay.show();
      win.render();
    },
    render() {
      if (!overlay.isOpen()) return;
      const r = game.rebirthView();
      const fmt = new Intl.NumberFormat(look.lang());
      const x = new Intl.NumberFormat(look.lang(), { maximumFractionDigits: 2 });
      q('[data-rebirth-title]').textContent = look.t('rebirth.title', { n: r.city + 1 });
      q('[data-rebirth-mult]').textContent = look.t('rebirth.mult', { a: x.format(r.mult), b: x.format(r.nextMult) });
      q('[data-rebirth-bar]').style.width = `${Math.round(Math.min(1, r.have / Math.max(1, r.need)) * 100)}%`;
      q('[data-rebirth-have]').textContent = look.t('rebirth.have', { n: fmt.format(Math.floor(Math.min(r.have, r.need))), m: fmt.format(r.need) });
      // M4-09: what the new city greets with comes first — a move is a step forward, not a loss.
      q('[data-rebirth-gift]').textContent = r.giftEgg
        ? look.t('rebirth.gift', { n: fmt.format(r.startCoins), egg: look.eggName(r.giftEgg) })
        : look.t('rebirth.start', { n: fmt.format(r.startCoins) });
      q('[data-rebirth-reset]').textContent = look.t('rebirth.reset');
      q('[data-rebirth-keep]').textContent = look.t('rebirth.keep');
      move.setAttribute('aria-disabled', String(!r.ready));
      move.classList.toggle('dim', !r.ready);
    },
  };
  return win;
}
