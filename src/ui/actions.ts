// What: the action rows of the panel: quick egg buttons (the basic one and the last other egg bought; the rest live in the Eggs tab, M3-03) and the «Next» card row.
// Called by: src/main.ts (create once, render on every commit and game change).
// Keep: commands only; unaffordable stays tappable (aria-disabled) to explain why; basic egg = buy-egg, later eggs = buy-<id>; two eggs at most.

import type { Game } from '../sim/game.ts';

export interface ActionLookups {
  t(key: string): string;
  /** Shell color of an egg for its icon. */
  eggColor(id: string): string;
}

export interface Actions {
  root: HTMLElement;
  /** The second row next to the Upgrades button: the «Next» card lives here (M2-13). */
  more: HTMLElement;
  render(): void;
  setLanguage(lang: string): void;
}

export function createActions(parent: HTMLElement, game: Game, lang: string, look: ActionLookups): Actions {
  const root = document.createElement('div');
  root.className = 'actions';
  const eggsBox = document.createElement('div');
  eggsBox.className = 'actions-eggs';
  root.appendChild(eggsBox);
  const more = document.createElement('div');
  more.className = 'actions-more';
  root.appendChild(more);
  parent.appendChild(root);
  /** The last other egg the player bought: the panel keeps it at hand («one more»). */
  let lastOther: string | null = null;
  game.events.on((e) => {
    if (e.type === 'eggBought' && e.by === 'player') lastOther = e.egg;
  });
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
    more,
    render() {
      const all = game.eggList();
      const first = all[0];
      const other = all.find((e) => e.id === lastOther && e.id !== first?.id) ?? all.slice(1).filter((e) => e.check.ok).at(-1);
      const list = [first, other].filter((e): e is (typeof all)[number] => Boolean(e));
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
    },
    setLanguage(next) {
      format = new Intl.NumberFormat(next);
      actions.render();
    },
  };
  return actions;
}
