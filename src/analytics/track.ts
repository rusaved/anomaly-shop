// What: analytics buffer (window.__ANALYTICS_BUFFER__, read by the test API) and Metrika goals in the yandex release.
// Called by: src/main.ts, src/ui/*, the platform through the injected track callback.
// Keep: every send inside try/catch; sends only when the profile allows analytics and the counter id is set.

import { EVENTS, type EventName } from './events.ts';

export type Params = Record<string, string | number>;

const KNOWN = new Set<string>(EVENTS);

function buffer(): Window['__ANALYTICS_BUFFER__'] {
  if (!Array.isArray(window.__ANALYTICS_BUFFER__)) window.__ANALYTICS_BUFFER__ = [];
  return window.__ANALYTICS_BUFFER__;
}

function sinceBoot(): number {
  return Math.round(performance.now() - (window.__T0 || 0));
}

export function track(name: EventName | string, params?: Params): void {
  if (!KNOWN.has(name)) {
    if (__DEBUG_TOOLS__) console.warn(`analytics: unknown event ${name}`);
    return;
  }
  const entry = params ? { name, t: sinceBoot(), params } : { name, t: sinceBoot() };
  buffer().push(entry);
  const counter = __GAME__.metrikaCounterId;
  if (!__GAME__.profile.analytics || counter <= 0) return;
  try {
    const ym = (window as unknown as { ym?: (id: number, action: string, goal: string, p?: Params) => void }).ym;
    ym?.(counter, 'reachGoal', name, params);
  } catch {
    /* analytics must never break the game */
  }
}

export function events(): ReadonlyArray<{ name: string; t: number; params?: Params }> {
  return buffer();
}
