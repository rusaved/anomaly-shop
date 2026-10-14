// What: game events → analytics (docs/06-analytics.md): first-minute funnel once per player, economy events, active-play minutes.
// Called by: src/main.ts (bind once to the game; tick with the runtime's game seconds).
// Keep: «player» events are guarded by a_* flags in the save; «session» ones by this module's memory; names only from events.ts.

import type { Game, GameEvent } from '../sim/game.ts';
import type { GameStore } from '../sim/store.ts';
import type { EventName } from './events.ts';
import type { Params } from './track.ts';

type Track = (name: EventName, params?: Params) => void;

const SESSION_MARKS: Array<[number, EventName]> = [
  [60, 'session_60s'],
  [180, 'session_180s'],
  [300, 'session_300s'],
  [600, 'session_600s'],
];

export interface Funnel {
  /** Active game seconds of this session (the runtime stops while paused). */
  tick(playedSec: number): void;
}

export function bindFunnel(game: Game, store: GameStore, track: Track): Funnel {
  const once = (flag: string, name: EventName, params?: Params): void => {
    const flags = store.state.flags;
    if (flags[flag]) return;
    flags[flag] = true;
    track(name, params);
  };
  game.events.on((e: GameEvent) => {
    if (e.type === 'eggTap') once('a_first_tap', 'first_tap');
    else if (e.type === 'hatched') {
      once('a_hatch_1', 'hatch_1');
      if (e.rarity !== 'common') track('rare_hatch', { rarity: e.rarity });
    } else if (e.type === 'fed' && e.levelUp) once('a_feed_1', 'feed_1');
    else if (e.type === 'sold') once('a_sale_1', 'sale_1', { haggled: e.haggled ? 1 : 0 });
    else if (e.type === 'eggBought') once('a_egg_buy_1', 'egg_buy_1');
    else if (e.type === 'chatReply' && (e.ctx === 'accept' || e.ctx === 'last')) track('haggle', { result: e.ctx === 'accept' ? 'up' : 'last' });
    else if (e.type === 'upgradeBought') {
      track('upgrade_buy', { id: e.id, level: e.level });
      if (e.id.startsWith('helper_')) once('a_helper_1', 'helper_1', { id: e.id });
    }
  });
  let next = 0;
  return {
    tick(playedSec) {
      while (next < SESSION_MARKS.length && playedSec >= SESSION_MARKS[next]![0]) {
        track(SESSION_MARKS[next]![1]);
        next += 1;
      }
    },
  };
}
