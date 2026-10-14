// What: who says what and when (docs/01b, sections 4.1–4.2; M2-17): creature lines (tap, hungry, level, max, farewell) and customer lines by type.
// Called by: src/main.ts (onEvent for every game event, tick with game seconds); the scene draws the bubbles (shop.speak).
// Keep: lines from content/lines.json through pickLine (no repeats of the last few per pool); one tap line per tapCooldownSec; rolls use Math.random (ui).

import type { CreatureContext, CustomerContext, LinesData } from '../content/schemas.ts';
import type { GameEvent, GameView } from '../sim/game.ts';
import { pickLine } from '../sim/lines.ts';

export interface ChatterDeps {
  lines: LinesData;
  lang(): 'ru' | 'en';
  speak(who: { uid: string } | { customerId: number }, line: string): void;
  view(): GameView;
}

export interface Chatter {
  onEvent(e: GameEvent): void;
  /** dt game seconds: the hungry lines. */
  tick(dt: number): void;
}

/** Seconds between two hungry lines of the whole shop (one creature at a time). */
const HUNGRY_GAP_SEC = 12;

export function createChatter(deps: ChatterDeps): Chatter {
  const { lines } = deps;
  const recent = new Map<string, number[]>();
  let clock = 0;
  let lastTap = -Infinity;
  let lastHungry = 0;
  const fedAt = new Map<string, number>();

  function line(pool: Array<{ ru: string; en: string }> | undefined, key: string): string {
    if (!pool?.length) return '';
    const seen = recent.get(key) ?? [];
    const i = pickLine(pool.length, seen, lines.noRepeat, Math.random());
    seen.push(i);
    if (seen.length > 6) seen.shift();
    recent.set(key, seen);
    return pool[i]?.[deps.lang()] ?? '';
  }
  const creature = (uid: string, species: string, ctx: CreatureContext): void => {
    const text = line(lines.creatures[species]?.[ctx], `c:${species}:${ctx}`);
    if (text) deps.speak({ uid }, text);
  };
  const customer = (id: number, type: string, ctx: CustomerContext): void => {
    const text = line(lines.customers[type]?.[ctx], `p:${type}:${ctx}`);
    if (text) deps.speak({ customerId: id }, text);
  };

  return {
    onEvent(e) {
      if (e.type === 'fed') {
        fedAt.set(e.uid, clock);
        const species = deps.view().creatures.find((c) => c.uid === e.uid)?.species;
        if (!species) return;
        if (e.levelUp) creature(e.uid, species, e.maxed ? 'max' : 'levelUp');
        else if (e.by === 'tap' && clock - lastTap >= lines.tapCooldownSec) {
          lastTap = clock;
          creature(e.uid, species, 'tap');
        }
      } else if (e.type === 'hatched') fedAt.set(e.uid, clock);
      else if (e.type === 'sold') {
        creature(e.uid, e.species, 'sold');
        if (!e.liked) customer(e.customerId, e.customer, 'notTheirs');
        else if (e.rarity !== 'common') customer(e.customerId, e.customer, 'rare');
      } else if (e.type === 'customerArrived') customer(e.id, e.customer, 'arrive');
      else if (e.type === 'chatReply') {
        // UB-05: the buyer answered in the chat — the same person says it at the door.
        const type = deps.view().queue.find((q) => q.id === e.id)?.customer;
        if (type && (e.ctx === 'accept' || e.ctx === 'last')) customer(e.id, type, e.ctx === 'accept' ? 'haggleUp' : 'offer');
      }
    },
    tick(dt) {
      clock += dt;
      if (clock - lastHungry < HUNGRY_GAP_SEC) return;
      const view = deps.view();
      const hungry = view.creatures.find((c) => {
        if (!fedAt.has(c.uid)) fedAt.set(c.uid, clock);
        return c.level < c.maxLevel && clock - (fedAt.get(c.uid) ?? clock) >= lines.hungrySec;
      });
      if (!hungry) return;
      lastHungry = clock;
      fedAt.set(hungry.uid, clock);
      creature(hungry.uid, hungry.species, 'hungry');
    },
  };
}
