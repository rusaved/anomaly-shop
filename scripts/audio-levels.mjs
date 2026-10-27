// `node scripts/audio-levels.mjs [out.txt]` (H-07): how loud the music of the shop plays next to the sounds of actions.
// The sounds: ZzFX samples of content/audio.json at its master volume (what sfx.ts plays); the music: assets/audio/music/shop.mp3 decoded
// by ffmpeg, times audio.json music.volume (what music.ts plays). Loudness — RMS over the sound itself (its own length) in dBFS; the music
// should stay 6–10 dB under the sounds of actions (H-07). Needs ffmpeg on the PATH (the cloud session has it); no ffmpeg — exit 2.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const audio = JSON.parse(readFileSync(resolve(root, 'content/audio.json'), 'utf8'));
// ZzFX makes its AudioContext at load: a stub is enough to build samples in Node.
globalThis.AudioContext = class {};
const { ZZFX } = await import('zzfx');

const db = (x) => (x > 0 ? 20 * Math.log10(x) : -Infinity);
const rms = (a) => Math.sqrt(a.reduce((s, x) => s + x * x, 0) / Math.max(1, a.length));
/** RMS over the loud part of a sound (from its first to its last sample above 1 % of its peak): a click is judged by its body. */
const body = (a) => {
  const peak = Math.max(...a.map(Math.abs));
  let i = 0;
  let j = a.length - 1;
  while (i < j && Math.abs(a[i]) < peak * 0.01) i++;
  while (j > i && Math.abs(a[j]) < peak * 0.01) j--;
  return a.slice(i, j + 1);
};

const ACTIONS = ['tap', 'eggTap', 'coin', 'buy', 'press', 'upgrade', 'hatch', 'levelUp'];
const rows = [];
for (const name of ACTIONS) {
  const p = audio.sfx[name];
  if (!p) continue;
  const s = Array.from(ZZFX.buildSamples(...p.map((x) => (x === null ? undefined : x)))).map((x) => x * audio.volume);
  rows.push({ name, rms: db(rms(body(s))), peak: db(Math.max(...s.map(Math.abs))) });
}

let pcm;
try {
  pcm = execFileSync('ffmpeg', ['-v', 'error', '-i', resolve(root, 'assets/audio/music/shop.mp3'), '-ac', '1', '-f', 'f32le', '-'], { maxBuffer: 64 * 1024 * 1024 });
} catch {
  console.error('audio-levels: ffmpeg is needed');
  process.exit(2);
}
const music = new Float32Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.byteLength / 4));
let sum = 0;
let peak = 0;
for (const x of music) {
  sum += x * x;
  peak = Math.max(peak, Math.abs(x));
}
const vol = audio.music.volume;
const musicRms = db(Math.sqrt(sum / music.length) * vol);
const actions = rows.reduce((s, r) => s + r.rms, 0) / rows.length;
const gap = actions - musicRms;
const lines = [
  `H-07 громкость: музыка лавки × ${vol} против звуков действий × ${audio.volume} (RMS по самому звуку, dBFS)`,
  ...rows.map((r) => `  ${r.name.padEnd(8)} RMS ${r.rms.toFixed(1)} дБ, пик ${r.peak.toFixed(1)} дБ`),
  `  звуки действий в среднем: ${actions.toFixed(1)} дБ`,
  `  музыка: RMS ${musicRms.toFixed(1)} дБ, пик ${db(peak * vol).toFixed(1)} дБ (файл ${db(Math.sqrt(sum / music.length)).toFixed(1)} дБ RMS)`,
  `  музыка тише звуков действий на ${gap.toFixed(1)} дБ (цель 6–10) — ${gap >= 6 && gap <= 10 ? 'в цели' : 'ВНЕ цели'}`,
];
console.log(lines.join('\n'));
if (process.argv[2]) writeFileSync(resolve(process.argv[2]), lines.join('\n') + '\n');
process.exit(gap >= 6 && gap <= 10 ? 0 : 1);
