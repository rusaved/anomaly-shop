// What: the traveling merchant's cart (docs/01b, section 3; M2-15): the best open egg at half price or the mystery egg, one buy per visit.
// Called by: src/main.ts (opened on merchantOpen, closed when the event ends or after a buy).
// Keep: offers and checks come from game.merchantOffer(); buying goes through game.merchantBuy; «Not now» loses nothing.

import type { Game } from '../sim/game.ts';
import { button, createOverlay, type Overlay } from './overlay.ts';

export interface MerchantLookups {
  t(key: string, vars?: Record<string, string | number>): string;
  lang(): string;
  eggName(id: string): string;
  eggColor(id: string): string;
}

export interface MerchantWindow {
  overlay: Overlay;
  open(): void;
  close(): void;
  render(): void;
}

export function createMerchantWindow(parent: HTMLElement, game: Game, look: MerchantLookups): MerchantWindow {
  const overlay = createOverlay(parent, 'merchant', () => win.close());
  overlay.card.classList.add('card-shop');
  const title = document.createElement('h2');
  const list = document.createElement('div');
  list.className = 'shop-list';
  const back = button('merchant-close', 'merchant.close');
  overlay.card.append(title, list, back);
  back.addEventListener('click', () => win.close());
  const rows = (['discount', 'mystery'] as const).map((choice) => {
    const row = document.createElement('div');
    row.className = 'shop-item';
    row.dataset.offer = choice;
    row.innerHTML =
      '<span class="shop-icon egg-big" aria-hidden="true"></span><span class="shop-text"><b data-name></b><small data-note></small></span>' +
      `<button type="button" class="btn btn-primary btn-buy" data-action="merchant-${choice}"><span class="coin coin-sm" aria-hidden="true"></span><span data-price></span></button>`;
    row.querySelector('button')?.addEventListener('click', () => {
      if (game.merchantBuy(choice)) win.close();
    });
    list.appendChild(row);
    return { choice, row };
  });

  const win: MerchantWindow = {
    overlay,
    open() {
      if (!game.merchantOffer()) return;
      overlay.show();
      win.render();
    },
    close() {
      overlay.hide();
    },
    render() {
      if (!overlay.isOpen()) return;
      const offer = game.merchantOffer();
      if (!offer) {
        win.close();
        return;
      }
      title.textContent = look.t('merchant.title');
      back.textContent = look.t('merchant.close');
      const fmt = new Intl.NumberFormat(look.lang());
      for (const { choice, row } of rows) {
        const o = offer[choice];
        (row.querySelector('[data-name]') as HTMLElement).textContent = choice === 'discount' ? look.t('merchant.discount', { name: look.eggName(o.egg) }) : look.t('merchant.mystery');
        (row.querySelector('[data-note]') as HTMLElement).textContent = choice === 'mystery' ? look.t('merchant.mysteryNote') : '';
        (row.querySelector('.shop-icon') as HTMLElement).style.background = look.eggColor(o.egg);
        (row.querySelector('[data-price]') as HTMLElement).textContent = fmt.format(o.price);
        (row.querySelector('button') as HTMLButtonElement).setAttribute('aria-disabled', String(!o.check.ok));
      }
    },
  };
  return win;
}
