// What: window.__TEST__ for e2e and the playtester (docs/02-tech.md, section 10): state(), events, setTimeScale, runSim.
// Called by: src/main.ts only when __TEST_API__ is true (build:e2e); never part of a release.
// Keep: reads state and advances game time; it never grants coins or creatures outside grant() used by e2e only.

import type { Runtime } from '../core/runtime.ts';
import type { Platform } from '../platform/types.ts';
import type { I18n } from '../ui/i18n.ts';
import { events } from '../analytics/track.ts';

export interface TestState {
  platform: string;
  device: string;
  lang: string;
  controllable: boolean;
  pause: string[];
  elapsed: number;
  coins: number;
  creatures: unknown[];
}

export interface TestHooks {
  runtime: Runtime;
  platform: Platform;
  i18n: I18n;
  isControllable(): boolean;
  snapshot(): { coins: number; creatures: unknown[] };
}

export function installTestApi(hooks: TestHooks): void {
  const api = {
    state: (): TestState => ({
      platform: hooks.platform.name,
      device: hooks.platform.device,
      lang: document.documentElement.lang,
      controllable: hooks.isControllable(),
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
    /** Reads a translated string (to compare UI texts in e2e without hard-coding them). */
    t(key: string): string {
      return hooks.i18n.t(key);
    },
  };
  (window as unknown as { __TEST__: typeof api }).__TEST__ = api;
}
