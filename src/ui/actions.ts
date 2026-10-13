// What: the action row of the panel: buy an egg (price on the button) and open the upgrade shop (dot when one is affordable).
// Called by: src/main.ts (create once, render on every commit and game change).
// Keep: commands only; unaffordable stays tappable (aria-disabled) to explain why; basic egg = buy-egg, later eggs = buy-<id>.

import type { Game } from '../sim/game.ts';

export interface ActionLookups {
  t(key: string): string;
  /** Shell color of an egg for its icon. */
  eggColor(id: string): string;
}

export interface Actions {
  root: HTMLElement;
  render(): void;
  setLanguage(lang: string): void;
}

export function createActions(parent: HTMLElement, game: Game, lang: string, look: ActionLookups, openUpgrades: () => void): Actions {
  const root = document.createElement('div');
  root.className = 'actions';
  const eggsBox = document.createElement('div');
  eggsBox.className = 'actions-eggs';
  root.appendChild(eggsBox);
  root.insertAdjacentHTML(
    'beforeend',
    '<button type="button" class="btn btn-upgrades" data-action="upgrades"><span class="up-icon" aria-hidden="true"></span><span data-i18n="upgrades.open"></span><span class="dot" data-dot hidden></span></button>',
  );
  parent.appendChild(root);
  const upgrades = root.querySelector('[data-action="upgrades"]') as HTMLButtonElement;
  const dot = root.querySelector('[data-dot]') as HTMLElement;
  upgrades.addEventListener('click', openUpgrades);
  let format = new Intl.NumberFormat(lang);
  let eggKey = '';
  const buttons = new Map<string, HTMLButtonElement>();

  function buildEggs(ids: string[]): void {
    eggsBox.replaceChildren();
    buttons.clear();
    ids.forEach((id, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn btn-primary btn-egg';
      b.dataset.action = i === 0 ? 'buy-egg' : `buy-${id}`;
      b.innerHTML =
        '<span class="egg-icon" aria-hidden="true"></span><span class="btn-two"><span class="btn-row"><span data-label></span><span class="price"><span class="coin coin-sm" aria-hidden="true"></span><span data-price></span></span></span><small data-why hidden></small></span><span class="dot" data-dot hidden></span>';
      (b.querySelector('.egg-icon') as HTMLElement).style.background = look.eggColor(id);
      b.addEventListener('click', () => game.buyEgg(id));
      eggsBox.appendChild(b);
      buttons.set(id, b);
    });
    eggKey = '';
  }

  const actions: Actions = {
    root,
    render() {
      const list = game.eggList();
      const ids = list.map((e) => e.id).join(',');
      if (ids !== eggKey.split('|')[0]) buildEggs(list.map((e) => e.id));
      eggKey = `${ids}|`;
      list.forEach((e, i) => {
        const b = buttons.get(e.id);
        if (!b) return;
        const label = look.t(i === 0 ? 'action.buyEgg' : `egg.short.${e.id}`);
        (b.querySelector('[data-label]') as HTMLElement).textContent = label;
        b.title = label;
        (b.querySelector('[data-price]') as HTMLElement).textContent = format.format(e.check.price);
        b.setAttribute('aria-disabled', String(!e.check.ok));
        b.dataset.reason = e.check.ok ? '' : e.check.reason;
        (b.querySelector('[data-dot]') as HTMLElement).hidden = !e.fresh;
        // A grey egg says why (full showcase, busy incubator); «not enough coins» is plain from the price.
        const why = b.querySelector('[data-why]') as HTMLElement;
        const reason = !e.check.ok && (e.check.reason === 'full' || e.check.reason === 'busy') ? e.check.reason : '';
        why.hidden = !reason;
        why.textContent = reason ? look.t(`reason.${reason}`) : '';
      });
      root.dataset.eggs = String(list.length);
      dot.hidden = !game.upgradeList().some((u) => u.affordable);
    },
    setLanguage(next) {
      format = new Intl.NumberFormat(next);
      actions.render();
    },
  };
  return actions;
}
