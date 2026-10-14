// What: the first-minute script (docs/01, section 4): which hint shows now and what it points at; the first hint of each tab (UB-06).
// Called by: src/main.ts every frame (to src/ui/hints.ts), src/test-api (state), tests/ftue.test.ts.
// Keep: pure functions; the hint texts are ftue.<step> / ftue.tab.<tab> keys in i18n (6 words at most, validate:content).

import type { SaveData } from './state.ts';
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
const LIST: FtueTarget = { kind: 'el', selectors: ['[data-overlay="sale"] [data-action^="sale-list-"]', '[data-sheet="sales"] [data-action="sale-add"]', '[data-action="tab-sales"]'] };

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
  // UB-01: the egg shop is the home screen — the basic egg's tile, then «Buy» in its card.
  if (!state.flags[FLAGS.bought]) return { step: 'buyEgg', target: { kind: 'button', action: 'egg-buy-1|egg-card-egg_basic|tab-eggs' } };
  if (state.stats.hatched < 2 && eggAt >= 0) return { step: 'hatchRare', target: { kind: 'incubator', index: eggAt } };
  return null;
}

/**
 * UB-06: the first visit of a tab — one hint at its main thing, the tab title when the tab is empty.
 * «eggs» is the home screen: the first minute above is its hint.
 */
export const TAB_HINTS: Record<string, string[]> = {
  market: ['[data-sheet="market"] .card-lot:not(.sold)'],
  inventory: ['[data-sheet="inventory"] [data-action^="inv-list-"]', '[data-sheet="inventory"] .tile'],
  sales: ['[data-sheet="sales"] [data-action="sale-add"]', '[data-sheet="sales"] [data-action^="sale-"]'],
  chats: ['[data-sheet="chats"] .chat-row:not(.closed)'],
  shop: ['[data-overlay="upgrades"] [data-action="buy-upgrade"]'],
  season: [],
};

export function tabHint(tab: string): FtueHint | null {
  const selectors = TAB_HINTS[tab];
  if (!selectors) return null;
  const title = tab === 'shop' ? '[data-overlay="upgrades"] h2' : `[data-sheet="${tab}"] .sheet-title`;
  return { step: 'tab', key: `ftue.tab.${tab}`, target: { kind: 'el', selectors: [...selectors, title] } };
}
