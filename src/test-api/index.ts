// What: window.__TEST__ for e2e and the playtester (docs/02-tech.md, section 10): state(), events, setTimeScale, runSim.
// Called by: src/main.ts only when __TEST_API__ is true (build:e2e); never part of a release.
// Keep: reads state and advances game time; it never grants coins or creatures outside grant() used by e2e only.

import type { Runtime } from '../core/runtime.ts';
import type { Platform } from '../platform/types.ts';
import type { I18n } from '../ui/i18n.ts';
import { events } from '../analytics/track.ts';
import type { ShopAnchors } from '../scene/shop.ts';

export interface TestState {
  platform: string;
  device: string;
  lang: string;
  controllable: boolean;
  fps: number;
  pause: string[];
  elapsed: number;
  coins: number;
  creatures: unknown[];
}

export interface TestHooks {
  runtime: Runtime;
  platform: Platform;
  i18n: I18n;
  fps(): number;
  isControllable(): boolean;
  snapshot(): { coins: number; creatures: unknown[] } & Record<string, unknown>;
  /** Stage coordinates of the tappable shop pieces. */
  anchors(): ShopAnchors | null;
  /** e2e only: coins for flows that are not under test (shop purchases). */
  grant(coins: number): void;
  /** e2e only: a toast through the same queue as the game's (M3-18). */
  toast?(text: string): void;
  /** e2e only (M4-21): starts a random event by its id now, when it may come. */
  event?(id: string): boolean;
  /** e2e and the shots of 07 only: «Вылупился!» for a pet the save already has (its rarity frame without luck). */
  hatch?(uid: string, egg: string): boolean;
}

export function installTestApi(hooks: TestHooks): void {
  const api = {
    state: (): TestState => ({
      platform: hooks.platform.name,
      device: hooks.platform.device,
      lang: document.documentElement.lang,
      controllable: hooks.isControllable(),
      fps: Math.round(hooks.fps()),
      pause: hooks.runtime.pause.reasons(),
      elapsed: hooks.runtime.elapsed(),
      ...hooks.snapshot(),
    }),
    get events() {
      return events();
    },
    setTimeScale(k: number): void {
      hooks.runtime.timeScale = k;
    },
    runSim(sec: number): number {
      return hooks.runtime.runSim(sec);
    },
    /** Page coordinates of the shop pieces (incubators, showcase slots, queue spots) to tap them like a player. */
    targets() {
      const a = hooks.anchors();
      const canvas = document.getElementById('scene');
      if (!a || !canvas) return null;
      const r = canvas.getBoundingClientRect();
      const pt = (x: number, y: number) => ({ x: Math.round(r.left + x), y: Math.round(r.top + y) });
      return {
        incubators: a.incubators.map((s) => pt(s.x, s.y)),
        slots: a.slots.map((s) => pt(s.x + s.w / 2, s.y + s.h / 2)),
        queue: a.queue.map((s) => pt(s.x, s.y)),
        eventCoins: a.eventCoins.map((c) => ({ id: c.id, ...pt(c.x, c.y) })),
        eventThing: a.eventThing ? pt(a.eventThing.x, a.eventThing.y) : null,
        caption: a.caption,
        things: {
          sign: pt(a.things.sign.x + a.things.sign.w / 2, a.things.sign.y + a.things.sign.h / 2),
          door: pt(a.things.door.x + a.things.door.w / 2, a.things.door.y + a.things.door.h / 2),
          lamp: pt(a.things.lamp.x, a.things.lamp.y),
        },
      };
    },
    grant(coins: number): void {
      hooks.grant(coins);
    },
    event(id: string): boolean {
      return hooks.event?.(id) ?? false;
    },
    toast(text: string): void {
      hooks.toast?.(text);
    },
    /** «Вылупился!» for a pet of the save (the egg for its «1 из N яиц» line). */
    hatch(uid: string, egg = 'egg_gold'): boolean {
      return hooks.hatch?.(uid, egg) ?? false;
    },
    /** Reads a translated string (to compare UI texts in e2e without hard-coding them). */
    t(key: string): string {
      return hooks.i18n.t(key);
    },
  };
  (window as unknown as { __TEST__: typeof api }).__TEST__ = api;
}
