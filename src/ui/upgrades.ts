// What: the upgrade shop window (docs/01, section 6; M1-08): the positions of upgrades.json → shop, level, effect, price.
// Called by: src/main.ts (create once; opened from the panel button, rendered on every commit while open).
// Keep: the game runs on behind it (idle genre standard); purchases go through game.buyUpgrade; Back and the backdrop close it.

import type { UpgradeData } from '../content/schemas.ts';
import type { Game } from '../sim/game.ts';
import { button, createOverlay, type Overlay } from './overlay.ts';

export interface UpgradeLookups {
  t(key: string, vars?: Record<string, string | number>): string;
  lang(): string;
  upgrade(id: string): UpgradeData | undefined;
}

export interface UpgradesWindow {
  overlay: Overlay;
  open(): void;
  close(): void;
  render(): void;
}

/** Effect line of an upgrade from its data (the numbers are never typed into texts). */
function effectText(u: UpgradeData, look: UpgradeLookups): string {
  const e = u.effect;
  const pct = (x: number): number => Math.round(Math.abs(x) * 100);
  const key = `upgrade.effect.${e.type}`;
  if (e.type === 'slots' || e.type === 'showcaseSlots' || e.type === 'feedPerTap' || e.type === 'queueSize') return look.t(key, { n: e.perLevel });
  if (e.type === 'hatchTime' || e.type === 'spawnRate' || e.type === 'bargain' || e.type === 'leaveChance' || e.type === 'appraisal') return look.t(key, { n: pct(e.perLevel) });
  return look.t(key);
}

export function createUpgradesWindow(parent: HTMLElement, game: Game, look: UpgradeLookups): UpgradesWindow {
  const overlay = createOverlay(parent, 'upgrades', () => win.close());
  overlay.card.classList.add('card-shop');
  const title = document.createElement('h2');
  title.dataset.i18n = 'upgrades.title';
  const list = document.createElement('div');
  list.className = 'shop-list';
  const back = button('back', 'settings.back');
  overlay.card.append(title, list, back);
  back.addEventListener('click', () => win.close());
  let built = '';

  function build(): void {
    list.replaceChildren();
    for (const item of game.upgradeList()) {
      const u = look.upgrade(item.id);
      if (!u) continue;
      const row = document.createElement('div');
      row.className = 'shop-item';
      row.dataset.upgrade = item.id;
      row.innerHTML =
        `<span class="shop-icon shop-icon-${u.effect.type}" aria-hidden="true"></span>` +
        '<span class="shop-text"><b data-name></b><small data-effect></small><small data-level></small></span>' +
        `<button type="button" class="btn btn-primary btn-buy" data-action="buy-upgrade" data-id="${item.id}"><span class="${u.currency === 'crystals' ? 'gem' : 'coin coin-sm'}" aria-hidden="true"></span><span data-price></span></button>`;
      (row.querySelector('[data-name]') as HTMLElement).textContent = u.name[look.lang() === 'en' ? 'en' : 'ru'];
      (row.querySelector('[data-effect]') as HTMLElement).textContent = effectText(u, look);
      row.querySelector('button')?.addEventListener('click', () => game.buyUpgrade(item.id));
      list.appendChild(row);
    }
  }

  const win: UpgradesWindow = {
    overlay,
    open() {
      if (built !== look.lang()) {
        built = look.lang();
        build();
      }
      overlay.show();
      win.render();
    },
    close() {
      overlay.hide();
    },
    render() {
      if (!overlay.isOpen() && built) return;
      if (built !== look.lang()) {
        built = look.lang();
        build();
      }
      const fmt = new Intl.NumberFormat(look.lang());
      for (const item of game.upgradeList()) {
        const row = list.querySelector(`[data-upgrade="${item.id}"]`);
        if (!row) continue;
        (row.querySelector('[data-level]') as HTMLElement).textContent = look.t('upgrades.level', { n: item.level, max: item.levels });
        const buy = row.querySelector('button') as HTMLButtonElement;
        const price = row.querySelector('[data-price]') as HTMLElement;
        price.textContent = item.maxed ? look.t('upgrades.max') : fmt.format(item.price);
        buy.classList.toggle('is-max', item.maxed);
        buy.setAttribute('aria-disabled', String(!item.affordable));
      }
    },
  };
  return win;
}
