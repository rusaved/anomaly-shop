// What: the deal card of the panel (docs/01, section 3.4): who stands at the counter, what they offer for the selected creature.
// Called by: src/main.ts (create once, render on every commit and game change, relabel on a language switch).
// Keep: reads game.deal() only; names come from content through the lookups; the price is never built with innerHTML.

import type { Game } from '../sim/game.ts';

export interface DealLookups {
  t(key: string, vars?: Record<string, string | number>): string;
  customerName(id: string): string;
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
    '<div class="deal-head"><span class="deal-avatar" aria-hidden="true"></span><span class="deal-who" data-deal-who></span><span class="deal-queue" data-deal-queue></span></div><div class="deal-text" data-deal-text></div>';
  parent.appendChild(root);
  const who = root.querySelector('[data-deal-who]') as HTMLElement;
  const queue = root.querySelector('[data-deal-queue]') as HTMLElement;
  const text = root.querySelector('[data-deal-text]') as HTMLElement;
  const avatar = root.querySelector('.deal-avatar') as HTMLElement;
  let last = '';
  return {
    root,
    render() {
      const view = game.view();
      const deal = view.deal;
      const fmt = new Intl.NumberFormat(look.lang());
      const state = !deal ? (view.queue.length ? 'next' : 'idle') : deal.uid ? 'offer' : 'nocreature';
      const key = `${look.lang()}:${state}:${deal?.customer}:${deal?.offer}:${deal?.species}:${view.queue.length}`;
      if (key === last) return;
      last = key;
      root.dataset.deal = state;
      avatar.style.background = deal ? look.customerColor(deal.customer) : '';
      who.textContent = deal ? look.customerName(deal.customer) : '';
      queue.textContent = view.queue.length > 1 ? look.t('deal.queue', { n: view.queue.length }) : '';
      if (state === 'offer' && deal?.species) fill(text, look.t('deal.offer'), fmt.format(deal.offer), look.speciesName(deal.species));
      else text.textContent = look.t(state === 'idle' ? 'deal.idle' : state === 'next' ? 'deal.next' : 'deal.noCreature');
    },
  };
}
