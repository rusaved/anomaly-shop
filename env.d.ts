// Build-time flags (vite.config.ts `define`). In the release builds debug, studio and test API are false and
// the dynamic imports behind them are dropped from the bundle (docs/02-tech.md, section 9).
declare const __DEBUG_TOOLS__: boolean;
declare const __STUDIO__: boolean;
declare const __TEST_API__: boolean;
/** Milestone label for the producer link ("M1 · 2026-10-20 · 1a2b3c4"); empty string elsewhere. */
declare const __BUILD_LABEL__: string;
/** Platform profile of this build (docs/02-tech.md, section 6). */
declare const __PLATFORM__: 'yandex' | 'null' | 'youtube' | 'vk';
/** Public part of game.json for this profile; `community` is null in the youtube build. */
declare const __GAME__: {
  id: string;
  title: Record<'ru' | 'en', string>;
  languages: Array<'ru' | 'en'>;
  fallbackLanguage: 'ru' | 'en';
  /** Platform language codes that mean Russian (be, kk, uk, uz); everything else falls back to fallbackLanguage. */
  ruFallbackLanguages: string[];
  community: { telegram: string; vk: string; placement: string[] } | null;
  metrikaCounterId: number;
  profile: { name: 'yandex' | 'null' | 'youtube' | 'vk'; community: boolean; communityGift?: boolean; ads: boolean; payments: boolean; analytics: boolean; externalRequests: boolean };
};
/** ZzFX 1.4.0 ships no types; src/audio/sfx.ts imports it after a user gesture and plays cached samples on ZZFX.audioContext. */
declare module 'zzfx' {
  export const ZZFX: {
    sampleRate: number;
    volume: number;
    audioContext: AudioContext;
    buildSamples(...params: Array<number | undefined>): number[];
    playSamples(channels: number[][]): unknown;
  };
}
/** Set by the first inline script of index.html: boot time and the analytics buffer (docs/06-analytics.md). */
interface Window {
  __T0: number;
  __ANALYTICS_BUFFER__: Array<{ name: string; t: number; params?: Record<string, string | number> }>;
}
