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
  /** M4-05: the name of a guest zone decoration and of a theme. */
  guestName(id: string): string;
  themeName(theme: string): string;
  /** The seller level the lease of the point opens at. */
  pointLevel: number;
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
  if (e.type === 'slots' || e.type === 'showcaseSlots' || e.type === 'feedPerTap' || e.type === 'queueSize' || e.type === 'passive') return look.t(key, { n: e.perLevel });
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
  // M4-05, Q-019: the «Pickup point» section — the steps of the point with their tiers, then the guest zone.
  const pointBox = document.createElement('div');
  pointBox.className = 'card-shop';
  pointBox.dataset.section = 'point';
  pointBox.hidden = true;
  pointBox.innerHTML = '<h3 class="eggs-title" data-i18n="shop.section.point"></h3><p class="card-sub" data-point-locked hidden></p><div class="shop-list" data-point-list></div><div class="guest" data-guest></div>';
  sheet.body.appendChild(pointBox);
  const pointList = pointBox.querySelector('[data-point-list]') as HTMLElement;
  const pointLocked = pointBox.querySelector('[data-point-locked]') as HTMLElement;
  const guestBox = pointBox.querySelector('[data-guest]') as HTMLElement;
  let built = '';
  let guestKey = '';
  function renderGuest(): void {
    const z = game.guestZone();
    const fmt = new Intl.NumberFormat(look.lang());
    const pct = (x: number): string => new Intl.NumberFormat(look.lang(), { maximumFractionDigits: 1 }).format(x * 100);
    const key = `${look.lang()}|${JSON.stringify(z)}`;
    if (key === guestKey) return;
    guestKey = key;
    if (!z.open) {
      guestBox.innerHTML = `<h3 class="eggs-title">${look.t('guest.title')}</h3><p class="card-sub">${look.t('guest.locked')}</p>`;
      return;
    }
    const sets = z.sets.map((x) => `<span class="guest-set${x.done ? ' done' : ''}" data-set="${x.theme}">${look.t('guest.set', { name: look.themeName(x.theme), b: pct(x.bonus) })}</span>`).join(' ');
    guestBox.innerHTML =
      `<h3 class="eggs-title">${look.t('guest.title')}</h3>` +
      `<p class="card-sub" data-guest-sum>${look.t('guest.sum', { b: pct(z.bonus), u: fmt.format(z.upkeep) })}</p>` +
      (z.unpaid ? `<p class="card-sub guest-unpaid" data-guest-unpaid>${look.t('guest.unpaid')}</p>` : '') +
      `<p class="guest-sets">${sets}</p><div class="shop-list" data-guest-list></div>`;
    const glist = guestBox.querySelector('[data-guest-list]') as HTMLElement;
    for (const it of z.items) {
      const row = document.createElement('div');
      row.className = 'shop-item';
      row.dataset.guest = it.id;
      row.innerHTML =
        `<span class="shop-text"><b></b><small>${look.t('guest.effect', { b: pct(it.bargain), u: fmt.format(it.upkeep) })}</small><small>${look.themeName(it.theme)}</small></span>` +
        (it.owned
          ? `<button type="button" class="btn btn-alt btn-buy" data-action="guest-remove" data-id="${it.id}">${look.t('guest.remove')}</button>`
          : `<button type="button" class="btn btn-primary btn-buy" data-action="guest-buy" data-id="${it.id}" aria-disabled="${!it.affordable}"><span class="coin coin-sm" aria-hidden="true"></span>${fmt.format(it.price)}</button>`);
      (row.querySelector('b') as HTMLElement).textContent = look.guestName(it.id);
      row.querySelector('[data-action=guest-buy]')?.addEventListener('click', () => game.buyGuest(it.id));
      row.querySelector('[data-action=guest-remove]')?.addEventListener('click', () => game.removeGuest(it.id));
      glist.appendChild(row);
    }
  }
  function build(): void {
    list.replaceChildren();
    pointList.replaceChildren();
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
      (u.group === 'point' ? pointList : list).appendChild(row);
    }
  }

  const tab: ShopTab = {
    section(id) {
      if (look.sections.includes(id)) current = id;
      sheet.head.querySelectorAll<HTMLElement>('[data-sub]').forEach((b) => b.classList.toggle('active', b.dataset.sub === current));
      box.hidden = current !== 'upgrades';
      pointBox.hidden = current !== 'point';
    },
    render() {
      sheet.setTitle(look.t('nav.shop'));
      if (!sheet.shown() && built) return;
      const key = `${look.lang()}|${game.upgradeList().map((u) => `${u.id}:${u.maxed}:${u.affordable}:${u.price}`).join(',')}`;
      if (built !== key) {
        built = key;
        build();
        // M4-05: before the lease the section says when the point opens.
        pointLocked.hidden = pointList.childElementCount > 0;
        pointLocked.textContent = look.t('point.locked', { n: look.pointLevel });
      }
      const fmt = new Intl.NumberFormat(look.lang());
      (wallet.querySelector('[data-wallet]') as HTMLElement).textContent = fmt.format(Math.floor(game.state.coins));
      renderGuest();
      for (const item of game.upgradeList()) {
        const row = sheet.body.querySelector(`[data-upgrade="${item.id}"]`);
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
