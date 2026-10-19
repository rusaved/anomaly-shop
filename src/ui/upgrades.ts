// What: the «Магазин» tab (docs/01 §6; Q-021 B, M4-05; MU-10 by s7-shop): segments Улучшения · Пункт продаж · Акции (off till the ads milestone), cards 2 in a row.
// Called by: src/main.ts (create once into its sheet; rendered on every commit; the «Улучшения» button on the scene opens this section).
// Keep: purchases go through game.buyUpgrade / buyGuest; sections come from content/nav.json; a price button is dark, «не хватает N» is a meta line, never red.

import type { UpgradeData } from '../content/schemas.ts';
import type { Game } from '../sim/game.ts';
import { esc, money } from './kit.ts';
import type { Sheet } from './sheet.ts';

export interface UpgradeLookups {
  t(key: string, vars?: Record<string, string | number>): string;
  lang(): string;
  upgrade(id: string): UpgradeData | undefined;
  /** Tier colors grey to red (kept for the scene's tier marks). */
  tierColors?: readonly string[];
  /** Every section of the store and whether it is on now (content/nav.json shop.sections). */
  sections: ReadonlyArray<{ id: string; enabled: boolean }>;
  /** M4-05: the name of a guest zone decoration and of a theme. */
  guestName(id: string): string;
  themeName(theme: string): string;
  /** The seller level the lease of the point opens at. */
  pointLevel: number;
  /** The picture of a thing to buy: its decor or its id (the scene art). */
  icon(thing: string): string;
}

export interface ShopTab {
  /** Opens a section (the scene button opens «upgrades»). */
  section(id: string): void;
  render(): void;
  /** The Store left the screen: the next visit sorts the cards afresh. */
  leave(): void;
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

/** Levels as dots (s7-shop) up to this many; more — «ур. N из M». */
const DOTS = 6;

export function createShopTab(sheet: Sheet, game: Game, look: UpgradeLookups): ShopTab {
  const on = look.sections.filter((s) => s.enabled).map((s) => s.id);
  let current = on[0] ?? 'upgrades';
  // MU-10: the segments under the top bar; «Акции» stays visible and off until the ads milestone (07 «Словарь»).
  sheet.head.innerHTML = `<div class="mu-seg subtabs" role="tablist">${look.sections
    .map((s) => `<button type="button" class="subtab" data-sub="${s.id}"${s.enabled ? '' : ' aria-disabled="true"'} data-i18n="${s.id === 'point' ? 'shop.section.point.short' : `shop.section.${s.id}`}"></button>`)
    .join('')}</div>`;
  sheet.head.querySelectorAll<HTMLElement>('[data-sub]').forEach((b) =>
    b.addEventListener('click', () => {
      if (b.getAttribute('aria-disabled') !== 'true') tab.section(b.dataset.sub ?? current);
    }),
  );
  const box = document.createElement('div');
  box.className = 'card-shop';
  box.dataset.section = 'upgrades';
  sheet.body.appendChild(box);
  // M4-05, Q-019: «Пункт продаж» — the steps of the point with their tiers, then the guest zone.
  const pointBox = document.createElement('div');
  pointBox.className = 'card-shop';
  pointBox.dataset.section = 'point';
  pointBox.hidden = true;
  sheet.body.appendChild(pointBox);
  let built = '';
  /** MU-12 (the usability review): the order of the cards stays while the Store is on screen — a purchase never moves the next card under the finger. */
  let order: string[] = [];
  let boughtAt = 0;
  /** FB-12: the row just bought (it flashes; a repeat flashes shorter). */
  let flash = { id: '', at: -1e9, short: false };

  /** FB-12: a row bought within its flash time keeps flashing across re-renders (the animation resumes where it was). */
  const flashLeft = (id: string): number => (flash.id === id ? (flash.short ? 350 : 700) - (performance.now() - flash.at) : 0);
  const flashClass = (id: string): string => (flashLeft(id) > 0 ? (flash.short ? ' bought short' : ' bought') : '');
  const flashStyle = (id: string): string => (flashLeft(id) > 0 ? ` style="animation-delay:-${Math.round(performance.now() - flash.at)}ms"` : '');

  function upgradeCard(id: string, fmt: Intl.NumberFormat, coins: number, crystals: number): string {
    const u = look.upgrade(id);
    const item = game.upgradeList().find((x) => x.id === id);
    if (!u || !item) return '';
    const gem = u.currency === 'crystals';
    const have = gem ? crystals : coins;
    const lvl =
      item.levels <= 1
        ? item.maxed
          ? `<span class="mu-meta">${esc(look.t('upgrades.bought'))}</span>`
          : ''
        : item.levels <= DOTS
          ? `<span class="lvl-dots" aria-label="${esc(look.t('upgrades.level', { n: item.level, max: item.levels }))}">${Array.from({ length: item.levels }, (_, i) => `<i${i < item.level ? ' class="on"' : ''}></i>`).join('')}</span>`
          : `<span class="mu-meta">${esc(look.t('upgrades.level', { n: item.level, max: item.levels }))}</span>`;
    const short = !item.maxed && !item.affordable ? `<span class="mu-meta mu-short">${esc(look.t('upgrades.short'))} ${money(Math.max(1, Math.ceil(item.price - have)), fmt, gem)}</span>` : '';
    const btn = item.maxed
      ? `<button type="button" class="mu-btn off is-max" data-action="buy-upgrade" data-id="${id}" aria-disabled="true">${esc(look.t('upgrades.max'))}</button>`
      : `<button type="button" class="mu-btn${item.affordable ? '' : ' off'}" data-action="buy-upgrade" data-id="${id}" aria-disabled="${!item.affordable}">${money(item.price, fmt, gem)}</button>`;
    return (
      `<div class="mu-card shop-item${item.affordable && !item.maxed ? ' can' : ''}${flashClass(id)}" data-upgrade="${id}"${flashStyle(id)}><span class="mu-pic"><img alt="" src="${look.icon(u.decor ?? u.id)}">${item.fresh ? '<i class="mu-new" data-new></i>' : ''}</span>` +
      `<span class="mu-name">${esc(u.name[look.lang() === 'en' ? 'en' : 'ru'])}</span><span class="mu-line"><span class="mu-meta">${esc(effectText(u, look))}</span>${lvl}${short}</span>${btn}</div>`
    );
  }

  function renderGuest(fmt: Intl.NumberFormat): string {
    const z = game.guestZone();
    const pct = (x: number): string => new Intl.NumberFormat(look.lang(), { maximumFractionDigits: 1 }).format(x * 100);
    if (!z.open) return `<div class="mu-head"><h3>${esc(look.t('guest.title'))}</h3><span></span></div><p class="mu-meta">${esc(look.t('guest.locked'))}</p>`;
    const sets = z.sets.map((x) => `<span class="guest-set${x.done ? ' done' : ''}" data-set="${x.theme}">${esc(look.t('guest.set', { name: look.themeName(x.theme), b: pct(x.bonus) }))}</span>`).join(' · ');
    return (
      `<div class="mu-head"><h3>${esc(look.t('guest.title'))}</h3><span></span></div>` +
      `<p class="mu-meta" data-guest-sum>${esc(look.t('guest.sum', { b: pct(z.bonus), u: fmt.format(z.upkeep) }))}</p>` +
      (z.unpaid ? `<p class="mu-meta guest-unpaid" data-guest-unpaid>${esc(look.t('guest.unpaid'))}</p>` : '') +
      `<p class="mu-meta guest-sets">${sets}</p><div class="mu-grid" data-guest-list>${z.items
        .map(
          (it) =>
            `<div class="mu-card shop-item" data-guest="${it.id}"><span class="mu-name">${esc(look.guestName(it.id))}</span><span class="mu-meta">${esc(look.t('guest.effect', { b: pct(it.bargain), u: fmt.format(it.upkeep) }))}</span><span class="mu-meta">${esc(look.themeName(it.theme))}</span>` +
            (it.owned
              ? `<button type="button" class="mu-btn" data-action="guest-remove" data-id="${it.id}">${esc(look.t('guest.remove'))}</button>`
              : `<button type="button" class="mu-btn${it.affordable ? '' : ' off'}" data-action="guest-buy" data-id="${it.id}" aria-disabled="${!it.affordable}">${money(it.price, fmt)}</button>`) +
            '</div>',
        )
        .join('')}</div>`
    );
  }

  const tab: ShopTab = {
    leave() {
      order = [];
    },
    section(id) {
      if (on.includes(id)) current = id;
      sheet.head.querySelectorAll<HTMLElement>('[data-sub]').forEach((b) => b.classList.toggle('active', b.dataset.sub === current));
      box.hidden = current !== 'upgrades';
      pointBox.hidden = current !== 'point';
    },
    render() {
      sheet.setTitle(look.t('nav.shop'));
      if (!sheet.shown() && built) return;
      const coins = game.state.coins;
      const crystals = game.state.crystals;
      const list = game.upgradeList();
      const key = `${look.lang()}|${Math.floor(coins)}|${crystals}|${list.map((u) => `${u.id}:${u.level}:${u.maxed}:${u.affordable}:${u.price}:${u.fresh}`).join(',')}|${JSON.stringify(game.guestZone())}`;
      if (built === key) return;
      built = key;
      const fmt = new Intl.NumberFormat(look.lang());
      // Affordable first, then the rest by price, maxed at the bottom (the nearest goals are what the player looks for).
      const rank = (u: { maxed: boolean; affordable: boolean }): number => (u.maxed ? 2 : u.affordable ? 0 : 1);
      if (!order.length) order = [...list].sort((a, b) => rank(a) - rank(b) || a.price - b.price).map((u) => u.id);
      for (const u of list) if (!order.includes(u.id)) order.push(u.id);
      const sorted = order.map((id) => list.find((u) => u.id === id)).filter((u) => u !== undefined);
      const shop = sorted.filter((x) => look.upgrade(x.id)?.group !== 'point');
      const point = sorted.filter((x) => look.upgrade(x.id)?.group === 'point');
      box.innerHTML = `<div class="mu-grid">${shop.map((x) => upgradeCard(x.id, fmt, coins, crystals)).join('')}</div>`;
      pointBox.innerHTML =
        `<div class="mu-head"><h3>${esc(look.t('shop.section.point'))}</h3><span></span></div>` +
        (point.length ? `<div class="mu-grid" data-point-list>${point.map((x) => upgradeCard(x.id, fmt, coins, crystals)).join('')}</div>` : `<p class="mu-meta" data-point-locked>${esc(look.t('point.locked', { n: look.pointLevel }))}</p>`) +
        `<div class="guest" data-guest>${renderGuest(fmt)}</div>`;
      // A second tap right after a purchase is the same finger again, not a new choice.
      sheet.body.querySelectorAll<HTMLElement>('[data-action="buy-upgrade"]').forEach((b) =>
        b.addEventListener('click', () => {
          if (performance.now() - boughtAt < 450) return;
          const id = b.dataset.id ?? '';
          if (game.buyUpgrade(id)) {
            // FB-12: the row flashes; the same row again within 3 s — a shorter flash.
            flash = { id, at: performance.now(), short: flash.id === id && performance.now() - flash.at < 3000 };
            boughtAt = performance.now();
            built = '';
            tab.render();
          }
        }),
      );
      sheet.body.querySelectorAll<HTMLElement>('[data-action="guest-buy"]').forEach((b) => b.addEventListener('click', () => game.buyGuest(b.dataset.id ?? '')));
      sheet.body.querySelectorAll<HTMLElement>('[data-action="guest-remove"]').forEach((b) => b.addEventListener('click', () => game.removeGuest(b.dataset.id ?? '')));
    },
  };
  return tab;
}
