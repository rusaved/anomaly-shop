// What: the «Склад» tab (docs/01 §6; MU-07 by s4-inventory, s4-finds, l3; MU-11 «Коллекция»): Питомцы · Коллекция · Находки, cards 2 in a row with their rarity.
// Called by: src/main.ts (create once into its sheet; render on every commit while the sheet is open, each second for the hatching timers).
// Keep: reads the game view and the save only; commands through the game or main.ts lookups; the rarity by the one component of kit.ts.

import type { RarityName } from '../content/schemas.ts';
import type { Game } from '../sim/game.ts';
import { COIN, esc, GEM, iconize, money, rarityBadge } from './kit.ts';
import type { Sheet } from './sheet.ts';

export interface InventoryLookups {
  t(key: string, vars?: Record<string, string | number>): string;
  lang(): string;
  speciesName(id: string): string;
  portrait(species: string, rarity: RarityName): string;
  rarityColor(r: RarityName): string;
  /** An egg's picture and name (the hatching ones stand among the pets, s4-inventory). */
  eggPicture(id: string): string;
  /** Taps a creature in the shop (feeds it). */
  pick(uid: string): void;
  /** MU-06: «На продажу» — the pet's «Цена» page. */
  list(uid: string): void;
  /** «Открыть» on a hatching egg: the «Яйца» tab. */
  openEggs(): void;
  /** M4-23: the market's mood chip for a species ('' when none). */
  mood(species: string): string;
  /** M4-20: a find's name, how to get it and its reward, in the player's language. */
  find(id: string): { name: string; desc: string; coins: number; crystals: number };
}

export interface InventoryTab {
  render(): void;
}

type Mode = 'items' | 'collection' | 'finds';

export function createInventoryTab(sheet: Sheet, game: Game, look: InventoryLookups): InventoryTab {
  let mode: Mode = 'items';
  sheet.head.innerHTML =
    '<div class="mu-seg subtabs" role="tablist"><button type="button" class="subtab" data-sub="items" data-i18n="inventory.items"></button>' +
    '<button type="button" class="subtab" data-sub="collection" data-i18n="inventory.collection"></button>' +
    '<button type="button" class="subtab" data-sub="finds" data-i18n="inventory.finds"></button></div>';
  const count = document.createElement('span');
  count.className = 'seg-count';
  sheet.head.appendChild(count);
  const list = document.createElement('div');
  list.className = 'inventory';
  sheet.body.appendChild(list);
  sheet.head.querySelectorAll<HTMLElement>('[data-sub]').forEach((b) =>
    b.addEventListener('click', () => {
      mode = (b.dataset.sub as Mode) ?? 'items';
      key = '';
      tab.render();
    }),
  );
  let key = '';

  function renderItems(fmt: Intl.NumberFormat): void {
    const view = game.view();
    // MU-07: the storage first (a tap «На продажу» opens the price), then the shelf and the chats, then the eggs hatching.
    const all = [...view.inventory.map((c) => ({ c, where: 'store' as const })), ...view.creatures.map((c) => ({ c, where: 'shelf' as const })), ...view.talking.map((c) => ({ c, where: 'chat' as const }))];
    const hatching = view.incubators.map((inc, i) => ({ inc, i })).filter((x) => x.inc.egg && !x.inc.ready);
    const next = `i:${look.lang()}:${all.map(({ c, where }) => `${c.uid}.${c.level}.${c.price}.${where}`).join(',')}:${hatching.map((x) => `${x.inc.egg}.${Math.round(x.inc.share * 100)}`).join(',')}:${JSON.stringify(game.mood())}`;
    if (next === key) return;
    key = next;
    if (!all.length && !hatching.length) {
      list.innerHTML = `<p class="empty" data-empty>${esc(look.t('inventory.empty'))}</p>`;
      return;
    }
    const cards = all.map(({ c, where }) => {
      const btn =
        where === 'store'
          ? `<button type="button" class="mu-btn" data-action="inv-list-${c.uid}">${esc(look.t('inventory.list'))}</button>`
          : where === 'shelf'
            ? `<button type="button" class="mu-btn" data-action="inv-off-${c.uid}">${esc(look.t('sales.off'))}</button>`
            : `<span class="mu-meta inv-where">${esc(look.t('sales.talkingSub'))}</span>`;
      return (
        `<div class="mu-card rar tile" data-rarity="${c.rarity}" data-uid="${c.uid}" data-on="${where !== 'store'}"><button type="button" class="mu-pic-btn" data-action="inv-pic-${c.uid}"><span class="mu-pic"><img alt="" src="${look.portrait(c.species, c.rarity)}"></span></button>` +
        `<span class="mu-name">${esc(look.speciesName(c.species))}</span><span class="inv-line"><span>${rarityBadge(c.rarity, look.t(`rarity.${c.rarity}`))}</span>` +
        `<span class="mu-meta">${esc(look.t('card.level', { n: c.level }))}${c.mark ? ` · ${esc(look.t(`mark.${c.mark}`))}` : ''} · ${money(c.price, fmt)} ${look.mood(c.species)}</span></span>${btn}</div>`
      );
    });
    for (const { inc, i } of hatching)
      cards.push(
        `<div class="mu-card mu-dim card-hatching" data-incubator="${i}"><span class="mu-pic"><img alt="" src="${look.eggPicture(inc.egg!)}"></span><span class="mu-name">${esc(look.t('inventory.hatching'))}</span>` +
          `<span class="mu-meta">${Math.round(inc.share * 100)} %</span><button type="button" class="mu-btn" data-action="inv-eggs">${esc(look.t('eggs.open'))}</button></div>`,
      );
    list.innerHTML = `<div class="mu-grid">${cards.join('')}</div>`;
    // l3: sideways the count of pets stands right of the segments.
    count.textContent = look.t('inventory.count', { n: all.length });
    for (const { c, where } of all) {
      list.querySelector(`[data-action="inv-list-${c.uid}"]`)?.addEventListener('click', () => look.list(c.uid));
      list.querySelector(`[data-action="inv-off-${c.uid}"]`)?.addEventListener('click', () => game.unlist(c.uid));
      list.querySelector(`[data-action="inv-pic-${c.uid}"]`)?.addEventListener('click', () => (where === 'store' ? look.list(c.uid) : look.pick(c.uid)));
    }
    list.querySelectorAll('[data-action="inv-eggs"]').forEach((b) => b.addEventListener('click', () => look.openEggs()));
  }

  function renderFinds(fmt: Intl.NumberFormat): void {
    // M4-20, MU-07 (s4-finds): the finds — a got one with its reward waits in a green frame with a green «Забрать».
    const finds = game.finds();
    const next = `f:${look.lang()}:${finds.map((f) => `${f.got ? 1 : 0}${f.claimed ? 1 : 0}${Math.min(f.have, f.need)}`).join(',')}`;
    if (next === key) return;
    key = next;
    const got = finds.filter((f) => f.got).length;
    const sorted = [...finds].sort((a, b) => Number(b.got && !b.claimed) - Number(a.got && !a.claimed) || Number(b.got) - Number(a.got) || Number(a.hidden) - Number(b.hidden));
    const cards = sorted.map((f) => {
      const d = look.find(f.id);
      const secret = f.hidden && !f.got;
      const ready = f.got && !f.claimed;
      const reward = money(d.crystals || d.coins, fmt, Boolean(d.crystals));
      const icon = secret ? '<b class="find-icon">?</b>' : `<b class="find-icon">${d.crystals ? GEM : COIN}</b>`;
      const meta = ready ? `${esc(look.t('finds.reward'))} ${reward}` : secret ? esc(look.t('finds.secret')) : `${esc(d.desc)}${f.need > 1 && !f.got ? ` · ${fmt.format(Math.min(f.have, f.need))}/${fmt.format(f.need)}` : ''}`;
      const btn = ready
        ? `<button type="button" class="mu-btn good" data-action="find-take-${f.id}">${esc(look.t('finds.take'))}</button>`
        : f.claimed
          ? `<button type="button" class="mu-btn off" aria-disabled="true">${esc(look.t('finds.got'))}</button>`
          : `<button type="button" class="mu-btn off" aria-disabled="true">${secret ? '?' : reward}</button>`;
      return `<div class="mu-card find${f.got ? ' got' : ''}${ready ? ' mu-ready' : ''}${secret ? ' secret' : ''}" data-find="${f.id}"><span class="mu-pic">${icon}</span><span class="mu-name find-name">${esc(secret ? '???' : d.name)}</span><span class="mu-meta find-progress">${meta}</span>${btn}</div>`;
    });
    list.innerHTML =
      `<div class="mu-head"><h3>${esc(look.t('finds.head'))}</h3><span class="cards-sum" data-finds="${got}/${finds.length}">${esc(look.t('finds.count', { n: got, all: finds.length }))}</span></div>` +
      `<div class="mu-grid finds">${cards.join('')}</div>`;
    for (const f of finds) list.querySelector(`[data-action="find-take-${f.id}"]`)?.addEventListener('click', () => game.claimFind(f.id));
  }

  function renderCollection(): void {
    // M4-01, MU-11: the collection by rarity — a row per rarity with «N/M» and its bonus, every species in its rarity frame.
    const view = game.collection();
    const next = `c:${look.lang()}:${view.rows.map((r) => `${r.done}.${r.species.map((x) => x.status[0]).join('')}`).join(',')}`;
    if (next === key) return;
    key = next;
    const pct = (x: number): number => Math.round(x * 100);
    list.innerHTML =
      `<p class="mu-meta cards-sum" data-collected="${view.have}/${view.all}">${esc(look.t('inventory.found', { n: view.have, all: view.all }))}</p>` +
      view.rows
        .map(
          (row) =>
            `<section class="col-row${row.done ? ' done' : ''}" data-row="${row.rarity}"><div class="mu-head"><h3>${esc(look.t(`collection.row.${row.rarity}`))}</h3><span>${row.have}/${row.all}</span></div>` +
            `<p class="mu-meta col-bonus" data-row-bonus>${iconize(row.done ? look.t('collection.rowDone', { p: pct(row.bonus) }) : look.t('collection.rowGoal', { p: pct(row.bonus), c: row.crystals }))}</p>` +
            `<div class="mu-grid">${row.species
              .map(
                (x) =>
                  `<div class="mu-card rar card-col${x.status === 'none' ? ' unknown mu-dim' : ''}" data-rarity="${row.rarity}" data-species="${x.id}" data-status="${x.status}"><span class="mu-pic"><img alt="" src="${look.portrait(x.id, row.rarity)}"></span>` +
                  `<span class="mu-name">${esc(x.status === 'none' ? '?' : look.speciesName(x.id))}</span><span>${rarityBadge(row.rarity, look.t(`rarity.${row.rarity}`))}</span><span class="mu-meta">${esc(look.t(`collection.status.${x.status}`))}</span></div>`,
              )
              .join('')}</div></section>`,
        )
        .join('');
  }

  const tab: InventoryTab = {
    render() {
      sheet.setTitle(look.t('nav.inventory'));
      sheet.head.querySelectorAll<HTMLElement>('[data-sub]').forEach((b) => b.classList.toggle('active', b.dataset.sub === mode));
      const fmt = new Intl.NumberFormat(look.lang());
      count.hidden = mode !== 'items';
      if (mode === 'items') renderItems(fmt);
      else if (mode === 'finds') renderFinds(fmt);
      else renderCollection();
    },
  };
  return tab;
}
