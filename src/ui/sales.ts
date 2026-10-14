// What: the «My sales» tab (docs/01 §3 p. 13, §6; M3-06, M3-07): the sale slots (the shop showcase itself), the price slider, take off and list.
// Called by: src/main.ts (create once into its sheet; render on every commit while the sheet is open).
// Keep: one entity with the showcase on the scene (game.view().creatures on sale); commands only through the game (setAsk, unlist, list).

import type { RarityName } from '../content/schemas.ts';
import type { CreatureView, Game } from '../sim/game.ts';
import { createPriceSlider, type SliderData } from './price-slider.ts';
import type { Sheet } from './sheet.ts';

export interface SalesLookups {
  t(key: string, vars?: Record<string, string | number>): string;
  lang(): string;
  speciesName(id: string): string;
  portrait(species: string, rarity: RarityName): string;
  rarityColor(r: RarityName): string;
  slider: SliderData;
  zoneColors: readonly string[];
}

export interface SalesTab {
  render(): void;
  show(uid: string | null): void;
}

export function createSalesTab(sheet: Sheet, game: Game, look: SalesLookups): SalesTab {
  const root = document.createElement('div');
  root.className = 'sales';
  sheet.body.appendChild(root);
  let open: string | null = null;
  let key = '';
  let slider: ReturnType<typeof createPriceSlider> | null = null;

  const slotCard = (c: CreatureView, fmt: Intl.NumberFormat): HTMLElement => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'card card-sale';
    b.dataset.uid = c.uid;
    b.dataset.action = `sale-${c.uid}`;
    b.innerHTML =
      `<span class="card-pic"><img alt="" src="${look.portrait(c.species, c.rarity)}"><i class="rarity-dash" style="background:${look.rarityColor(c.rarity)}"></i></span>` +
      `<span class="card-name"></span><span class="card-price"><span class="coin coin-sm" aria-hidden="true"></span><b>${fmt.format(c.ask)}</b></span>` +
      `<span class="zone-dot" style="background:${look.zoneColors[c.zone] ?? ''}"></span>`;
    (b.querySelector('.card-name') as HTMLElement).textContent = look.speciesName(c.species);
    b.addEventListener('click', () => tab.show(c.uid));
    return b;
  };

  function renderList(): void {
    const view = game.view();
    const fmt = new Intl.NumberFormat(look.lang());
    const next = `l:${look.lang()}:${view.slots}:${view.creatures.map((c) => `${c.uid}.${c.ask}.${c.zone}`).join(',')}`;
    if (next === key) return;
    key = next;
    slider = null;
    const cards: HTMLElement[] = view.creatures.map((c) => slotCard(c, fmt));
    for (let i = view.creatures.length; i < view.slots; i++) {
      const el = document.createElement('div');
      el.className = 'card card-empty';
      el.innerHTML = `<span class="card-pic"><span class="slot-plus" aria-hidden="true">+</span></span><span class="card-sub">${look.t('sales.free')}</span>`;
      cards.push(el);
    }
    const sum = document.createElement('p');
    sum.className = 'cards-sum';
    sum.textContent = look.t('sales.slots', { n: view.creatures.length, all: view.slots });
    const grid = document.createElement('div');
    grid.className = 'cards';
    grid.append(sum, ...cards);
    root.replaceChildren(grid);
  }

  function renderCard(uid: string): void {
    const c = game.view().creatures.find((x) => x.uid === uid);
    if (!c) {
      open = null;
      key = '';
      renderList();
      return;
    }
    const fmt = new Intl.NumberFormat(look.lang());
    const next = `c:${uid}:${look.lang()}:${c.price}:${c.level}`;
    if (next === key) {
      slider?.set(c.askShare, c.price);
      return;
    }
    key = next;
    root.innerHTML =
      `<button type="button" class="eggs-back" data-action="sale-back">‹ ${look.t('eggs.back')}</button>` +
      `<div class="egg-hero"><img alt="" src="${look.portrait(c.species, c.rarity)}"><div><h3 class="egg-name"></h3>` +
      `<p class="card-sub"><i class="rarity-dot" style="background:${look.rarityColor(c.rarity)}"></i> ${look.t(`rarity.${c.rarity}`)} · ${look.t('card.level', { n: c.level })}</p>` +
      `<p class="card-sub">${look.t('price.marketIs', { n: fmt.format(c.price) })}</p></div></div>` +
      '<div data-slider></div>';
    (root.querySelector('.egg-name') as HTMLElement).textContent = look.speciesName(c.species);
    root.querySelector('[data-action="sale-back"]')?.addEventListener('click', () => tab.show(null));
    slider = createPriceSlider(root.querySelector('[data-slider]') as HTMLElement, look.slider, { t: look.t, lang: look.lang, colors: look.zoneColors }, (share) => game.setAsk(uid, share));
    slider.set(c.askShare, c.price);
  }

  const tab: SalesTab = {
    render() {
      sheet.setTitle(look.t('sales.title'));
      if (open) renderCard(open);
      else renderList();
    },
    show(uid) {
      open = uid;
      key = '';
      tab.render();
    },
  };
  return tab;
}
