// What: the Eggs tab (docs/01 §3 p. 12, §6): every egg on sale as a card with its picture, name and price button.
// Called by: src/main.ts (create once into its sheet; render on every commit while the sheet is open).
// Keep: commands only through game.buyEgg; an egg the player cannot buy yet stays tappable (aria-disabled) and says why.

import type { Game } from '../sim/game.ts';
import type { Sheet } from './sheet.ts';

export interface EggsLookups {
  t(key: string, vars?: Record<string, string | number>): string;
  lang(): string;
  eggName(id: string): string;
  eggPicture(id: string): string;
}

export interface EggsTab {
  render(): void;
}

export function createEggsTab(sheet: Sheet, game: Game, look: EggsLookups): EggsTab {
  const list = document.createElement('div');
  list.className = 'cards cards-eggs';
  sheet.body.appendChild(list);
  let key = '';
  return {
    render() {
      sheet.setTitle(look.t('eggs.title'));
      const eggs = game.eggList();
      const fmt = new Intl.NumberFormat(look.lang());
      const next = `${look.lang()}:${eggs.map((e) => `${e.id}.${e.check.ok}.${e.check.price}.${e.fresh}`).join(',')}`;
      if (next === key) return;
      key = next;
      list.replaceChildren(
        ...eggs.map((e) => {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'card card-egg';
          b.dataset.egg = e.id;
          b.dataset.action = `egg-buy-${e.id}`;
          b.setAttribute('aria-disabled', String(!e.check.ok));
          b.innerHTML =
            `<span class="card-pic"><img alt="" src="${look.eggPicture(e.id)}"></span><span class="card-name"></span>` +
            '<span class="card-price btn-price"><span class="coin coin-sm" aria-hidden="true"></span><b></b></span>';
          (b.querySelector('.card-name') as HTMLElement).textContent = look.eggName(e.id);
          (b.querySelector('.card-price b') as HTMLElement).textContent = fmt.format(e.check.price);
          b.addEventListener('click', () => game.buyEgg(e.id));
          return b;
        }),
      );
    },
  };
}
