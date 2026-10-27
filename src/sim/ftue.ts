// What: the first-minute script (docs/01, section 4): which hint shows now and what it points at; the first hint of each tab (UB-06); which tabs are open (Q-026 B).
// Called by: src/main.ts every frame (to src/ui/hints.ts), src/test-api (state), tests/ftue.test.ts.
// Keep: pure functions; the hint texts are ftue.<step> / ftue.tab.<tab> keys in i18n (6 words at most, validate:content).

import type { SaveData } from './state.ts';
import type { TabUnlockData } from '../content/schemas.ts';
import { FLAGS, type GameView } from './game.ts';

export type FtueStep = 'tapEgg' | 'list' | 'feed' | 'waitCustomer' | 'sell' | 'buyEgg' | 'hatchRare' | 'tab';

/**
 * A button target names data-action hooks; «a|b» — the first one on screen (a card button, else the tile that opens the card).
 * An element target lists selectors the same way, first on screen wins (UB-06: the chat row, a tab's main thing).
 */
export type FtueTarget = { kind: 'incubator'; index: number } | { kind: 'slot'; index: number } | { kind: 'queue' } | { kind: 'button'; action: string } | { kind: 'el'; selectors: string[] };

export interface FtueHint {
  step: FtueStep;
  target: FtueTarget;
  /** The i18n key of the text when it is not ftue.<step> (UB-06: ftue.tab.<tab>). */
  key?: string;
}

/** UB-06: the steps that lead the player through a tab (the open chat, the sell button; the free place of «My sales»). */
const SELL: FtueTarget = { kind: 'el', selectors: ['[data-action="chat-sell"]', '[data-sheet="chats"] .chat-row:not(.closed)', '[data-action="tab-chats"]'] };
// The round of fixes (the usability recheck): on «Лавка» the «+» of a free place of the «Витрина» before the tab — the arrow stays near.
const LIST: FtueTarget = { kind: 'el', selectors: ['[data-detail="sale"] [data-action^="sale-go-"]', '[data-detail="sale"] [data-action^="sale-list-"]', '[data-sheet="sales"] [data-action="sale-add"]', '[data-action="shelf-add"]', '[data-action="tab-sales"]'] };

/** freeEgg — a free egg ready to take now (eggShop: freeIn 0 and open), or null: the «new egg» step leads to it, not to a purchase. */
export function ftueHint(state: SaveData, view: GameView, freeEgg: string | null = null): FtueHint | null {
  if (state.flags[FLAGS.done]) return null;
  const eggAt = view.incubators.findIndex((i) => i.egg);
  if (state.stats.hatched === 0) return eggAt >= 0 ? { step: 'tapEgg', target: { kind: 'incubator', index: eggAt } } : null;
  if (state.stats.deals === 0) {
    // UB-05: a buyer wrote — the only way to sell is the chat (no feeding hint over an offer, UB-06).
    if (view.queue.length > 0) return { step: 'sell', target: SELL };
    if (!state.flags[FLAGS.fed] && view.creatures.length > 0) {
      const index = Math.max(0, view.creatures.findIndex((c) => c.uid === view.selected));
      return { step: 'feed', target: { kind: 'slot', index } };
    }
    if (view.creatures.length > 0) return { step: 'waitCustomer', target: { kind: 'queue' } };
    return view.inventory.length > 0 ? { step: 'list', target: LIST } : null;
  }
  // MU-04: the price button of the basic egg on «Яйца» (the tab first when another screen is open); круг правок FB-3 п. 6: a free gift egg
  // ready to take comes first — «Забрать» of it.
  if (!state.flags[FLAGS.bought]) {
    if (freeEgg) return { step: 'buyEgg', key: 'ftue.freeEgg', target: { kind: 'button', action: `egg-free-${freeEgg}|tab-eggs` } };
    // M6-02: a first deal below the egg's price brings the rescue egg (or a door egg comes): an egg already in the incubator is
    // tapped first, its pet goes on sale and the buyer gets an answer — the «buy» step never points at an egg the player cannot pay for
    // while the way out is in the shop (sim:balance F10 found the dead end).
    if (eggAt >= 0) return { step: 'tapEgg', target: { kind: 'incubator', index: eggAt } };
    if (view.queue.length > 0) return { step: 'sell', target: SELL };
    if (view.creatures.length === 0 && view.inventory.length > 0) return { step: 'list', target: LIST };
    return { step: 'buyEgg', target: { kind: 'button', action: 'egg-buy-egg_basic|tab-eggs' } };
  }
  if (state.stats.hatched < 2 && eggAt >= 0) return { step: 'hatchRare', target: { kind: 'incubator', index: eggAt } };
  return null;
}

/**
 * M4-09 (the playtester of M4): after the first minute, a shelf left empty with pets waiting in the inventory stalls the loop —
 * once the player has been idle for a while, «List it» points at «My sales» again.
 */
export function shelfHint(state: SaveData, view: GameView, idleSec: number, afterSec: number): FtueHint | null {
  if (!state.flags[FLAGS.done] || idleSec < afterSec) return null;
  if (view.creatures.length > 0 || view.inventory.length === 0) return null;
  return { step: 'list', target: LIST };
}

/**
 * P-08 (ревизор геймдизайна, повтор): after the first minute an unanswered buyer comes before any other call — «Продай покупателю» on the
 * chat (as in the lesson), once the player has been idle a moment.
 */
export function chatHint(state: SaveData, view: GameView, idleSec: number, afterSec: number): FtueHint | null {
  if (!state.flags[FLAGS.done] || idleSec < afterSec || view.queue.length === 0) return null;
  return { step: 'sell', target: SELL };
}

/**
 * P-04 (Q-056 Б п. 1): after the first minute, an empty incubator while the player is idle — «Купи новое яйцо» on it, but only when a tap
 * there buys the egg (coins for the basic egg, no egg of «Мои яйца» waiting, none ready to open).
 */
export function eggHint(state: SaveData, view: GameView, idleSec: number, afterSec: number, eggPrice: number): FtueHint | null {
  if (!state.flags[FLAGS.done] || idleSec < afterSec || view.queue.length > 0) return null;
  if (state.coins + 1e-9 < eggPrice || Object.keys(state.myEggs).length > 0 || view.incubators.some((i) => i.ready)) return null;
  const index = view.incubators.findIndex((i) => !i.egg);
  return index < 0 ? null : { step: 'buyEgg', target: { kind: 'incubator', index } };
}

/**
 * P-08 (ревизор геймдизайна): after the first minute, before any upgrade, an idle player with coins for one — «Купи улучшение» on the
 * cheapest open price (or the way to the list).
 */
export function upgradeHint(state: SaveData, idleSec: number, afterSec: number, affordable: boolean): FtueHint | null {
  if (!state.flags[FLAGS.done] || idleSec < afterSec || !affordable || Object.values(state.upgrades).some((n) => n > 0)) return null;
  return { step: 'tab', key: 'ftue.upgrade', target: { kind: 'el', selectors: ['[data-action="buy-upgrade"]', '[data-action="open-upgrades"]', '[data-action="upgrades"]'] } };
}

/**
 * P-04 (Q-056 Б п. 2): the «rare egg» step on «Яйца» stands on «Открыть» of its incubator's row (the incubator itself is off screen there);
 * P-08 (the bot of the first minute): «Тапни яйцо» too — the green dot of «Яйца» brings a new player there before the first egg.
 */
export function onEggsTab(hint: FtueHint | null): FtueHint | null {
  if ((hint?.step !== 'hatchRare' && hint?.step !== 'tapEgg') || hint.target.kind !== 'incubator') return hint;
  // The row has no «Открыть» yet (the egg still warms): the hint points back at «Лавка».
  return { ...hint, target: { kind: 'button', action: `egg-open-${hint.target.index}|tab-home` } };
}

/**
 * UB-06: the first visit of a tab — one hint at its main thing, the tab title when the tab is empty.
 * «home» (MU-02: «Лавка») is the home screen: the first minute above is its hint.
 */
export const TAB_HINTS: Record<string, string[]> = {
  eggs: ['[data-sheet="eggs"] [data-action^="egg-buy-"]'],
  market: ['[data-sheet="market"] .card-lot:not(.sold)'],
  inventory: ['[data-sheet="inventory"] [data-action^="inv-list-"]', '[data-sheet="inventory"] .tile'],
  sales: ['[data-sheet="sales"] [data-action="sale-add"]', '[data-sheet="sales"] [data-action^="sale-off-"]'],
  chats: ['[data-sheet="chats"] .chat-row:not(.closed)'],
  shop: ['[data-sheet="shop"] [data-action="buy-upgrade"]'],
  season: [],
};

export function tabHint(tab: string): FtueHint | null {
  const selectors = TAB_HINTS[tab];
  if (!selectors) return null;
  // MU-02: a tab has no title row — an empty tab's hint stands at its section head or its segments.
  // W (the usability review): «Яйца» is never empty — with no egg to buy (no coins) «Купи яйцо» on «МОИ ЯЙЦА» covered «Покормить»
  // of the player's own egg; there it says nothing.
  const head = tab === 'eggs' ? [] : [`[data-sheet="${tab}"] .mu-seg`, `[data-sheet="${tab}"] .mu-head`];
  return { step: 'tab', key: `ftue.tab.${tab}`, target: { kind: 'el', selectors: [...selectors, ...head] } };
}

/** What a tab's unlock (Q-026 B, content/nav.json) looks at. */
export interface TabFacts {
  hatched: number;
  /** Buyers that ever wrote (open or closed chats). */
  chats: number;
  level: number;
  /** Some upgrade is affordable now. */
  upgrade: boolean;
}

/** M4-00, Q-026 B: tabs open step by step; once open a tab stays open (the caller keeps a flag). */
export function tabUnlocked(u: TabUnlockData, f: TabFacts): boolean {
  if (u.type === 'always') return true;
  if (u.type === 'hatched') return f.hatched > 0;
  if (u.type === 'chat') return f.chats > 0;
  if (u.type === 'level') return f.level >= u.n;
  if (u.type === 'upgrade') return f.upgrade || f.level >= u.n;
  return false;
}
