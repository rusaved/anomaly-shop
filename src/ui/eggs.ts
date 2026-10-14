// What: the Eggs tab (docs/01 §3 p. 12, §6; M3-04): incubating eggs with care, my eggs, free, seasonal, the ×10 ladder; a card shows the odds, buys ×1/×3/×5.
// Called by: src/main.ts (create once into its sheet; render on every commit while the sheet is open, and each second for timers).
// Keep: commands only through the game (buyEggs, claimFree, feedEgg); odds come from rules.eggOdds over eggs.json, so the card matches the data.

import type { EggData, RarityName, SpeciesData, UnlockData } from '../content/schemas.ts';
import type { EggCardView, Game } from '../sim/game.ts';
import { eggOdds } from '../sim/rules.ts';
import type { Sheet } from './sheet.ts';

export interface EggsLookups {
  t(key: string, vars?: Record<string, string | number>): string;
  lang(): string;
  egg(id: string): EggData | undefined;
  eggName(id: string): string;
  eggPicture(id: string, tint?: string): string;
  species: SpeciesData;
  speciesName(id: string): string;
  portrait(species: string, rarity: RarityName): string;
  rarityColor(r: RarityName): string;
  districtName(id: string): string;
  careShell: readonly string[];
}

export interface EggsTab {
  render(): void;
  /** Opens the card of one egg (the «Next» goal, a hint). */
  show(eggId: string | null): void;
}

const MULTI = [1, 3, 5] as const;
const SECTIONS = ['free', 'seasonal', 'ladder'] as const;

export function createEggsTab(sheet: Sheet, game: Game, look: EggsLookups): EggsTab {
  const root = document.createElement('div');
  root.className = 'eggs';
  sheet.body.appendChild(root);
  let card: string | null = null;
  let key = '';

  const fmtTime = (sec: number): string => {
    const s = Math.ceil(sec);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };
  const pct = (x: number): string => {
    const digits = x >= 10 ? 0 : x >= 1 ? 1 : 2;
    return `${new Intl.NumberFormat(look.lang(), { maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(x)}%`;
  };
  const lockText = (u: UnlockData): string => {
    if (u.type === 'deals') return look.t('eggs.lock.deals', { n: u.count });
    if (u.type === 'district') return look.t('eggs.lock.district', { name: look.districtName(u.id) });
    return look.t('eggs.lock.later');
  };
  const coinsHtml = (n: number, fmt: Intl.NumberFormat): string => `<span class="coin coin-sm" aria-hidden="true"></span><b>${fmt.format(n)}</b>`;

  function eggCard(v: EggCardView, fmt: Intl.NumberFormat): HTMLElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `tile card-egg${v.open ? '' : ' locked'}`;
    b.dataset.egg = v.id;
    b.dataset.action = `egg-card-${v.id}`;
    const egg = look.egg(v.id);
    let foot: string;
    if (v.freeIn !== null) foot = v.freeIn > 0 ? `<span class="card-sub">${look.t('eggs.in', { t: fmtTime(v.freeIn) })}</span>` : `<span class="card-price chip-good">${look.t('eggs.take')}</span>`;
    else if (!v.open && egg) foot = `<span class="card-sub">${lockText(egg.unlock)}</span>`;
    else foot = `<span class="card-price${v.affordable ? '' : ' dim'}">${coinsHtml(v.price, fmt)}</span>`;
    b.innerHTML = `<span class="card-pic"><img alt="" src="${look.eggPicture(v.id)}"></span><span class="card-name"></span>${foot}${v.fresh ? '<span class="dot"></span>' : ''}`;
    (b.querySelector('.card-name') as HTMLElement).textContent = look.eggName(v.id);
    b.addEventListener('click', () => tab.show(v.id));
    return b;
  }

  function section(title: string, items: HTMLElement[], id: string): HTMLElement {
    const box = document.createElement('section');
    box.className = 'eggs-section';
    box.dataset.section = id;
    box.innerHTML = `<h3 class="eggs-title"></h3><div class="cards"></div>`;
    (box.querySelector('.eggs-title') as HTMLElement).textContent = title;
    (box.querySelector('.cards') as HTMLElement).replaceChildren(...items);
    return box;
  }

  function renderList(): void {
    const shop = game.eggShop();
    const view = game.view();
    const fmt = new Intl.NumberFormat(look.lang());
    const coins = game.state.coins;
    const next = `l:${look.lang()}:${JSON.stringify(shop, (k, x: unknown) => (k === 'freeIn' && typeof x === 'number' ? Math.ceil(x) : x))}:${view.incubators.map((i) => `${i.egg}.${i.ready}.${i.careLevel}.${i.feedPrice}.${Math.round(i.share * 20)}`).join(',')}:${Math.floor(coins)}`;
    if (next === key) return;
    key = next;
    const parts: HTMLElement[] = [];
    // Eggs in the incubators: hatching progress, care and a portion of food (M3-02).
    const busy = view.incubators.map((inc, i) => ({ inc, i })).filter((x) => x.inc.egg);
    if (busy.length) {
      parts.push(
        section(
          look.t('eggs.incubating'),
          busy.map(({ inc, i }) => {
            const el = document.createElement('div');
            el.className = 'tile card-egg card-inc';
            el.dataset.incubator = String(i);
            const tint = inc.careLevel > 0 ? look.careShell[inc.careLevel] : undefined;
            el.innerHTML =
              `<span class="card-pic"><img alt="" src="${look.eggPicture(inc.egg!, tint)}"></span><span class="card-name"></span>` +
              `<span class="card-sub">${inc.ready ? look.t('eggs.ready') : `${Math.round(inc.share * 100)}%`}</span>` +
              (inc.feedPrice !== null
                ? `<button type="button" class="btn btn-small${coins + 1e-9 < inc.feedPrice ? ' dim' : ''}" data-action="egg-feed-${i}">${look.t('eggs.feed')} ${coinsHtml(inc.feedPrice, fmt)}</button>`
                : `<span class="card-sub">${look.t('eggs.fed')}</span>`);
            (el.querySelector('.card-name') as HTMLElement).textContent = look.eggName(inc.egg!);
            el.querySelector('[data-action^="egg-feed"]')?.addEventListener('click', () => game.feedEgg(i));
            return el;
          }),
          'incubating',
        ),
      );
    }
    if (shop.my.length)
      parts.push(
        section(
          look.t('eggs.my'),
          shop.my.map((m) => {
            const el = document.createElement('div');
            el.className = 'tile card-egg';
            el.dataset.my = m.id;
            el.innerHTML = `<span class="card-pic"><img alt="" src="${look.eggPicture(m.id)}"><i class="count">×${m.count}</i></span><span class="card-name"></span><span class="card-sub">${look.t('eggs.waiting')}</span>`;
            (el.querySelector('.card-name') as HTMLElement).textContent = look.eggName(m.id);
            return el;
          }),
          'my',
        ),
      );
    for (const s of SECTIONS) {
      const list = shop.eggs.filter((e) => e.section === s && (s !== 'seasonal' || e.open));
      if (list.length) parts.push(section(look.t(`eggs.${s}`), list.map((e) => eggCard(e, fmt)), s));
    }
    root.replaceChildren(...parts);
  }

  function renderCard(id: string): void {
    const egg = look.egg(id);
    const v = game.eggShop().eggs.find((e) => e.id === id);
    if (!egg || !v) {
      card = null;
      renderList();
      return;
    }
    const fmt = new Intl.NumberFormat(look.lang());
    const coins = game.state.coins;
    const next = `c:${id}:${look.lang()}:${v.open}:${v.freeIn === null ? '' : Math.ceil(v.freeIn)}:${MULTI.map((n) => coins + 1e-9 >= v.price * n).join('')}`;
    if (next === key) return;
    key = next;
    const odds = eggOdds(egg.chances, look.species);
    let buttons: string;
    if (v.freeIn !== null)
      buttons = v.freeIn > 0 ? `<p class="card-sub">${look.t('eggs.in', { t: fmtTime(v.freeIn) })}</p>` : `<button type="button" class="btn btn-primary" data-action="egg-take">${look.t('eggs.take')}</button>`;
    else if (!v.open) buttons = `<p class="card-sub">${lockText(egg.unlock)}</p>`;
    else
      buttons = MULTI.map(
        (n) =>
          `<button type="button" class="btn ${n === 1 ? 'btn-primary' : 'btn-alt'}${coins + 1e-9 < v.price * n ? ' dim' : ''}" data-action="egg-buy-${n}" aria-disabled="${coins + 1e-9 < v.price * n}">` +
          `${n === 1 ? look.t('eggs.buy') : `×${n}`} ${coinsHtml(v.price * n, fmt)}</button>`,
      ).join('');
    root.innerHTML =
      `<button type="button" class="eggs-back" data-action="egg-back">‹ ${look.t('eggs.back')}</button>` +
      `<div class="egg-hero"><img alt="" src="${look.eggPicture(id)}"><div><h3 class="egg-name"></h3><p class="card-sub">${look.t('eggs.hatchIn', { t: fmtTime(egg.hatchSec) })}</p></div></div>` +
      `<div class="egg-buy">${buttons}</div>` +
      `<h3 class="eggs-title">${look.t('eggs.inside')}</h3>` +
      `<div class="cards cards-odds">${odds
        .map(
          (o) =>
            `<div class="tile card-odds" data-species="${o.species}" data-chance="${o.chance}"><span class="card-pic"><img alt="" src="${look.portrait(o.species, o.rarity)}"><i class="rarity-dash" style="background:${look.rarityColor(o.rarity)}"></i></span>` +
            `<span class="card-name"></span><span class="card-sub">${pct(o.chance)}</span></div>`,
        )
        .join('')}</div>`;
    (root.querySelector('.egg-name') as HTMLElement).textContent = look.eggName(id);
    root.querySelectorAll<HTMLElement>('.card-odds').forEach((el) => {
      (el.querySelector('.card-name') as HTMLElement).textContent = look.speciesName(el.dataset.species ?? '');
    });
    root.querySelector('[data-action="egg-back"]')?.addEventListener('click', () => tab.show(null));
    root.querySelector('[data-action="egg-take"]')?.addEventListener('click', () => game.claimFree(id));
    for (const n of MULTI) root.querySelector(`[data-action="egg-buy-${n}"]`)?.addEventListener('click', () => game.buyEggs(id, n));
  }

  const tab: EggsTab = {
    render() {
      sheet.setTitle(look.t('eggs.title'));
      if (card) renderCard(card);
      else renderList();
    },
    show(eggId) {
      card = eggId;
      key = '';
      root.scrollTop = 0;
      sheet.body.scrollTop = 0;
      tab.render();
    },
  };
  return tab;
}
