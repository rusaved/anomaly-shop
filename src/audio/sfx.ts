// What: sound effects (placeholders until M5) synthesized by ZzFX from content/audio.json: tap, hatch, level up, coin, buy, fail.
// Called by: src/main.ts (create once, unlock on the first pointer down, play on game events, suspend on pause).
// Keep: ZzFX loads only after a user gesture (no autoplay warning); sound off, muted platform or pause = silence; never throws.

import type { AudioData, SfxName } from '../content/schemas.ts';

type ZzfxModule = typeof import('zzfx');

export interface Sfx {
  /** Loads the synth inside a user gesture; safe to call many times. */
  unlock(): void;
  play(name: SfxName): void;
  /** Sounds asked for so far, by name (test API: every action has its sound, M6-01), heard or not. */
  asked(): Partial<Record<SfxName, number>>;
  setSuspended(paused: boolean): void;
}

export function createSfx(data: AudioData, enabled: () => boolean): Sfx {
  let mod: ZzfxModule | null = null;
  let loading = false;
  let suspended = false;
  const cache = new Map<SfxName, number[]>();
  const counts: Partial<Record<SfxName, number>> = {};

  const context = (): AudioContext | null => {
    try {
      return mod?.ZZFX.audioContext ?? null;
    } catch {
      return null;
    }
  };

  return {
    unlock() {
      if (mod || loading || typeof AudioContext === 'undefined') return;
      loading = true;
      import('zzfx')
        .then((m) => {
          mod = m;
          mod.ZZFX.volume = data.volume;
          if (suspended) void context()?.suspend();
        })
        .catch(() => undefined)
        .finally(() => {
          loading = false;
        });
    },
    play(name) {
      counts[name] = (counts[name] ?? 0) + 1;
      if (!mod || suspended || !enabled()) return;
      try {
        let samples = cache.get(name);
        if (!samples) {
          samples = mod.ZZFX.buildSamples(...data.sfx[name].map((x) => (x === null ? undefined : x)));
          cache.set(name, samples);
        }
        mod.ZZFX.playSamples([samples]);
      } catch {
        /* no audio: the game goes on */
      }
    },
    asked: () => ({ ...counts }),
    setSuspended(paused) {
      suspended = paused;
      const ctx = context();
      if (!ctx) return;
      if (paused) void ctx.suspend().catch(() => undefined);
      else void ctx.resume().catch(() => undefined);
    },
  };
}
