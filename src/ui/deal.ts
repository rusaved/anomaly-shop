// What: the deal card of the panel (docs/01, section 3.4; Q-004): who is at the counter, the offer, and Sell / Haggle / Wait.
// Called by: src/main.ts (create once, render on every commit and game change, relabel on a language switch).
// Keep: buttons call game.accept / haggle / wait only; names come from content; the price is never built with innerHTML.

import type { Game } from '../sim/game.ts';

export interface DealLookups {
  t(key: string, vars?: Record<string, string | number>): string;
  /** «Марфа · Бережливая»: the person's name and the type (person −1: the type alone). */
  customerName(id: string, person: number): string;
  customerColor(id: string): string;
  speciesName(id: string): string;
  lang(): string;
}

export interface DealCard {
  root: HTMLElement;
  render(): void;
}

/** Puts a translated template into el, with {price} as a coin chip and {name} as bold text. */
function fill(el: HTMLElement, template: string, price: string, name: string): void {
  el.replaceChildren();
  for (const part of template.split(/(\{price\}|\{name\})/)) {
    if (part === '{price}') {
      const chip = document.createElement('b');
      chip.className = 'price';
      chip.innerHTML = '<span class="coin coin-sm" aria-hidden="true"></span>';
      chip.append(price);
      el.append(chip);
    } else if (part === '{name}') {
      const b = document.createElement('b');
      b.textContent = name;
      el.append(b);
    } else if (part) el.append(part);
  }
}

export function createDealCard(parent: HTMLElement, game: Game, look: DealLookups): DealCard {
  const root = document.createElement('div');
  root.className = 'deal';
  root.dataset.deal = 'idle';
  root.innerHTML =
    '<div class="deal-head"><span class="deal-avatar" aria-hidden="true"></span><span class="deal-who" data-deal-who></span><span class="deal-share" data-deal-share></span><span class="deal-queue" data-deal-queue></span></div><div class="deal-text" data-deal-text></div>' +
    '<div class="deal-actions">' +
    '<button type="button" class="btn btn-primary btn-sell" data-action="sell"><span class="btn-two"><span class="sell-label" data-i18n="deal.sell"></span><span class="price"><span class="coin coin-sm" aria-hidden="true"></span><span data-sell-price></span></span></span></button>' +
    '<button type="button" class="btn btn-haggle" data-action="haggle"><span class="btn-two"><span data-i18n="deal.haggle"></span><small data-haggle-hint></small></span></button>' +
    '<button type="button" class="btn btn-wait" data-action="wait"><span data-i18n="deal.wait"></span></button>' +
    '</div>';
  parent.appendChild(root);
  const who = root.querySelector('[data-deal-who]') as HTMLElement;
  const queue = root.querySelector('[data-deal-queue]') as HTMLElement;
  const share = root.querySelector('[data-deal-share]') as HTMLElement;
  const text = root.querySelector('[data-deal-text]') as HTMLElement;
  const avatar = root.querySelector('.deal-avatar') as HTMLElement;
  const sell = root.querySelector('[data-action="sell"]') as HTMLButtonElement;
  const haggle = root.querySelector('[data-action="haggle"]') as HTMLButtonElement;
  const wait = root.querySelector('[data-action="wait"]') as HTMLButtonElement;
  const sellPrice = root.querySelector('[data-sell-price]') as HTMLElement;
  const hint = root.querySelector('[data-haggle-hint]') as HTMLElement;
  sell.addEventListener('click', () => game.accept());
  haggle.addEventListener('click', () => game.haggle());
  wait.addEventListener('click', () => game.wait());
  let last = '';
  return {
    root,
    render() {
      const view = game.view();
      const deal = view.deal;
      const fmt = new Intl.NumberFormat(look.lang());
      const state = !deal ? (view.queue.length ? 'next' : 'idle') : deal.uid ? 'offer' : 'nocreature';
      const key = `${look.lang()}:${state}:${deal?.id}:${deal?.offer}:${deal?.species}:${deal?.canHaggle}:${view.queue.length}:${deal?.person}`;
      if (key === last) return;
      const bump = deal !== null && last !== '' && last.split(':')[3] === String(deal.id) && Number(last.split(':')[4]) < deal.offer;
      last = key;
      const offer = state === 'offer';
      sell.setAttribute('aria-disabled', String(!offer));
      haggle.setAttribute('aria-disabled', String(!offer || !deal?.canHaggle));
      wait.setAttribute('aria-disabled', String(!deal));
      sellPrice.textContent = offer && deal ? fmt.format(deal.offer) : '—';
      hint.textContent = deal && !deal.canHaggle ? look.t('deal.lastPrice') : look.t('deal.risk', { n: Math.round((deal?.leaveChance ?? 0) * 100) });
      hint.hidden = !deal;
      if (bump) {
        root.classList.remove('bump');
        void root.offsetWidth;
        root.classList.add('bump');
      }
      root.dataset.deal = state;
      const front = deal ? view.queue.find((q) => q.id === deal.id) : undefined;
      avatar.style.background = deal ? front?.outfit || look.customerColor(deal.customer) : '';
      who.textContent = deal ? look.customerName(deal.customer, deal.person) : '';
      // The share explains why the offer is below the price tag (thrifty pays 70–85%).
      share.textContent = deal?.uid ? look.t('deal.share', { n: Math.round(deal.share * 100) }) : '';
      queue.textContent = view.queue.length > 1 ? look.t('deal.queue', { n: view.queue.length }) : '';
      if (state === 'offer' && deal?.species) fill(text, look.t('deal.offer'), fmt.format(deal.offer), look.speciesName(deal.species));
      else text.textContent = look.t(state === 'idle' ? 'deal.idle' : state === 'next' ? 'deal.next' : 'deal.noCreature');
    },
  };
}
