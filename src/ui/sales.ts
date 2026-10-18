// What: the «Продажи» tab (docs/01 §3 p. 13; MU-06 by s3-sales-slots, s3-price): the places of the shelf 2 in a row, the pick for a free place, the «Цена» page.
// Called by: src/main.ts (create once into its sheet; render on every commit while the sheet is open).
// Keep: one entity with the shelf of the scene (game.view().creatures on sale); commands only through the game (list, setAsk, unlist); «Выставить на продажу» always over the tab bar.

import type { RarityName } from '../content/schemas.ts';
import type { CreatureView, Game } from '../sim/game.ts';
import { esc, money, rarityBadge, ringPic } from './kit.ts';
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
  /** The mean wait of a buyer at the market price, seconds. */
  baseWaitSec: number;
  /** M4-23: the market's mood chip for a species ('' when none). */
  mood(species: string): string;
  /** Opens the chat about a creature a buyer is writing about (Q-025: it is off the shelf meanwhile). */
  openChat(uid: string): void;
}

export interface SalesTab {
  render(): void;
  /** A pet's «Цена» page, the pick of a free place (#pick) or the places (null). */
  show(uid: string | null): void;
}

/** The «pick a pet for a free place» page. */
const PICK = '#pick';

export function createSalesTab(sheet: Sheet, game: Game, look: SalesLookups): SalesTab {
  const root = document.createElement('div');
  root.className = 'sales';
  sheet.body.appendChild(root);
  // The «Цена» page and the pick are inner pages of the tab: «‹» back to the places.
  const panel = sheet.detail('sale', () => tab.show(null));
  let open: string | null = null;
  let key = '';
  let panelKey = '';
  /** The share chosen on the «Цена» page of a pet not on the shelf yet (it goes on with «Выставить на продажу»). */
  let draft = 1;
  let draftFor = '';
  let slider: ReturnType<typeof createPriceSlider> | null = null;

  const meta = (c: CreatureView, fmt: Intl.NumberFormat, price: number): string =>
    `<span class="mu-meta mu-rar-line">${rarityBadge(c.rarity, look.t(`rarity.${c.rarity}`))}<span>·</span>${money(price, fmt)}</span>`;
  const pic = (c: CreatureView): string => `<span class="mu-pic"><img alt="" src="${look.portrait(c.species, c.rarity)}"></span>`;

  function renderList(): void {
    const view = game.view();
    const fmt = new Intl.NumberFormat(look.lang());
    const next = `l:${look.lang()}:${view.slots}:${view.creatures.map((c) => `${c.uid}.${c.ask}.${c.zone}`).join(',')}:${view.inventory.length}:${view.talking.map((c) => `${c.uid}.${c.ask}`).join(',')}`;
    if (next === key) return;
    key = next;
    const cards: string[] = [];
    // MU-06 (s3-sales-slots): a free place first, then the pets on the shelf, then those a buyer writes about.
    // Q-025: a pet a buyer writes about is off the shelf — its place is free for another one.
    for (let i = view.creatures.length; i < view.slots; i++)
      cards.push(`<button type="button" class="mu-card card-empty" data-action="sale-add"><span class="sale-plus" aria-hidden="true">+</span><span class="mu-meta">${esc(look.t(view.inventory.length ? 'sales.add' : 'sales.free'))}</span></button>`);
    for (const c of view.creatures)
      cards.push(
        `<div class="mu-card rar card-sale" data-rarity="${c.rarity}" data-uid="${c.uid}"><button type="button" class="mu-pic-btn" data-action="sale-${c.uid}">${pic(c)}</button>` +
          `<span class="mu-name">${esc(look.speciesName(c.species))}</span><span class="mu-line">${meta(c, fmt, c.ask)}<span class="mu-meta">${esc(look.t('sales.onShelf'))}</span></span>` +
          `<button type="button" class="mu-btn" data-action="sale-off-${c.uid}">${esc(look.t('sales.off'))}</button></div>`,
      );
    // 07 rule 7: one main button on the screen — the first pet in a chat; the others say «В чат» on a dark button.
    view.talking.forEach((c, i) =>
      cards.push(
        `<div class="mu-card rar card-sale" data-rarity="${c.rarity}" data-uid="${c.uid}"><button type="button" class="mu-pic-btn" data-action="sale-chat-pic-${c.uid}">${pic(c)}</button>` +
          `<span class="mu-name">${esc(look.speciesName(c.species))}</span><span class="mu-line">${meta(c, fmt, c.ask)}<span class="mu-meta">${esc(look.t('sales.talkingSub'))}</span></span>` +
          `<button type="button" class="mu-btn${i === 0 ? ' main' : ''}" data-action="sale-chat-${c.uid}">${esc(look.t('sales.toChat'))}</button></div>`,
      ),
    );
    root.innerHTML =
      `<div class="mu-head"><h3>${esc(look.t('sales.title'))}</h3><span>${esc(look.t('sales.places', { n: view.creatures.length, all: view.slots }))}</span></div>` +
      `<div class="mu-grid">${cards.join('')}</div>`;
    root.querySelectorAll('[data-action="sale-add"]').forEach((b) => b.addEventListener('click', () => tab.show(PICK)));
    for (const c of view.creatures) {
      root.querySelector(`[data-action="sale-${c.uid}"]`)?.addEventListener('click', () => tab.show(c.uid));
      root.querySelector(`[data-action="sale-off-${c.uid}"]`)?.addEventListener('click', () => game.unlist(c.uid));
    }
    for (const c of view.talking) {
      root.querySelector(`[data-action="sale-chat-${c.uid}"]`)?.addEventListener('click', () => look.openChat(c.uid));
      root.querySelector(`[data-action="sale-chat-pic-${c.uid}"]`)?.addEventListener('click', () => look.openChat(c.uid));
    }
  }

  const back = (title: string): string =>
    `<div class="mu-back"><button type="button" class="mu-round" data-action="sale-back" aria-label="${esc(look.t('eggs.back'))}">‹</button><h2>${esc(title)}</h2></div>`;

  /** The pets of the storage to pick from for a free place: a tap opens its «Цена» page. */
  function renderPick(): void {
    const view = game.view();
    const fmt = new Intl.NumberFormat(look.lang());
    const next = `p:${look.lang()}:${view.inventory.map((c) => c.uid).join(',')}:${view.creatures.length}`;
    if (next === panelKey) return;
    panelKey = next;
    panel.card.innerHTML =
      back(look.t('sales.pick')) +
      (view.inventory.length
        ? `<div class="mu-grid">${view.inventory
            .map(
              (c) =>
                `<button type="button" class="mu-card rar card-sale" data-rarity="${c.rarity}" data-action="sale-list-${c.uid}">${pic(c)}<span class="mu-name">${esc(look.speciesName(c.species))}</span>` +
                `<span class="mu-line">${meta(c, fmt, c.price)}<span class="mu-meta">${esc(look.t('card.level', { n: c.level }))}</span></span></button>`,
            )
            .join('')}</div>`
        : `<p class="empty">${esc(look.t('sales.nothing'))}</p>`);
    panel.card.querySelector('[data-action="sale-back"]')?.addEventListener('click', () => tab.show(null));
    for (const c of view.inventory) panel.card.querySelector(`[data-action="sale-list-${c.uid}"]`)?.addEventListener('click', () => tab.show(c.uid));
  }

  /** MU-06 (s3-price): the pet, the big price with its zone chip, the slider of four zones, «Выставить на продажу» at the bottom. */
  function renderCard(uid: string): void {
    const view = game.view();
    const onShelf = view.creatures.find((x) => x.uid === uid);
    const c = onShelf ?? view.inventory.find((x) => x.uid === uid);
    if (!c) {
      tab.show(null);
      return;
    }
    const fmt = new Intl.NumberFormat(look.lang());
    if (!onShelf && draftFor !== uid) {
      draftFor = uid;
      draft = c.askShare;
    }
    const share = onShelf ? c.askShare : draft;
    const next = `c:${uid}:${look.lang()}:${c.price}:${c.level}:${Boolean(onShelf)}:${look.mood(c.species)}`;
    if (next === panelKey) {
      slider?.set(share, c.price);
      return;
    }
    panelKey = next;
    panel.card.innerHTML =
      back(look.t('price.title')) +
      `<div class="price-pet">${ringPic(look.portrait(c.species, c.rarity), c.rarity, 64)}<div class="price-pet-text"><b class="mu-name egg-name">${esc(look.speciesName(c.species))}</b>` +
      `<span>${rarityBadge(c.rarity, look.t(`rarity.${c.rarity}`))}</span>` +
      `<span class="mu-meta">${esc(look.t('card.level', { n: c.level }))} · ${esc(look.t('price.marketWord'))} ${money(c.price, fmt)} ${look.mood(c.species)}</span>${c.hold ? `<span class="mu-meta">${esc(look.t('day.hold', { n: c.hold }))}</span>` : ''}</div></div>` +
      '<div data-slider></div>' +
      `<div class="price-go"><button type="button" class="mu-btn main" data-action="${onShelf ? 'sale-save' : `sale-go-${uid}`}">${esc(look.t(onShelf ? 'sales.save' : 'sales.go'))}</button></div>`;
    panel.card.querySelector('[data-action="sale-back"]')?.addEventListener('click', () => tab.show(onShelf ? null : PICK));
    slider = createPriceSlider(
      panel.card.querySelector('[data-slider]') as HTMLElement,
      look.slider,
      { t: look.t, lang: look.lang, colors: look.zoneColors, baseWaitSec: look.baseWaitSec },
      (s) => {
        if (onShelf) game.setAsk(uid, s);
        else draft = s;
      },
    );
    slider.set(share, c.price);
    panel.card.querySelector('[data-action="sale-save"]')?.addEventListener('click', () => tab.show(null));
    panel.card.querySelector(`[data-action="sale-go-${uid}"]`)?.addEventListener('click', () => {
      game.setAsk(uid, draft);
      if (game.list(uid)) tab.show(null);
    });
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
