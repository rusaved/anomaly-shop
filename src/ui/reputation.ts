// What: the shop's reputation (UB-08): the seller level chip in the top bar with its ring, the panel of what each level opens, the level-up flash.
// Called by: src/main.ts (create once; render on every commit; up() on a repUp event).
// Keep: the level comes from game.reputation(); what opens is read from the unlocks of content (eggs, upgrades, districts, future) — never typed in.

import type { ReputationData, UnlockData } from '../content/schemas.ts';
import type { Game } from '../sim/game.ts';
import { createOverlay, type Overlay } from './overlay.ts';

export interface ReputationLookups {
  t(key: string, vars?: Record<string, string | number>): string;
  lang(): 'ru' | 'en';
  data: ReputationData;
  /** Everything that opens by a level: its name and unlock (eggs of the ladder, shop positions, districts). */
  openers(): Array<{ name: string; unlock: UnlockData | undefined }>;
  /** M4-06: opens the window of the move to a new city. */
  openCity(): void;
}

export interface Reputation {
  chip: HTMLElement;
  panel: Overlay;
  render(): void;
  /** The level went up: the chip flashes; returns the names of what opened. */
  up(level: number): string[];
}

/** How many next levels the panel lists. */
const AHEAD = 4;

export function createReputation(hudBalance: HTMLElement, parent: HTMLElement, game: Game, look: ReputationLookups): Reputation {
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = 'hud-level';
  chip.dataset.hud = 'level';
  chip.dataset.action = 'reputation';
  chip.innerHTML = '<span class="hud-level-ring" aria-hidden="true"></span><span class="hud-level-star" aria-hidden="true">★</span><b data-level></b>';
  hudBalance.prepend(chip);
  const number = chip.querySelector('[data-level]') as HTMLElement;
  // UB-02: a detail — a panel from the right.
  const panel = createOverlay(parent, 'reputation', () => panel.hide(), { kind: 'panel' });
  panel.card.classList.add('card-detail', 'card-rep');
  chip.addEventListener('click', (e) => {
    // The chip sits in the balance group (which opens the shop): this tap is the reputation's own.
    e.stopPropagation();
    panel.show();
    key = '';
    win.render();
  });
  let key = '';

  const titleOf = (level: number): string => {
    let name = look.data.titles[0]?.name[look.lang()] ?? '';
    for (const t of look.data.titles) if (t.from <= level) name = t.name[look.lang()];
    return name;
  };
  const opensAt = (level: number): string[] => [
    ...look
      .openers()
      .filter((o) => o.unlock?.type === 'level' && o.unlock.n === level)
      .map((o) => o.name),
    ...look.data.future.filter((f) => f.level === level).map((f) => `${f.name[look.lang()]} (${look.t('rep.soon')})`),
  ];

  const win: Reputation = {
    chip,
    panel,
    render() {
      const r = game.reputation();
      const share = r.next === null ? 1 : (r.xp - r.base) / Math.max(1, r.next - r.base);
      chip.style.setProperty('--p', `${Math.round(Math.min(1, Math.max(0, share)) * 360)}deg`);
      const label = look.t('rep.chip', { n: r.level });
      if (chip.getAttribute('aria-label') !== label) chip.setAttribute('aria-label', label);
      if (number.textContent !== String(r.level)) number.textContent = String(r.level);
      if (!panel.isOpen()) return;
      const city = game.rebirthView();
      const next = `${look.lang()}:${r.level}:${Math.floor(r.xp)}:${city.city}:${city.ready}`;
      if (next === key) return;
      key = next;
      const fmt = new Intl.NumberFormat(look.lang());
      const rows: string[] = [];
      for (let l = r.level + 1; l <= Math.min(look.data.levels.length, r.level + AHEAD); l++) {
        const what = opensAt(l);
        rows.push(`<li class="rep-row" data-rep-level="${l}"><b>${look.t('rep.level', { n: l })}</b><span>${what.length ? what.map((w) => w.replace(/</g, '')).join(' · ') : look.t('rep.nothing')}</span></li>`);
      }
      panel.card.innerHTML =
        `<button type="button" class="eggs-back" data-action="rep-back">‹ ${look.t('eggs.back')}</button>` +
        `<div class="rep-head"><span class="hud-level rep-big" style="--p:${chip.style.getPropertyValue('--p')}"><span class="hud-level-ring" aria-hidden="true"></span><span class="hud-level-star" aria-hidden="true">★</span><b>${r.level}</b></span>` +
        `<div><h2 class="rep-title"></h2><p class="card-sub rep-name"></p></div></div>` +
        `<div class="rep-bar" aria-hidden="true"><i style="width:${Math.round(share * 100)}%"></i></div>` +
        `<p class="card-sub">${r.next === null ? look.t('rep.top') : look.t('rep.points', { n: fmt.format(Math.floor(r.xp)), m: fmt.format(r.next) })}</p>` +
        `<p class="card-sub">${look.t('rep.how')}</p>` +
        // M4-06: the city of the shop and the way to the next one.
        `<div class="rep-city"><span class="card-sub">${look.t('rebirth.city', { n: city.city, x: new Intl.NumberFormat(look.lang(), { maximumFractionDigits: 2 }).format(city.mult) })}</span>` +
        `<button type="button" class="btn ${city.ready ? 'btn-primary' : 'btn-alt'}" data-action="rep-city">${look.t('rebirth.open')}</button></div>` +
        (rows.length ? `<h3 class="eggs-title">${look.t('rep.opens')}</h3><ul class="rep-list">${rows.join('')}</ul>` : '');
      (panel.card.querySelector('.rep-title') as HTMLElement).textContent = look.t('rep.title', { n: r.level });
      (panel.card.querySelector('.rep-name') as HTMLElement).textContent = titleOf(r.level);
      panel.card.querySelector('[data-action="rep-back"]')?.addEventListener('click', () => panel.hide());
      panel.card.querySelector('[data-action="rep-city"]')?.addEventListener('click', () => look.openCity());
    },
    up(level) {
      chip.classList.remove('rep-up');
      void chip.offsetWidth;
      chip.classList.add('rep-up');
      key = '';
      win.render();
      return opensAt(level);
    },
  };
  return win;
}
