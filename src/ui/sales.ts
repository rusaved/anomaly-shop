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
  /** M4-23: the market's mood chip for a species ('' when none). */
  mood(species: string): string;
  /** Opens the chat about a creature a buyer is writing about (Q-025: it is off the shelf meanwhile). */
  openChat(uid: string): void;
}

export interface SalesTab {
  render(): void;
  show(uid: string | null): void;
}

/** The «pick a creature for a free slot» view. */
const PICK = '#pick';

export function createSalesTab(sheet: Sheet, game: Game, look: SalesLookups): SalesTab {
  const root = document.createElement('div');
  root.className = 'sales';
  sheet.body.appendChild(root);
  // M4-00: a creature's card (the price slider) and the pick for a free place are inner pages of the tab — «Back» to the slots.
  const panel = sheet.detail('sale', () => tab.show(null));
  let open: string | null = null;
  let key = '';
  let panelKey = '';
  let slider: ReturnType<typeof createPriceSlider> | null = null;

  const slotCard = (c: CreatureView, fmt: Intl.NumberFormat): HTMLElement => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tile card-sale';
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
    const next = `l:${look.lang()}:${view.slots}:${view.creatures.map((c) => `${c.uid}.${c.ask}.${c.zone}`).join(',')}:${view.inventory.length}:${view.talking.map((c) => c.uid).join(',')}`;
    if (next === key) return;
    key = next;
    const cards: HTMLElement[] = view.creatures.map((c) => slotCard(c, fmt));
    for (let i = view.creatures.length; i < view.slots; i++) {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'tile card-empty';
      el.dataset.action = 'sale-add';
      el.innerHTML = `<span class="card-pic"><span class="slot-plus" aria-hidden="true">+</span></span><span class="card-sub">${look.t(view.inventory.length ? 'sales.add' : 'sales.free')}</span>`;
      el.addEventListener('click', () => tab.show(PICK));
      cards.push(el);
    }
    const sum = document.createElement('p');
    sum.className = 'cards-sum';
    sum.textContent = look.t('sales.slots', { n: view.creatures.length, all: view.slots });
    const grid = document.createElement('div');
    grid.className = 'cards';
    grid.append(sum, ...cards);
    root.replaceChildren(grid);
    if (!view.talking.length) return;
    // Q-025: a buyer is writing about these — they wait in «Chats», not on the shelf.
    const talk = document.createElement('div');
    talk.className = 'cards';
    const head = document.createElement('p');
    head.className = 'cards-sum';
    head.textContent = look.t('sales.talking');
    talk.appendChild(head);
    for (const c of view.talking) {
      const card = slotCard(c, fmt).cloneNode(true) as HTMLElement;
      card.dataset.action = `sale-chat-${c.uid}`;
      (card.querySelector('.card-price') as HTMLElement).textContent = look.t('sales.talkingSub');
      card.addEventListener('click', () => look.openChat(c.uid));
      talk.appendChild(card);
    }
    root.appendChild(talk);
  }

  /** The inventory to pick from for a free slot. */
  function renderPick(): void {
    const view = game.view();
    const fmt = new Intl.NumberFormat(look.lang());
    const next = `p:${look.lang()}:${view.inventory.map((c) => c.uid).join(',')}:${view.creatures.length}`;
    if (next === panelKey) return;
    panelKey = next;
    const root = panel.card;
    root.innerHTML = `<button type="button" class="eggs-back" data-action="sale-back">‹ ${look.t('eggs.back')}</button><h3 class="eggs-title">${look.t('sales.pick')}</h3>`;
    root.querySelector('[data-action="sale-back"]')?.addEventListener('click', () => tab.show(null));
    const grid = document.createElement('div');
    grid.className = 'cards';
    if (!view.inventory.length) grid.innerHTML = `<p class="empty">${look.t('sales.nothing')}</p>`;
    for (const c of view.inventory) {
      // A copy of the slot card without its «open» handler: a tap here lists the creature.
      const fresh = slotCard(c, fmt).cloneNode(true) as HTMLElement;
      fresh.dataset.action = `sale-list-${c.uid}`;
      fresh.addEventListener('click', () => {
        // UB-10: listed — its card with the price slider opens at once (one path: place → price → chats).
        if (game.list(c.uid)) tab.show(c.uid);
      });
      grid.appendChild(fresh);
    }
    root.appendChild(grid);
  }

  function renderCard(uid: string): void {
    const c = game.view().creatures.find((x) => x.uid === uid);
    if (!c) {
      tab.show(null);
      return;
    }
    const fmt = new Intl.NumberFormat(look.lang());
    const next = `c:${uid}:${look.lang()}:${c.price}:${c.level}:${look.mood(c.species)}`;
    if (next === panelKey) {
      slider?.set(c.askShare, c.price);
      return;
    }
    panelKey = next;
    const root = panel.card;
    root.innerHTML =
      `<button type="button" class="eggs-back" data-action="sale-back">‹ ${look.t('eggs.back')}</button>` +
      `<div class="egg-hero"><img alt="" src="${look.portrait(c.species, c.rarity)}"><div><h3 class="egg-name"></h3>` +
      `<p class="card-sub"><i class="rarity-dot" style="background:${look.rarityColor(c.rarity)}"></i> ${look.t(`rarity.${c.rarity}`)}${c.mark ? ` · ${look.t(`mark.${c.mark}`)}` : ''} · ${look.t('card.level', { n: c.level })}</p>` +
      `<p class="card-sub">${look.t('price.marketIs', { n: fmt.format(c.price) })} ${look.mood(c.species)}</p>${c.hold ? `<p class="card-sub">${look.t('day.hold', { n: c.hold })}</p>` : ''}</div></div>` +
      '<div data-slider></div>' +
      `<div class="egg-buy"><button type="button" class="btn btn-alt" data-action="sale-off">${look.t('sales.off')}</button></div>`;
    root.querySelector('[data-action="sale-off"]')?.addEventListener('click', () => {
      game.unlist(uid);
      tab.show(null);
    });
    (root.querySelector('.egg-name') as HTMLElement).textContent = look.speciesName(c.species);
    root.querySelector('[data-action="sale-back"]')?.addEventListener('click', () => tab.show(null));
    slider = createPriceSlider(root.querySelector('[data-slider]') as HTMLElement, look.slider, { t: look.t, lang: look.lang, colors: look.zoneColors }, (share) => game.setAsk(uid, share));
    slider.set(c.askShare, c.price);
  }

  const tab: SalesTab = {
    render() {
      sheet.setTitle(look.t('sales.title'));
      renderList();
      if (!panel.isOpen()) return;
      if (open === PICK) renderPick();
      else if (open) renderCard(open);
    },
    show(uid) {
      open = uid;
      panelKey = '';
      slider = null;
      if (uid) panel.show();
      else panel.hide();
      tab.render();
    },
  };
  return tab;
}
