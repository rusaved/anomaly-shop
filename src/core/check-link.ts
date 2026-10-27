// What: the producer's check link (N-05): ?fresh=1 — a new save without incognito; ?coins=N, ?hatched=N, ?deals=N, ?time=N — presets for each step of «Что проверить продюсеру», with ?fresh=1 too.
// Called by: src/main.ts at boot, only on the Pages link (debug build) and the VK stand-in (?mock=vk); tests/check-link.test.ts.
// Keep: pure; the Yandex archive and live VK/OK never load it (check-release, check:vk); numbers are clamped, junk is ignored.

import { newSave, type SaveData } from '../sim/state.ts';

export interface CheckLink {
  fresh: boolean;
  coins: number | null;
  /** Eggs already hatched (2 and more — the first minute is behind). */
  hatched: number | null;
  /** Deals already made (the haggle opens from the second one). */
  deals: number | null;
  /** Minutes of play already behind (gifts and events). */
  time: number | null;
}

const MAX = 1e9;
const num = (q: URLSearchParams, key: string): number | null => {
  const raw = q.get(key);
  if (raw === null || raw.trim() === '') return null;
  const n = Math.floor(Number(raw));
  return Number.isFinite(n) && n >= 0 ? Math.min(n, MAX) : null;
};

export function readCheckLink(search: string): CheckLink {
  const q = new URLSearchParams(search);
  return { fresh: q.get('fresh') === '1', coins: num(q, 'coins'), hatched: num(q, 'hatched'), deals: num(q, 'deals'), time: num(q, 'time') };
}

/** Any parameter of the check link in the address. */
export function hasCheckLink(link: CheckLink): boolean {
  return link.fresh || link.coins !== null || link.hatched !== null || link.deals !== null || link.time !== null;
}

/** PT-03: the address without the check link's parameters (a reload goes on with the save; ?mock=vk and the platform's stay). */
export function withoutCheckLink(href: string): string {
  const url = new URL(href);
  for (const k of ['fresh', 'coins', 'hatched', 'deals', 'time']) url.searchParams.delete(k);
  return url.pathname + url.search + url.hash;
}

/**
 * Whether the check link works in this build: the debug builds (the Pages link) and the VK stand-in in a plain tab; never a release
 * archive of Yandex, YouTube or a game VK or OK launched.
 */
export function checkLinkAllowed(debug: boolean, platform: string, vkStand: boolean): boolean {
  if (platform === 'vk') return vkStand;
  return debug && platform !== 'youtube';
}

/** The save the link asks for: new on ?fresh=1, then the presets on top (time is the caller's: it moves the clocks). */
export function presetSave(save: SaveData, link: CheckLink, now: number): SaveData {
  const st = link.fresh ? newSave(now) : save;
  if (link.coins !== null) st.coins = link.coins;
  const deals = link.deals;
  const hatched = Math.max(link.hatched ?? 0, deals ?? 0, deals ? 2 : 0);
  if (link.hatched !== null || deals) {
    st.stats.hatched = Math.max(st.stats.hatched, hatched);
    if (st.stats.hatched > 0) st.flags.ftue_starter = true;
    // Two hatches end the first minute (the game's own rule): the lessons are behind.
    if (st.stats.hatched >= 2) Object.assign(st.flags, { ftue_fed: true, ftue_bought: true, ftue_done: true });
  }
  if (deals !== null) {
    st.stats.deals = deals;
    st.stats.dealsAll = Math.max(st.stats.dealsAll ?? 0, deals);
    st.stats.xp = Math.max(st.stats.xp ?? 0, deals);
  }
  if (link.time !== null) for (const id of Object.keys(st.freeIn)) st.freeIn[id] = Math.max(0, (st.freeIn[id] ?? 0) - link.time * 60);
  return st;
}
