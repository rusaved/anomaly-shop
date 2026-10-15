// What: the Shop tab (docs/01 §6; Q-021 B, M4-00): sections «Upgrades» (the shop upgrades: level, effect, price) and, from M5, «Deals · Currency».
// Called by: src/main.ts (create once into its sheet; rendered on every commit; the «Upgrades» button on the scene opens this section).
// Keep: the game runs on behind it (idle genre standard); purchases go through game.buyUpgrade; the sections come from content/nav.json.

import type { UpgradeData } from '../content/schemas.ts';
import type { Game } from '../sim/game.ts';
import type { Sheet } from './sheet.ts';

export interface UpgradeLookups {
  t(key: string, vars?: Record<string, string | number>): string;
  lang(): string;
  upgrade(id: string): UpgradeData | undefined;
  /** Tier colors grey to red (Q-022, style.json rarity): the dash under an upgrade shows how far it is levelled. */
  tierColors?: readonly string[];
  /** The sections open now (content/nav.json shop.sections). */
  sections: readonly string[];
}

export interface ShopTab {
  /** Opens a section (the scene button opens «upgrades»). */
  section(id: string): void;
  render(): void;
}

/** Effect line of an upgrade from its data (the numbers are never typed into texts). */
function effectText(u: UpgradeData, look: UpgradeLookups): string {
  const e = u.effect;
  const pct = (x: number): number => Math.round(Math.abs(x) * 100);
  const key = `upgrade.effect.${e.type}`;
  if (e.type === 'slots' || e.type === 'showcaseSlots' || e.type === 'feedPerTap' || e.type === 'queueSize') return look.t(key, { n: e.perLevel });
  if (e.type === 'hatchTime' || e.type === 'spawnRate' || e.type === 'bargain' || e.type === 'give' || e.type === 'appraisal') return look.t(key, { n: pct(e.perLevel) });
  return look.t(key);
}

export function createShopTab(sheet: Sheet, game: Game, look: UpgradeLookups): ShopTab {
  let current = look.sections[0] ?? 'upgrades';
  // The sections bar shows once there are two (M5: «Deals · Currency»); until then the section is a heading over its list.
  if (look.sections.length > 1) {
    sheet.head.innerHTML = `<div class="subtabs" role="tablist">${look.sections.map((id) => `<button type="button" class="subtab" data-sub="${id}" data-i18n="shop.section.${id}"></button>`).join('')}</div>`;
    sheet.head.querySelectorAll<HTMLElement>('[data-sub]').forEach((b) => b.addEventListener('click', () => tab.section(b.dataset.sub ?? current)));
  }
  const box = document.createElement('div');
  box.className = 'card-shop';
  box.dataset.section = 'upgrades';
  const head = document.createElement('div');
  head.className = 'shop-head';
  const title = document.createElement('h3');
  title.className = 'eggs-title';
  title.dataset.i18n = 'upgrades.title';
  // The wallet stays in sight while the list scrolls (M2 playtest).
  const wallet = document.createElement('span');
  wallet.className = 'shop-wallet';
  wallet.innerHTML = '<span class="coin coin-sm" aria-hidden="true"></span><b data-wallet></b>';
  head.append(title, wallet);
  const list = document.createElement('div');
  list.className = 'shop-list';
  box.append(head, list);
  sheet.body.appendChild(box);
  let built = '';
  function build(): void {
    list.replaceChildren();
    // Affordable first, then the rest by price, maxed at the bottom (the nearest goals are what the player looks for).
    const rank = (u: { maxed: boolean; affordable: boolean }): number => (u.maxed ? 2 : u.affordable ? 0 : 1);
    for (const item of [...game.upgradeList()].sort((a, b) => rank(a) - rank(b) || a.price - b.price)) {
      const u = look.upgrade(item.id);
      if (!u) continue;
      const row = document.createElement('div');
      row.className = 'shop-item';
      row.dataset.upgrade = item.id;
      row.innerHTML =
        `<span class="shop-icon-box"><span class="shop-icon shop-icon-${u.effect.type}" aria-hidden="true"></span><i class="tier-dash" data-tier></i></span>` +
        '<span class="shop-text"><b data-name></b><small data-effect></small><small class="shop-joke" data-joke></small><small data-level></small></span><span class="shop-new" data-new hidden></span>' +
        `<button type="button" class="btn btn-primary btn-buy" data-action="buy-upgrade" data-id="${item.id}"><span class="${u.currency === 'crystals' ? 'gem' : 'coin coin-sm'}" aria-hidden="true"></span><span data-price></span></button>`;
      (row.querySelector('[data-name]') as HTMLElement).textContent = u.name[look.lang() === 'en' ? 'en' : 'ru'];
      (row.querySelector('[data-effect]') as HTMLElement).textContent = effectText(u, look);
      const joke = row.querySelector('[data-joke]') as HTMLElement;
      joke.textContent = u.joke ? u.joke[look.lang() === 'en' ? 'en' : 'ru'] : '';
      joke.hidden = !u.joke;
      (row.querySelector('[data-new]') as HTMLElement).textContent = look.t('upgrades.new');
      row.querySelector('button')?.addEventListener('click', () => game.buyUpgrade(item.id));
      list.appendChild(row);
    }
  }

  const tab: ShopTab = {
    section(id) {
      if (look.sections.includes(id)) current = id;
      sheet.head.querySelectorAll<HTMLElement>('[data-sub]').forEach((b) => b.classList.toggle('active', b.dataset.sub === current));
      box.hidden = current !== 'upgrades';
    },
    render() {
      sheet.setTitle(look.t('nav.shop'));
      if (!sheet.shown() && built) return;
      const key = `${look.lang()}|${game.upgradeList().map((u) => `${u.id}:${u.maxed}:${u.affordable}:${u.price}`).join(',')}`;
      if (built !== key) {
        built = key;
        build();
      }
      const fmt = new Intl.NumberFormat(look.lang());
      (wallet.querySelector('[data-wallet]') as HTMLElement).textContent = fmt.format(Math.floor(game.state.coins));
      for (const item of game.upgradeList()) {
        const row = list.querySelector(`[data-upgrade="${item.id}"]`);
        if (!row) continue;
        const levelText = row.querySelector('[data-level]') as HTMLElement;
        // One-off things say «Bought» once bought; levelled ones count levels.
        levelText.textContent = item.levels > 1 ? look.t('upgrades.level', { n: item.level, max: item.levels }) : item.maxed ? look.t('upgrades.bought') : '';
        levelText.hidden = !levelText.textContent;
        // The tier (M3-17): the share of levels bought, on the grey-to-red scale; a dash, the text stays plain.
        const colors = look.tierColors ?? [];
        const tier = item.level <= 0 || !colors.length ? -1 : Math.min(colors.length - 1, Math.floor(((item.level - 1) / Math.max(1, item.levels - 1)) * (colors.length - 1)));
        const dash = row.querySelector('[data-tier]') as HTMLElement;
        dash.style.background = tier >= 0 ? (colors[tier] ?? '') : 'transparent';
        dash.dataset.tier = String(tier);
        const buy = row.querySelector('button') as HTMLButtonElement;
        const price = row.querySelector('[data-price]') as HTMLElement;
        price.textContent = item.maxed ? look.t('upgrades.max') : fmt.format(item.price);
        buy.classList.toggle('is-max', item.maxed);
        (row.querySelector('[data-new]') as HTMLElement).hidden = !item.fresh;
        buy.setAttribute('aria-disabled', String(!item.affordable));
      }
    },
  };
  return tab;
}
