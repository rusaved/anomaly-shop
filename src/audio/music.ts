// What: the background music (P-07, Q-051 Б): the files of assets/audio/music by role (shop — the quiet loop of the shop) and a player that keeps it on only after the first tap, with «Музыка» on, never under a pause (an ad, a hidden tab, a window that pauses).
// Called by: src/main.ts (create once, unlock on the first pointer down, sync every frame); tests/music.test.ts (the pure part).
// Keep: no file in the folder — no track, silence without an error; a play() refused by the browser is silence too, never a throw.

const FILES = Object.entries(import.meta.glob('../../assets/audio/music/*.{mp3,ogg}', { query: '?url', import: 'default', eager: true }) as Record<string, string>).sort(([a], [b]) => a.localeCompare(b));

/** The roles of the music: the shop's loop (more roles later get their own files). */
export type MusicRole = 'shop';

/** The file of a role among `files` (path → url): `<role>.mp3|ogg`, else the first file that is no role's; null — silence. */
export function musicTrack(role: MusicRole, files: ReadonlyArray<readonly [string, string]> = FILES): string | null {
  const name = (path: string): string => path.slice(path.lastIndexOf('/') + 1).replace(/\.(mp3|ogg)$/, '');
  const own = files.find(([p]) => name(p) === role);
  if (own) return own[1];
  const roles = new Set<string>(['shop']);
  return files.find(([p]) => !roles.has(name(p)))?.[1] ?? null;
}

/** The music plays now: a track, the first tap made, «Музыка» on and no pause. */
export function musicOn(s: { track: string | null; unlocked: boolean; on: boolean; paused: boolean }): boolean {
  return s.track !== null && s.unlocked && s.on && !s.paused;
}

export interface Music {
  /** Inside the first user gesture: the loop may start (no autoplay before a tap). */
  unlock(): void;
  /** A pause of the game (an ad, a hidden tab, the pause window): silence until it ends. */
  setPaused(paused: boolean): void;
  /** Follows the «Музыка» switch and the platform's mute; cheap, every frame. */
  sync(): void;
  /** Test API: the file and whether it plays now. */
  status(): { track: string; playing: boolean };
}

export function createMusic(track: string | null, volume: number, enabled: () => boolean): Music {
  let el: HTMLAudioElement | null = null;
  let unlocked = false;
  let paused = false;
  let playing = false;
  const sync = (): void => {
    const want = musicOn({ track, unlocked, on: enabled(), paused });
    if (!el || want === playing) return;
    playing = want;
    try {
      if (want) {
        el.volume = volume;
        void el.play().catch(() => (playing = false));
      } else el.pause();
    } catch {
      playing = false;
    }
  };
  return {
    unlock() {
      if (unlocked || !track) return;
      unlocked = true;
      try {
        el = new Audio(track);
        el.loop = true;
        el.preload = 'auto';
      } catch {
        el = null;
      }
      sync();
    },
    setPaused(p) {
      paused = p;
      sync();
    },
    sync,
    status: () => ({ track: track ?? '', playing }),
  };
}
