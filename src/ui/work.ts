// What: the Side job window (docs/01 §3 p. 15; M3-12): a big bowl — a tap feeds the neighbours' pets, «+N» flies up; «Level up for …» on a ×2.3 ladder.
// Called by: src/main.ts (the Side job button of the top bar).
// Keep: commands only through the game (workTap, workUp); numbers from content/work.json.

import type { Game } from '../sim/game.ts';
import { button, closeX, createOverlay } from './overlay.ts';
import { iconize } from './kit.ts';

export interface WorkLookups {
  t(key: string, vars?: Record<string, string | number>): string;
  lang(): string;
  /** The bowl of the shop (the scene art, the same as on the «Миска» card). */
  bowl(): string;
}

export interface WorkWindow {
  open(): void;
  render(): void;
}

export function createWorkWindow(parent: HTMLElement, game: Game, look: WorkLookups): WorkWindow {
  const overlay = createOverlay(parent, 'work', () => overlay.hide());
  overlay.card.classList.add('card-work');
  overlay.card.innerHTML =
    '<h2 data-i18n="work.title"></h2><p class="card-sub" data-i18n="work.hint"></p>' +
    `<button type="button" class="work-bowl" data-action="work-tap"><img alt="" src="${look.bowl()}"></button>` +
    '<p class="work-level" data-work-level></p>';
  const up = button('work-up', 'work.up', 'btn-primary');
  // The label carries the price («Прокачать за N»), set on render.
  delete up.dataset.i18n;
  overlay.card.appendChild(up);
  // MU-09: the window closes with its ✕ (no «Done» button).
  closeX(overlay.card, '✕', () => overlay.hide(), 'work-close');
  const bowl = overlay.card.querySelector('[data-action="work-tap"]') as HTMLElement;
  const level = overlay.card.querySelector('[data-work-level]') as HTMLElement;
  bowl.addEventListener('click', () => {
    const n = game.workTap();
    const f = document.createElement('span');
    f.className = 'work-float';
    f.textContent = `+${new Intl.NumberFormat(look.lang()).format(n)}`;
    bowl.appendChild(f);
    window.setTimeout(() => f.remove(), 700);
    bowl.classList.remove('bump');
    void bowl.offsetWidth;
    bowl.classList.add('bump');
  });
  up.addEventListener('click', () => game.workUp());
  const win: WorkWindow = {
    open() {
      win.render();
      overlay.show();
    },
    render() {
      if (!overlay.isOpen() && level.textContent) return;
      const v = game.workView();
      const fmt = new Intl.NumberFormat(look.lang());
      level.textContent = look.t('work.level', { n: v.level, pay: fmt.format(v.pay) });
      up.hidden = v.price === null;
      if (v.price !== null) {
        up.innerHTML = iconize(look.t('work.upFor', { n: `◉ ${fmt.format(v.price)}` }));
        up.setAttribute('aria-disabled', String(game.state.coins + 1e-9 < v.price));
      }
    },
  };
  return win;
}
