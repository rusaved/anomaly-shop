// What: the save text for VK Storage (V-06): deflate + base64, cut into values of at most 4 096 characters under keys save_0…save_N, with a small head under `save` (parts, length, checksum); and back.
// Called by: src/platform/vk.ts; tests/vk.test.ts.
// Keep: pure — no bridge, no DOM; a broken or partial set of parts decodes to null (the local cache then wins).

import { deflateSync, inflateSync, strFromU8, strToU8 } from 'fflate';

/** VK Storage: a value is at most 4 096 characters, a key at most 100. */
export const VK_VALUE_MAX = 4096;
export const HEAD_KEY = 'save';
export const partKey = (i: number): string => `save_${i}`;

function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function fromBase64(text: string): Uint8Array {
  const s = atob(text);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

/** FNV-1a of the stored text: the head names it, so parts of two different saves never pass for one. */
function sum(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return h.toString(36);
}

/** The save as stored: the head and the parts, each value within `size` characters (≤ 4 096). */
export function packSave(text: string, size = VK_VALUE_MAX): { head: string; parts: string[] } {
  const body = toBase64(deflateSync(strToU8(text), { level: 9 }));
  const step = Math.max(1, Math.min(size, VK_VALUE_MAX));
  const parts: string[] = [];
  for (let i = 0; i < body.length; i += step) parts.push(body.slice(i, i + step));
  return { head: JSON.stringify({ v: 1, n: parts.length, len: body.length, sum: sum(body) }), parts };
}

/** How many parts the head names; 0 when there is no save or the head is broken. */
export function headParts(head: string | null | undefined): number {
  if (!head) return 0;
  try {
    const o = JSON.parse(head) as { v?: unknown; n?: unknown };
    return o && o.v === 1 && typeof o.n === 'number' && Number.isInteger(o.n) && o.n > 0 && o.n <= 900 ? o.n : 0;
  } catch {
    return 0;
  }
}

/** The save text back from its head and parts; null when anything is missing or broken. */
export function unpackSave(head: string | null | undefined, parts: ReadonlyArray<string | null | undefined>): string | null {
  const n = headParts(head);
  if (!n || parts.length < n) return null;
  try {
    const { len, sum: want } = JSON.parse(head!) as { len?: unknown; sum?: unknown };
    const body = parts.slice(0, n).join('');
    if ((typeof len === 'number' && body.length !== len) || (typeof want === 'string' && sum(body) !== want)) return null;
    return strFromU8(inflateSync(fromBase64(body)));
  } catch {
    return null;
  }
}
