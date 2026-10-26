// What: the Eggs tab (docs/01 §3 p. 12; MU-04 by s1-eggs-list): «Мои яйца» (incubators, free, waiting) and the egg sections, 2 in a row; the egg card «что внутри» (MU-11).
// Called by: src/main.ts (two instances: the «Яйца» tab and sideways «Лавка» rows, l1; render on every commit and each second for timers).
// Keep: commands only through the game (buyEggs, claimFree, feedEgg, tapIncubator); odds come from rules.eggOdds over eggs.json; the action is orange, a price button dark.

import type { EggData, RarityName, SpeciesData, UnlockData } from '../content/schemas.ts';
import type { AdEggView, EggCardView, Game } from '../sim/game.ts';
import { careChances, eggOdds } from '../sim/rules.ts';
import { esc, money, rarityBadge } from './kit.ts';
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
  /** FB-05: the most care can move the odds (eggs.json care.maxBonus). */
  careMax: number;
  careTop: number;
  /** M5-02: rewarded ads (the yandex profile): the egg-ad cards and «hatch now»; missing — no ad buttons. */
  ad?: EggAds;
  /** T-05: the first-minute line in the «Мои яйца» head while the tab's green dot calls, and the button it names (a data-action
   * prefix; '' — none); null — no line. */
  hint?(): { text: string; target: string } | null;
}

export interface EggAds {
  cards(): AdEggView[];
  busy(): boolean;
  /** Plays the video of an egg card; the egg comes only on the reward. */
  egg(id: string): void;
  hatch(index: number): void;
  minLeftSec: number;
}

export interface EggsTab {
  render(): void;
  /** Opens the card of one egg (a hint, a goal), or the list with null. */
  show(eggId: string | null): void;
  /** Drops the cards (the instance out of sight). */
  clear(): void;
}

const MULTI = [1, 3, 5] as const;
const SECTIONS = ['seasonal', 'ladder'] as const;

export function createEggsTab(sheet: Sheet, game: Game, look: EggsLookups, detailName = 'egg-card'): EggsTab {
  const root = document.createElement('div');
  root.className = 'eggs';
  sheet.body.appendChild(root);
  // The egg card is an inner page of the tab: «←» back to the eggs (07 rule 12).
  const panel = sheet.detail(detailName, () => tab.show(null));
  let card: string | null = null;
  let key = '';
  let cardKey = '';

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
    if (u.type === 'level') return look.t('eggs.lock.level', { n: u.n });
    if (u.type === 'city') return look.t('eggs.lock.city', { n: u.n });
    return look.t('eggs.lock.later');
  };
  const head = (title: string, meta: string): string => `<div class="mu-head"><h3>${esc(title)}</h3><span>${esc(meta)}</span></div>`;
  const pic = (src: string, extra = ''): string => `<span class="mu-pic"><img alt="" src="${src}">${extra}</span>`;

  /** A card of the egg shop: picture (opens «что внутри»), name, a dark price button that buys one. */
  function shopCard(v: EggCardView, fmt: Intl.NumberFormat): string {
    const egg = look.egg(v.id);
    const name = esc(look.eggName(v.id));
    if (!v.open && egg)
      return `<div class="mu-card mu-dim card-egg locked" data-egg="${v.id}"><button type="button" class="mu-pic-btn" data-action="egg-card-${v.id}">${pic(look.eggPicture(v.id))}</button><span class="mu-name">${name}</span><span class="mu-meta">${esc(lockText(egg.unlock))}</span></div>`;
    const short = game.state.coins + 1e-9 < v.price;
    return (
      `<div class="mu-card card-egg" data-egg="${v.id}"><button type="button" class="mu-pic-btn" data-action="egg-card-${v.id}">${pic(look.eggPicture(v.id), v.fresh ? '<i class="mu-new"></i>' : '')}</button>` +
      `<span class="mu-name">${name}</span>` +
      `<button type="button" class="mu-btn${short ? ' off' : ''}" data-action="egg-buy-${v.id}" aria-disabled="${short}">${money(v.price, fmt)}</button></div>`
    );
  }

  function renderList(): void {
    const shop = game.eggShop();
    const view = game.view();
    const fmt = new Intl.NumberFormat(look.lang());
    const coins = game.state.coins;
    const adKey = look.ad ? `${look.ad.busy()}:${JSON.stringify(look.ad.cards().map((c) => [c.egg, c.left, Math.ceil(c.waitSec)]))}:${view.incubators.map((i) => i.leftSec > look.ad!.minLeftSec).join('')}` : '';
    const hint = look.hint?.() ?? null;
    const next = `l:${look.lang()}:${hint ? `${hint.text}>${hint.target}` : ''}:${adKey}:${JSON.stringify(shop, (k, x: unknown) => (k === 'freeIn' && typeof x === 'number' ? Math.ceil(x) : x))}:${view.incubators.map((i) => `${i.egg}.${i.ready}.${i.careLevel}.${i.feedPrice}.${Math.round(i.share * 100)}`).join(',')}:${Math.floor(coins)}`;
    if (next === key) return;
    key = next;
    const mine: string[] = [];
    // MU-04: «Мои яйца» — the eggs in the incubators (progress, a portion of food, «Покормить» in orange), then the free one.
    // 07 rule 7: one main button on the screen — «Открыть» of a ready egg first, else the first «Покормить»; the others are dark.
    let main = view.incubators.some((inc) => inc.egg && inc.ready) ? 'open' : 'feed';
    const mainOf = (kind: 'open' | 'feed'): string => {
      if (main !== kind) return '';
      main = '';
      return ' main';
    };
    view.incubators.forEach((inc, i) => {
      if (!inc.egg) return;
      const tint = inc.careLevel > 0 ? look.careShell[inc.careLevel] : undefined;
      const name = esc(look.eggName(inc.egg));
      let meta: string;
      let btn: string;
      if (inc.ready) {
        meta = esc(look.t('eggs.ready'));
        btn = `<button type="button" class="mu-btn${mainOf('open')}" data-action="egg-open-${i}">${esc(look.t('eggs.open'))}</button>`;
      } else if (look.ad && inc.leftSec > look.ad.minLeftSec && (inc.feedPrice === null || coins + 1e-9 < inc.feedPrice)) {
        // M5-02: fed in full (or no coins for food) and still warming — «hatch now» for a video (the reward is on the button).
        meta = `${Math.round(inc.share * 100)} % · ${esc(look.t(inc.feedPrice === null ? 'eggs.fed' : 'eggs.warming'))}`;
        btn = `<button type="button" class="mu-btn btn-ad" data-action="ad-hatch-${i}" aria-disabled="${look.ad.busy()}">${esc(look.t('ad.hatch'))}</button>`;
      } else if (inc.feedPrice !== null) {
        meta = `${Math.round(inc.share * 100)} % · ${esc(look.t('eggs.food'))} ${money(inc.feedPrice, fmt)}`;
        btn = `<button type="button" class="mu-btn${mainOf('feed')}" data-action="egg-feed-${i}" aria-disabled="${coins + 1e-9 < inc.feedPrice}">${esc(look.t('eggs.feed'))}</button>`;
      } else {
        meta = `${Math.round(inc.share * 100)} % · ${esc(look.t('eggs.fed'))}`;
        btn = `<button type="button" class="mu-btn off" data-action="egg-wait-${i}" aria-disabled="true">${esc(look.t('eggs.warming'))}</button>`;
      }
      mine.push(`<div class="mu-card card-egg card-inc" data-incubator="${i}">${pic(look.eggPicture(inc.egg, tint))}<span class="mu-name">${name}</span><span class="mu-meta">${meta}</span>${btn}</div>`);
    });
    for (const m of shop.my)
      mine.push(
        `<div class="mu-card card-egg" data-my="${m.id}">${pic(look.eggPicture(m.id), `<i class="mu-count">×${m.count}</i>`)}<span class="mu-name">${esc(look.eggName(m.id))}</span><span class="mu-meta">${esc(look.t('eggs.waiting'))}</span></div>`,
      );
    for (const v of shop.eggs.filter((e) => e.section === 'free')) {
      const ready = v.freeIn === 0;
      mine.push(
        `<div class="mu-card card-egg" data-egg="${v.id}"><button type="button" class="mu-pic-btn" data-action="egg-card-${v.id}">${pic(look.eggPicture(v.id), v.fresh ? '<i class="mu-new"></i>' : '')}</button>` +
          `<span class="mu-name">${esc(look.t(`egg.short.${v.id}`))}</span><span class="mu-meta">${esc(ready ? look.t('eggs.free1') : look.t('eggs.in', { t: fmtTime(v.freeIn ?? 0) }))}</span>` +
          `<button type="button" class="mu-btn${ready ? ' good-text' : ' off'}" data-action="egg-free-${v.id}" aria-disabled="${!ready}">${esc(look.t('eggs.take'))}</button></div>`,
      );
    }
    // M5-02: two egg-ad cards in their own row «За видео» (the usability review: not mixed with the player's eggs); the head
    // counts the videos left today for both, the reward is on the button.
    const adCards = look.ad?.cards() ?? [];
    const ads = adCards.map((c) => {
      const can = c.left > 0 && c.waitSec <= 0;
      const meta = c.left <= 0 ? look.t('ad.tomorrow') : c.waitSec > 0 ? look.t('eggs.in', { t: fmtTime(c.waitSec) }) : look.t('ad.oneVideo');
      return (
        `<div class="mu-card card-egg card-ad" data-ad-egg="${c.id}">${pic(look.eggPicture(c.egg))}<span class="mu-name">${esc(look.eggName(c.egg))}</span><span class="mu-meta">${esc(meta)}</span>` +
        `<button type="button" class="mu-btn btn-ad${can ? '' : ' off'}" data-action="ad-egg-${c.id}" aria-disabled="${!can || look.ad!.busy()}">${esc(look.t('ad.egg'))}</button></div>`
      );
    });
    const busy = view.incubators.filter((i) => i.egg).length;
    let html = '';
    // T-05: the hint lives in the head row of «Мои яйца» — it never lies on a button of the list.
    const myHead = head(look.t('eggs.my'), look.t('eggs.slots', { n: busy, all: view.incubators.length }));
    const myHint = hint ? myHead.replace('</h3>', `</h3><b class="eggs-hint" data-eggs-hint>${esc(hint.text)}</b>`) : myHead;
    if (mine.length) html += myHint + `<div class="mu-grid" data-section="my">${mine.join('')}</div>`;
    if (ads.length) html += head(look.t('ad.eggsHead'), look.t('ad.left', { n: adCards[0]?.left ?? 0 })) + `<div class="mu-grid" data-section="ad">${ads.join('')}</div>`;
    for (const s of SECTIONS) {
      const list = shop.eggs.filter((e) => e.section === s && (s !== 'seasonal' || e.open));
      if (list.length) html += head(look.t(`eggs.${s}`), look.t('eggs.perEgg')) + `<div class="mu-grid" data-section="${s}">${list.map((e) => shopCard(e, fmt)).join('')}</div>`;
    }
    root.innerHTML = html;
    // T-05 (the usability review): the button the hint names wears the green frame of a hint (07 rule 16).
    if (hint?.target) root.querySelector<HTMLElement>(`[data-action^="${hint.target}"]:not([aria-disabled="true"])`)?.classList.add('is-hinted');
    root.querySelectorAll<HTMLElement>('[data-action^="egg-card-"]').forEach((b) => b.addEventListener('click', () => tab.show(b.dataset.action!.slice('egg-card-'.length))));
    root.querySelectorAll<HTMLElement>('[data-action^="egg-buy-"]').forEach((b) => b.addEventListener('click', () => game.buyEggs(b.dataset.action!.slice('egg-buy-'.length), 1)));
    root.querySelectorAll<HTMLElement>('[data-action^="egg-free-"]').forEach((b) => b.addEventListener('click', () => game.claimFree(b.dataset.action!.slice('egg-free-'.length))));
    root.querySelectorAll<HTMLElement>('[data-action^="egg-feed-"]').forEach((b) => b.addEventListener('click', () => game.feedEgg(Number(b.dataset.action!.slice('egg-feed-'.length)))));
    root.querySelectorAll<HTMLElement>('[data-action^="ad-egg-"]').forEach((b) =>
      b.addEventListener('click', () => {
        if (b.getAttribute('aria-disabled') !== 'true') look.ad?.egg(b.dataset.action!.slice('ad-egg-'.length));
      }),
    );
    root.querySelectorAll<HTMLElement>('[data-action^="ad-hatch-"]').forEach((b) =>
      b.addEventListener('click', () => {
        if (b.getAttribute('aria-disabled') !== 'true') look.ad?.hatch(Number(b.dataset.action!.slice('ad-hatch-'.length)));
      }),
    );
    root.querySelectorAll<HTMLElement>('[data-action^="egg-open-"]').forEach((b) => b.addEventListener('click', () => game.tapIncubator(Number(b.dataset.action!.slice('egg-open-'.length)))));
  }

  /** MU-11: the egg card — «←» and its name, the buy buttons, «Что внутри» with the rarity of every pet and its chance. */
  function renderCard(id: string): void {
    const egg = look.egg(id);
    const v = game.eggShop().eggs.find((e) => e.id === id);
    if (!egg || !v) {
      card = null;
      panel.hide();
      return;
    }
    const fmt = new Intl.NumberFormat(look.lang());
    const coins = game.state.coins;
    const next = `c:${id}:${look.lang()}:${v.open}:${v.freeIn === null ? '' : Math.ceil(v.freeIn)}:${MULTI.map((n) => coins + 1e-9 >= v.price * n).join('')}`;
    if (next === cardKey) return;
    cardKey = next;
    const odds = eggOdds(egg.chances, look.species);
    // FB-05: the odds before and after full care — care moves a share of every rarity one step up.
    const cared = careChances(egg.chances, look.careMax, egg.careTop ?? look.careTop);
    const top = (c: EggData['chances']): number => c.vip + c.exclusive;
    // FB-15 (the game design review): every pet's chance without care and with full care.
    const caredOdds = new Map(eggOdds(cared, look.species).map((o) => [o.species, o.chance]));
    let buttons: string;
    if (v.freeIn !== null)
      buttons = v.freeIn > 0 ? `<p class="mu-meta">${esc(look.t('eggs.in', { t: fmtTime(v.freeIn) }))}</p>` : `<button type="button" class="mu-btn main" data-action="egg-take">${esc(look.t('eggs.take'))}</button>`;
    else if (!v.open) buttons = `<p class="mu-meta">${esc(lockText(egg.unlock))}</p>`;
    else
      buttons = MULTI.map((n) => {
        const short = coins + 1e-9 < v.price * n;
        return `<button type="button" class="mu-btn${n === 1 ? ' main' : ''}${short ? ' off' : ''}" data-action="egg-buy-${n}" aria-disabled="${short}">${n === 1 ? esc(look.t('eggs.buy')) : `×${n}`} · ${money(v.price * n, fmt)}</button>`;
      }).join('');
    panel.card.innerHTML =
      `<div class="mu-back"><button type="button" class="mu-round" data-action="egg-back" aria-label="${esc(look.t('eggs.back'))}">‹</button><h2 class="egg-name">${esc(look.eggName(id))}</h2></div>` +
      `<div class="mu-hero"><span class="mu-pic"><img alt="" src="${look.eggPicture(id)}"></span><div><p class="mu-meta">${esc(look.t('eggs.hatchIn', { t: fmtTime(egg.hatchSec) }))}</p></div></div>` +
      `<div class="mu-buy">${buttons}</div>` +
      `<div class="mu-head"><h3>${esc(look.t('eggs.inside'))}</h3><span></span></div>` +
      `<p class="mu-meta care-odds" data-care-before="${top(egg.chances)}" data-care-after="${top(cared)}">${esc(look.t('eggs.care', { a: pct(top(egg.chances)), b: pct(top(cared)) }))}</p>` +
      `<div class="mu-grid cards-odds">${odds
        .map(
          (o) =>
            `<div class="mu-card rar card-odds" data-rarity="${o.rarity}" data-species="${o.species}" data-chance="${o.chance}"><span class="mu-pic"><img alt="" src="${look.portrait(o.species, o.rarity)}"></span>` +
            `<span class="mu-name">${esc(look.speciesName(o.species))}</span><span class="mu-line"><span>${rarityBadge(o.rarity, look.t(`rarity.${o.rarity}`))}</span><span class="mu-meta">${pct(o.chance)} → ${pct(caredOdds.get(o.species) ?? o.chance)}</span></span></div>`,
        )
        .join('')}</div>`;
    panel.card.querySelector('[data-action="egg-back"]')?.addEventListener('click', () => tab.show(null));
    panel.card.querySelector('[data-action="egg-take"]')?.addEventListener('click', () => game.claimFree(id));
    for (const n of MULTI) panel.card.querySelector(`[data-action="egg-buy-${n}"]`)?.addEventListener('click', () => game.buyEggs(id, n));
  }

  const tab: EggsTab = {
    render() {
      sheet.setTitle(look.t('eggs.title'));
      renderList();
      if (card && panel.isOpen()) renderCard(card);
    },
    clear() {
      if (root.firstChild) root.replaceChildren();
      key = '';
    },
    show(eggId) {
      card = eggId;
      cardKey = '';
      if (eggId) panel.show();
      else panel.hide();
      tab.render();
    },
  };
  return tab;
}
