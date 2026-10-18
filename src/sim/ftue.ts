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
const LIST: FtueTarget = { kind: 'el', selectors: ['[data-detail="sale"] [data-action^="sale-list-"]', '[data-sheet="sales"] [data-action="sale-add"]', '[data-action="tab-sales"]'] };

export function ftueHint(state: SaveData, view: GameView): FtueHint | null {
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
  // MU-04: the price button of the basic egg on «Яйца» (the tab first when another screen is open).
  if (!state.flags[FLAGS.bought]) return { step: 'buyEgg', target: { kind: 'button', action: 'egg-buy-egg_basic|tab-eggs' } };
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
 * UB-06: the first visit of a tab — one hint at its main thing, the tab title when the tab is empty.
 * «home» (MU-02: «Лавка») is the home screen: the first minute above is its hint.
 */
export const TAB_HINTS: Record<string, string[]> = {
  eggs: ['[data-sheet="eggs"] [data-action^="egg-buy-"]'],
  market: ['[data-sheet="market"] .card-lot:not(.sold)'],
  inventory: ['[data-sheet="inventory"] [data-action^="inv-list-"]', '[data-sheet="inventory"] .tile'],
  sales: ['[data-sheet="sales"] [data-action="sale-add"]', '[data-sheet="sales"] [data-action^="sale-"]'],
  chats: ['[data-sheet="chats"] .chat-row:not(.closed)'],
  shop: ['[data-sheet="shop"] [data-action="buy-upgrade"]'],
  season: [],
};

export function tabHint(tab: string): FtueHint | null {
  const selectors = TAB_HINTS[tab];
  if (!selectors) return null;
  const title = `[data-sheet="${tab}"] .sheet-title`;
  return { step: 'tab', key: `ftue.tab.${tab}`, target: { kind: 'el', selectors: [...selectors, title] } };
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
