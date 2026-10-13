// What: the action row of the panel: buy an egg (price on the button); refused taps explain why with a toast.
// Called by: src/main.ts (create once, render on every commit and game change).
// Keep: the button calls game commands only; it stays tappable when unaffordable (aria-disabled), so the player learns why.

import type { Game } from '../sim/game.ts';

export interface Actions {
  root: HTMLElement;
  render(): void;
  setLanguage(lang: string): void;
}

export function createActions(parent: HTMLElement, game: Game, lang: string): Actions {
  const root = document.createElement('div');
  root.className = 'actions';
  root.innerHTML =
    '<button type="button" class="btn btn-primary btn-egg" data-action="buy-egg"><span class="egg-icon" aria-hidden="true"></span><span data-i18n="action.buyEgg"></span><span class="price"><span class="coin coin-sm" aria-hidden="true"></span><span data-price></span></span></button>';
  parent.appendChild(root);
  const buy = root.querySelector('[data-action="buy-egg"]') as HTMLButtonElement;
  const price = root.querySelector('[data-price]') as HTMLElement;
  let format = new Intl.NumberFormat(lang);
  buy.addEventListener('click', () => game.buyEgg());
  const actions: Actions = {
    root,
    render() {
      const check = game.canBuyEgg();
      price.textContent = format.format(check.price);
      buy.setAttribute('aria-disabled', String(!check.ok));
      buy.dataset.reason = check.ok ? '' : check.reason;
    },
    setLanguage(next) {
      format = new Intl.NumberFormat(next);
      actions.render();
    },
  };
  return actions;
}
