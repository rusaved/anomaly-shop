// What: the «Next» card (docs/01b, section 5.2; M2-13): the nearest goal with a bar and «N more coins»; flashes when a goal is reached.
// Called by: src/main.ts (create once in the actions row, render on every commit and game change; hidden in the first minute).
// Keep: the goal comes from game.nextGoal() only; names from content; a tap opens the upgrade shop.

import type { Game, GoalView } from '../sim/game.ts';

export interface NextLookups {
  t(key: string, vars?: Record<string, string | number>): string;
  lang(): string;
  /** Display name of the goal (upgrade, district, egg, rebirth). */
  name(goal: GoalView): string;
}

export interface NextCard {
  root: HTMLElement;
  render(): void;
}

/** Plural key for «N more coins / deals / crystals»: ru one/few/many, en one/other (Intl.PluralRules). */
function leftKey(lang: string, unit: GoalView['unit'], n: number): string {
  const rule = new Intl.PluralRules(lang).select(n);
  const form = rule === 'one' ? 'one' : rule === 'few' ? 'few' : 'many';
  return `next.left.${unit}.${form}`;
}

export function createNextCard(parent: HTMLElement, game: Game, look: NextLookups, onOpen: () => void): NextCard {
  const root = document.createElement('button');
  root.type = 'button';
  root.className = 'next';
  root.dataset.action = 'next';
  root.innerHTML =
    '<span class="next-icon" aria-hidden="true"></span><span class="next-text"><small><span data-next-label></span> · <span class="next-left" data-next-left></span></small><b data-next-name></b></span>' +
    '<span class="next-bar" aria-hidden="true"><span data-next-bar></span></span>';
  parent.appendChild(root);
  const label = root.querySelector('[data-next-label]') as HTMLElement;
  const name = root.querySelector('[data-next-name]') as HTMLElement;
  const left = root.querySelector('[data-next-left]') as HTMLElement;
  const bar = root.querySelector('[data-next-bar]') as HTMLElement;
  root.addEventListener('click', onOpen);
  let lastId = '';
  let lastText = '';
  return {
    root,
    render() {
      const shown = Boolean(game.state.flags.ftue_done);
      root.hidden = !shown;
      if (!shown) return;
      const goal = game.nextGoal();
      const id = `${goal.kind}:${goal.id}:${goal.need}`;
      if (lastId && id !== lastId) {
        // The previous goal is reached: a flash, then the next one.
        root.classList.remove('flash');
        void root.offsetWidth;
        root.classList.add('flash');
      }
      lastId = id;
      const n = Math.max(0, Math.ceil(goal.need - goal.have));
      const fmt = new Intl.NumberFormat(look.lang());
      const text = `${look.lang()}|${id}|${n}`;
      bar.style.width = `${Math.round(Math.min(1, goal.need > 0 ? goal.have / goal.need : 1) * 100)}%`;
      if (text === lastText) return;
      lastText = text;
      root.dataset.kind = goal.kind;
      root.dataset.unit = goal.unit;
      label.textContent = look.t('next.label');
      name.textContent = look.name(goal);
      left.textContent = look.t(leftKey(look.lang(), goal.unit, n), { n: fmt.format(n) });
    },
  };
}
