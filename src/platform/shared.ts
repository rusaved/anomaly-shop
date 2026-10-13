// What: pure helpers shared by the profiles: language mapping, device guess, caps from game.json, newest-save pick.
// Called by: src/platform/yandex.ts, youtube.ts, null.ts; tests/platform.test.ts.
// Keep: no DOM and no SDK here; every function takes its inputs as arguments.

import type { DeviceType, Lang, PlatformCaps } from './types.ts';

/** Maps a platform or browser language code to one of the game languages. */
export function pickLanguage(
  code: string | null | undefined,
  ruFallback: readonly string[],
  languages: readonly Lang[],
  fallback: Lang,
): Lang {
  const base = (code ?? '').toLowerCase().split(/[-_]/)[0] ?? '';
  if ((languages as readonly string[]).includes(base)) return base as Lang;
  if (ruFallback.includes(base) && languages.includes('ru')) return 'ru';
  return fallback;
}

export interface DeviceHints {
  userAgent: string;
  touchPoints: number;
  width: number;
  height: number;
}

/** Desktop, mobile or tablet from the user agent and touch points (iPadOS reports a desktop agent with touch). */
export function guessDevice(h: DeviceHints): DeviceType {
  const ua = h.userAgent;
  const android = /Android/i.test(ua);
  if (/iPad|Tablet/i.test(ua) || (android && !/Mobile/i.test(ua))) return 'tablet';
  if (/iPhone|iPod|Mobile/i.test(ua) || android) return 'mobile';
  if (h.touchPoints > 1) return Math.min(h.width, h.height) < 600 ? 'mobile' : 'tablet';
  return 'desktop';
}

export function profileCaps(): PlatformCaps {
  const p = __GAME__.profile;
  return { ads: p.ads, payments: p.payments, community: p.community, analytics: p.analytics };
}

export function gameLanguage(code: string | null | undefined): Lang {
  return pickLanguage(code, __GAME__.ruFallbackLanguages, __GAME__.languages, __GAME__.fallbackLanguage);
}

/** rev and savedAt of a save string; null when the text is not a save (docs/02-tech.md, section 7). */
export function saveStamp(text: string | null | undefined): { rev: number; savedAt: number } | null {
  if (!text) return null;
  try {
    const o = JSON.parse(text) as { rev?: unknown; savedAt?: unknown } | null;
    if (o && typeof o === 'object' && typeof o.rev === 'number' && Number.isFinite(o.rev)) {
      return { rev: o.rev, savedAt: typeof o.savedAt === 'number' ? o.savedAt : 0 };
    }
  } catch {
    /* corrupted text: skipped */
  }
  return null;
}

/** The candidate with the biggest rev, then the latest savedAt; corrupted candidates lose. */
export function pickNewestSave(candidates: ReadonlyArray<string | null | undefined>): string | null {
  let best: string | null = null;
  let bestStamp: { rev: number; savedAt: number } | null = null;
  for (const c of candidates) {
    const s = saveStamp(c);
    if (!s || !c) continue;
    if (!bestStamp || s.rev > bestStamp.rev || (s.rev === bestStamp.rev && s.savedAt > bestStamp.savedAt)) {
      best = c;
      bestStamp = s;
    }
  }
  return best;
}

/** Calls fn once; later calls are ignored (ready(), gameReady()). */
export function once(fn: () => void): () => void {
  let done = false;
  return () => {
    if (done) return;
    done = true;
    fn();
  };
}
