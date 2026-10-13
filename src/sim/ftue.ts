// What: the first-minute script (docs/01, section 4): which hint shows now and what it points at, from the save and the game view.
// Called by: src/ui/hints.ts every frame, src/test-api (state), tests/ftue.test.ts.
// Keep: pure function of state and view; the hint texts are ftue.<step> keys in i18n (6 words at most, validate:content).

import type { SaveData } from './state.ts';
import { FLAGS, type GameView } from './game.ts';

export type FtueStep = 'tapEgg' | 'feed' | 'waitCustomer' | 'sell' | 'buyEgg' | 'hatchRare';

export type FtueTarget = { kind: 'incubator'; index: number } | { kind: 'slot'; index: number } | { kind: 'queue' } | { kind: 'button'; action: string };

export interface FtueHint {
  step: FtueStep;
  target: FtueTarget;
}

export function ftueHint(state: SaveData, view: GameView): FtueHint | null {
  if (state.flags[FLAGS.done]) return null;
  const eggAt = view.incubators.findIndex((i) => i.egg);
  if (state.stats.hatched === 0) return eggAt >= 0 ? { step: 'tapEgg', target: { kind: 'incubator', index: eggAt } } : null;
  if (!state.flags[FLAGS.fed] && view.creatures.length > 0) {
    const index = Math.max(0, view.creatures.findIndex((c) => c.uid === view.selected));
    return { step: 'feed', target: { kind: 'slot', index } };
  }
  if (state.stats.deals === 0) {
    if (view.deal?.uid) return { step: 'sell', target: { kind: 'button', action: 'sell' } };
    return view.creatures.length > 0 ? { step: 'waitCustomer', target: { kind: 'queue' } } : null;
  }
  if (!state.flags[FLAGS.bought]) return { step: 'buyEgg', target: { kind: 'button', action: 'buy-egg' } };
  if (state.stats.hatched < 2 && eggAt >= 0) return { step: 'hatchRare', target: { kind: 'incubator', index: eggAt } };
  return null;
}
