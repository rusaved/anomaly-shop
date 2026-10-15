// What: the Inventory tab (docs/01 §6; M3-03, M4-01): «Inventory» — the creatures the shop has, «Collection» — rows by rarity, statuses, row bonus.
// Called by: src/main.ts (create once into its sheet; render on every commit while the sheet is open).
// Keep: reads the game view and the save only; the rarity shows as a colored dash under the picture (M3-17 color discipline), text stays plain.

import type { RarityName } from '../content/schemas.ts';
import type { Game } from '../sim/game.ts';
import type { Sheet } from './sheet.ts';

export interface InventoryLookups {
  t(key: string, vars?: Record<string, string | number>): string;
  lang(): string;
  speciesName(id: string): string;
  portrait(species: string, rarity: RarityName): string;
  rarityColor(r: RarityName): string;
  /** Taps a creature in the shop (selects it for the customer at the counter). */
  pick(uid: string): void;
  /** UB-10: list a creature for sale — its price slider opens. */
  list(uid: string): void;
  /** M4-23: the market's mood chip for a species ('' when none). */
  mood(species: string): string;
}

export interface InventoryTab {
  render(): void;
}

export function createInventoryTab(sheet: Sheet, game: Game, look: InventoryLookups): InventoryTab {
  let mode: 'items' | 'collection' = 'items';
  sheet.head.innerHTML =
    '<div class="subtabs" role="tablist"><button type="button" class="subtab" data-sub="items" data-i18n="inventory.items"></button>' +
    '<button type="button" class="subtab" data-sub="collection" data-i18n="inventory.collection"></button></div>';
  const list = document.createElement('div');
  list.className = 'cards';
  sheet.body.appendChild(list);
  sheet.head.querySelectorAll<HTMLElement>('[data-sub]').forEach((b) =>
    b.addEventListener('click', () => {
      mode = b.dataset.sub === 'collection' ? 'collection' : 'items';
      key = '';
      tab.render();
    }),
  );
  let key = '';
  const tab: InventoryTab = {
    render() {
      sheet.setTitle(look.t('nav.inventory'));
      sheet.head.querySelectorAll<HTMLElement>('[data-sub]').forEach((b) => b.classList.toggle('active', b.dataset.sub === mode));
      const fmt = new Intl.NumberFormat(look.lang());
      if (mode === 'items') {
        const view = game.view();
        // On sale counts the ones a buyer is writing about too (Q-025: off the shelf, still being sold).
        const all = [...view.creatures.map((c) => ({ c, on: true })), ...view.talking.map((c) => ({ c, on: true })), ...view.inventory.map((c) => ({ c, on: false }))];
        const next = `i:${look.lang()}:${all.map(({ c, on }) => `${c.uid}.${c.level}.${c.price}.${on}`).join(',')}:${JSON.stringify(game.mood())}`;
        if (next === key) return;
        key = next;
        if (!all.length) {
          list.innerHTML = `<p class="empty" data-empty>${look.t('inventory.empty')}</p>`;
          return;
        }
        list.replaceChildren(
          ...all.map(({ c, on }) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'tile';
            b.dataset.uid = c.uid;
            b.innerHTML =
              `<span class="card-pic"><img alt="" src="${look.portrait(c.species, c.rarity)}"><i class="rarity-dash" style="background:${look.rarityColor(c.rarity)}"></i></span>` +
              `<span class="card-name"></span><span class="card-sub"></span><span class="card-price"><span class="coin coin-sm" aria-hidden="true"></span><b></b></span>`;
            (b.querySelector('.card-name') as HTMLElement).textContent = look.speciesName(c.species);
            (b.querySelector('.card-sub') as HTMLElement).textContent = `${look.t(`rarity.${c.rarity}`)} · ${look.t('card.level', { n: c.level })}`;
            (b.querySelector('.card-price b') as HTMLElement).textContent = fmt.format(c.price);
            b.querySelector('.card-price')?.insertAdjacentHTML('afterend', look.mood(c.species));
            const chip = document.createElement('span');
            chip.className = on ? 'card-sub chip-on' : 'card-sub';
            chip.dataset.action = on ? '' : `inv-list-${c.uid}`;
            chip.textContent = look.t(on ? 'inventory.onSale' : 'inventory.list');
            b.appendChild(chip);
            b.dataset.on = String(on);
            b.addEventListener('click', () => (on ? look.pick(c.uid) : look.list(c.uid)));
            return b;
          }),
        );
        return;
      }
      // M4-01: the collection by rarity — «Collected N/M», a row per rarity with its bonus, every species with its status.
      const view = game.collection();
      const next = `c:${look.lang()}:${view.rows.map((r) => `${r.done}.${r.species.map((x) => x.status[0]).join('')}`).join(',')}`;
      if (next === key) return;
      key = next;
      const pct = (x: number): number => Math.round(x * 100);
      const sum = document.createElement('p');
      sum.className = 'cards-sum';
      sum.dataset.collected = `${view.have}/${view.all}`;
      sum.textContent = look.t('inventory.found', { n: view.have, all: view.all });
      const rows = view.rows.map((row) => {
        const box = document.createElement('section');
        box.className = `col-row${row.done ? ' done' : ''}`;
        box.dataset.row = row.rarity;
        box.innerHTML =
          `<h3 class="eggs-title col-head"><i class="rarity-dot" style="background:${look.rarityColor(row.rarity)}"></i><span data-row-name></span><b>${row.have}/${row.all}</b></h3>` +
          `<p class="card-sub col-bonus" data-row-bonus></p><div class="cards"></div>`;
        (box.querySelector('[data-row-name]') as HTMLElement).textContent = look.t(`collection.row.${row.rarity}`);
        (box.querySelector('[data-row-bonus]') as HTMLElement).textContent = row.done
          ? look.t('collection.rowDone', { p: pct(row.bonus) })
          : look.t('collection.rowGoal', { p: pct(row.bonus), c: row.crystals });
        (box.querySelector('.cards') as HTMLElement).replaceChildren(
          ...row.species.map((x) => {
            const el = document.createElement('div');
            el.className = `tile card-col${x.status === 'none' ? ' unknown' : ''}`;
            el.dataset.species = x.id;
            el.dataset.status = x.status;
            el.innerHTML = `<span class="card-pic"><img alt="" src="${look.portrait(x.id, row.rarity)}"><i class="rarity-dash" style="background:${look.rarityColor(row.rarity)}"></i></span><span class="card-name"></span><span class="card-sub"></span>`;
            (el.querySelector('.card-name') as HTMLElement).textContent = x.status === 'none' ? '?' : look.speciesName(x.id);
            (el.querySelector('.card-sub') as HTMLElement).textContent = look.t(`collection.status.${x.status}`);
            return el;
          }),
        );
        return box;
      });
      list.replaceChildren(sum, ...rows);
    },
  };
  return tab;
}
