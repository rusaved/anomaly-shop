// `npm run check-release` (docs/02-tech.md, section 9): eight checks of the Yandex release archive by docs/03 (BLD, SDK, SND, LOC);
// report in docs/evidence/release-check.txt. Green on the archive of `build`, red on the archive of `build:playtest`.
// RD-05: the archive ≤ 30 MB, not one external address (only /sdk.js, Metrica and the two community links the player opens),
// /sdk.js before the game's code, sound only through Web Audio, the language keys of ru and en the same and filled.
//   node scripts/check-release.mjs [archive.zip] [--report <file>] [--content <dir with i18n/ and *.json>]  (tests/check-release.test.ts)
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, extname } from 'node:path';
import { gzipSync } from 'node:zlib';
import { unzipSync } from 'fflate';

const root = resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const zipArg = args.find((a) => a.endsWith('.zip'));
const releaseDir = resolve(root, 'release');
const zipPath = zipArg
  ? resolve(zipArg)
  : (existsSync(releaseDir)
      ? readdirSync(releaseDir)
          .filter((f) => f.endsWith('.zip') && !f.includes('-playtest') && !f.includes('-youtube'))
          .map((f) => join(releaseDir, f))
          .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0]
      : undefined);
if (!zipPath || !existsSync(zipPath)) {
  console.error('check-release: no archive found — run npm run pack first');
  process.exit(1);
}
const reportPath = resolve(root, opt('report', 'docs/evidence/release-check.txt'));
const contentDir = resolve(root, opt('content', 'content'));
const stop = JSON.parse(readFileSync(resolve(root, 'scripts/stopwords.json'), 'utf8'));

const zipBytes = readFileSync(zipPath);
const entries = unzipSync(new Uint8Array(zipBytes));
const files = Object.entries(entries).filter(([name]) => !name.endsWith('/'));
const text = (data) => Buffer.from(data).toString('utf8');
const lines = [];
const results = [];
let failed = 0;
const check = (n, title, ok, details = []) => {
  results.push({ n, title, ok });
  if (!ok) failed++;
  lines.push(`${ok ? 'PASS' : 'FAIL'}  ${n}. ${title}`);
  for (const d of details) lines.push(`        ${d}`);
};
const warnings = [];

const ALLOWED_NAMESPACES = [
  'http://www.w3.org/1999/xhtml',
  'http://www.w3.org/2000/svg',
  'http://www.w3.org/1999/xlink',
  'http://www.w3.org/XML/1998/namespace',
  'http://www.w3.org/2000/xmlns/',
];
const FORBIDDEN_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com', 'cdn.jsdelivr.net', 'unpkg.com', 'cdnjs.cloudflare.com'];
const game = JSON.parse(readFileSync(resolve(root, 'game.json'), 'utf8'));
const COMMUNITY = game.community ? [game.community.telegram, game.community.vk] : [];
// The two community links of game.json are opened by the player in a new tab (docs/03 CNT-08), not fetched.
const ALLOWED_URL = (u) => u === '/sdk.js' || /^(https?:)?\/\/mc\.yandex\.ru(\/|$)/.test(u) || COMMUNITY.includes(u);

// 1. index.html at the root, path charset.
{
  const names = files.map(([n]) => n);
  const badPaths = names.filter((n) => !/^[A-Za-z0-9._/-]+$/.test(n));
  check(1, 'index.html at the root, paths only [A-Za-z0-9._/-]', names.includes('index.html') && badPaths.length === 0, [
    ...(names.includes('index.html') ? [] : ['index.html is not at the archive root']),
    ...badPaths.map((p) => `bad path: ${p}`),
  ]);
}
// 2. Sizes.
{
  let unpacked = 0;
  let jsGzip = 0;
  for (const [name, data] of files) {
    unpacked += data.length;
    if (extname(name) === '.js') jsGzip += gzipSync(Buffer.from(data), { level: 9 }).length;
  }
  const details = [
    `zip ${(zipBytes.length / 1024).toFixed(1)} KB, unpacked ${(unpacked / 1024).toFixed(1)} KB, js gzip ${(jsGzip / 1024).toFixed(1)} KB`,
  ];
  // Budgets: docs/02-tech.md, section 8 (2D game with sprite atlases).
  if (zipBytes.length > 15 * 1024 * 1024) warnings.push('zip above the 15 MB target');
  if (jsGzip > 400 * 1024) warnings.push('js gzip above the 400 KB target');
  const MB30 = 30 * 1024 * 1024;
  check(2, 'zip and unpacked ≤ 30 MB, JS gzip ≤ 600 KB', zipBytes.length <= MB30 && unpacked <= MB30 && jsGzip <= 600 * 1024, details);
}
// 3. External addresses where the browser loads from or sends to.
{
  const problems = [];
  const otherUrls = new Set();
  const isExternal = (u) => /^(https?:)?\/\//i.test(u);
  for (const [name, data] of files) {
    const ext = extname(name);
    if (!['.html', '.css', '.js', '.json'].includes(ext)) continue;
    const src = text(data);
    if (ext === '.html') {
      for (const m of src.matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)) {
        const u = m[1];
        if (isExternal(u) && !ALLOWED_URL(u)) problems.push(`${name}: ${u}`);
      }
      if (/<script[^>]+type\s*=\s*["']importmap["']/i.test(src)) problems.push(`${name}: importmap`);
    }
    if (ext === '.css') {
      for (const m of src.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) if (isExternal(m[1])) problems.push(`${name}: url(${m[1]})`);
      for (const m of src.matchAll(/@import\s+(?:url\()?["']?([^"')\s;]+)/gi)) if (isExternal(m[1])) problems.push(`${name}: @import ${m[1]}`);
    }
    if (ext === '.js') {
      const callRe = /(?:\bfetch\(|\.open\(\s*["'][A-Z]+["']\s*,|\bimport\(|new\s+Worker\(|new\s+WebSocket\(|sendBeacon\()\s*["']([^"']+)["']/g;
      for (const m of src.matchAll(callRe)) if (isExternal(m[1]) && !ALLOWED_URL(m[1])) problems.push(`${name}: ${m[0].slice(0, 80)}`);
      for (const m of src.matchAll(/["'`](https?:\/\/[^"'`\s]+)["'`]/g)) {
        const u = m[1];
        if (ALLOWED_NAMESPACES.some((ns) => u === ns || u.startsWith(ns))) continue;
        if (ALLOWED_URL(u)) continue;
        otherUrls.add(u);
      }
    }
    for (const host of FORBIDDEN_HOSTS) if (src.includes(host)) problems.push(`${name}: forbidden host ${host}`);
  }
  // RD-05: not one external address, even in a string the code never loads (a link the player could be sent to is a link).
  for (const u of otherUrls) problems.push(`address in a string: ${u}`);
  check(3, 'no external addresses except /sdk.js, mc.yandex.ru and the community links (namespaces allowed)', problems.length === 0, problems.slice(0, 30));
}
// 4. <script src="/sdk.js"> exactly once.
{
  const html = entries['index.html'] ? text(entries['index.html']) : '';
  const count = (html.match(/<script[^>]+src\s*=\s*["']\/sdk\.js["'][^>]*>/g) || []).length;
  // SDK-01: the SDK comes before the game's code (the first other script file; the inline load-time mark may stand earlier).
  const sdkAt = html.search(/<script[^>]+src\s*=\s*["']\/sdk\.js["']/);
  const gameAt = html.search(/<script(?![^>]+src\s*=\s*["']\/sdk\.js["'])[^>]+src\s*=[^>]*>/);
  const first = sdkAt >= 0 && (gameAt < 0 || sdkAt < gameAt);
  check(4, '<script src="/sdk.js"> exactly once, before the game code', count === 1 && first, [`found ${count}${count && !first ? ', after the game code' : ''}`]);
}
// 5. Sound only through Web Audio.
{
  const problems = [];
  let webAudio = false;
  for (const [name, data] of files) {
    if (!['.html', '.js'].includes(extname(name))) continue;
    const src = text(data);
    if (/<audio\b/i.test(src)) problems.push(`${name}: <audio`);
    if (/<video\b/i.test(src)) problems.push(`${name}: <video`);
    if (/new\s+Audio\s*\(/.test(src)) problems.push(`${name}: new Audio(`);
    if (/createElement\(\s*["'](audio|video)["']/.test(src)) problems.push(`${name}: createElement(audio/video)`);
    if (/HTMLAudioElement|HTMLMediaElement/.test(src)) problems.push(`${name}: HTMLAudioElement`);
    if (/AudioContext/.test(src)) webAudio = true;
  }
  // SND-01: sound only through Web Audio.
  check(5, 'sound only through Web Audio: no <audio>, <video>, new Audio(, media elements', problems.length === 0, [...problems, `Web Audio (AudioContext) in the code: ${webAudio ? 'yes' : 'no'}`]);
}
// 6. No development leftovers.
{
  // ytgame and game_api: the youtube profile must not leak into the Yandex archive (docs/02-tech.md, section 6).
  const needles = ['lil-gui', '__TEST__', '__STUDIO__', '__YA_MOCK__', 'yasdk-mock', 'localhost', 'sourceMappingURL', 'ytgame', 'youtube.com/game_api'];
  const problems = [];
  for (const [name, data] of files) {
    if (!['.html', '.js', '.css', '.json'].includes(extname(name))) continue;
    const src = text(data);
    for (const n of needles) if (src.includes(n)) problems.push(`${name}: ${n}`);
    if (/(^|[^.\w$])debugger\s*;?/m.test(src.replace(/["'`][^"'`]*["'`]/g, ''))) problems.push(`${name}: debugger`);
  }
  check(6, 'no lil-gui, __TEST__, __STUDIO__, __YA_MOCK__, yasdk-mock, localhost, debugger, sourceMappingURL, ytgame, youtube.com/game_api', problems.length === 0, problems);
}
// 7. Dev-trace words and stop-list words in shipped texts: json files of the archive plus content/i18n/*.json and
// game.json (Vite inlines imported json into the JS chunks, so the texts may not exist as separate files).
{
  const words = [...stop.devTraces, ...stop.brands, ...stop.onlineWords, ...stop.gambling, ...stop.age.ru, ...stop.age.en];
  const problems = [];
  const esc = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const jsonFiles = files.filter(([n]) => extname(n) === '.json');
  const i18nDir = resolve(contentDir, 'i18n');
  if (existsSync(i18nDir)) {
    for (const f of readdirSync(i18nDir).filter((n) => n.endsWith('.json'))) jsonFiles.push([`content/i18n/${f}`, readFileSync(join(i18nDir, f))]);
  }
  jsonFiles.push(['game.json (title)', Buffer.from(JSON.stringify(game.title))]);
  for (const [name, data] of jsonFiles) {
    let parsed;
    try {
      parsed = JSON.parse(text(data));
    } catch {
      continue;
    }
    const values = [];
    const collect = (v) => {
      if (typeof v === 'string') values.push(v);
      else if (Array.isArray(v)) v.forEach(collect);
      else if (v && typeof v === 'object') Object.values(v).forEach(collect);
    };
    collect(parsed);
    // Q-018 (producer, 14.10.2026): «кейсы» is allowed in the game title and the store card only, never inside the game.
    const allowed = name === 'game.json (title)' ? new Set(['кейс', 'кейсы']) : new Set();
    for (const value of values) {
      for (const w of words) {
        if (allowed.has(w)) continue;
        const re = new RegExp(`(^|[^\\p{L}\\p{N}_])${esc(w)}(?=$|[^\\p{L}\\p{N}_])`, 'iu');
        if (re.test(value)) problems.push(`${name}: "${value.slice(0, 60)}" contains "${w}"`);
      }
    }
  }
  check(7, 'no development or stop-list words in shipped texts', problems.length === 0, problems.slice(0, 50));
}

// 8. LOC-01, LOC-02: ru and en have the same keys, none empty, no Cyrillic in en; every {ru, en} text of the data has both.
{
  const problems = [];
  const read = (f) => JSON.parse(readFileSync(f, 'utf8'));
  const flat = (o, p = '', out = {}) => {
    for (const [k, v] of Object.entries(o)) {
      if (v && typeof v === 'object' && !Array.isArray(v)) flat(v, `${p}${k}.`, out);
      else out[`${p}${k}`] = v;
    }
    return out;
  };
  const ruFile = resolve(contentDir, 'i18n/ru.json');
  const enFile = resolve(contentDir, 'i18n/en.json');
  if (!existsSync(ruFile) || !existsSync(enFile)) problems.push('content/i18n/ru.json or en.json missing');
  else {
    const ru = flat(read(ruFile));
    const en = flat(read(enFile));
    for (const k of Object.keys(ru)) if (!(k in en)) problems.push(`en misses ${k}`);
    for (const k of Object.keys(en)) if (!(k in ru)) problems.push(`ru misses ${k}`);
    const empty = (v) => v === '' || (Array.isArray(v) && v.length === 0);
    for (const [k, v] of Object.entries(ru)) if (empty(v)) problems.push(`ru empty ${k}`);
    for (const [k, v] of Object.entries(en)) {
      if (empty(v)) problems.push(`en empty ${k}`);
      // The language names (lang.*) are written in their own language: «Русский» in the en list too.
      if (!k.startsWith('lang.') && /\p{Script=Cyrillic}/u.test(JSON.stringify(v))) problems.push(`en has Cyrillic: ${k}`);
    }
  }
  let pairs = 0;
  const walk = (v, where) => {
    if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${where}[${i}]`));
    else if (v && typeof v === 'object') {
      if ('ru' in v || 'en' in v) {
        pairs++;
        const bad = ['ru', 'en'].filter((l) => typeof v[l] !== 'string' || v[l].trim() === '');
        if (bad.length) problems.push(`${where}: no ${bad.join(', ')}`);
        else if (/\p{Script=Cyrillic}/u.test(v.en)) problems.push(`${where}: Cyrillic in en`);
      } else for (const [k, x] of Object.entries(v)) walk(x, `${where}.${k}`);
    }
  };
  for (const f of existsSync(contentDir) ? readdirSync(contentDir).filter((n) => n.endsWith('.json')) : []) walk(read(join(contentDir, f)), f);
  check(8, 'language keys: ru and en the same, none empty, no Cyrillic in en (i18n and the {ru, en} texts of content/)', problems.length === 0, [
    ...problems.slice(0, 30),
    `{ru, en} texts in content/*.json: ${pairs}`,
  ]);
}

const header = [
  `check-release: ${relative(root, zipPath)}`,
  `date: ${new Date().toISOString()}`,
  `files: ${files.length}`,
  ...files.map(([n, d]) => `  ${n}  ${(d.length / 1024).toFixed(1)} KB`).sort(),
  '',
];
const footer = ['', ...warnings.map((w) => `WARN  ${w}`), failed ? `RESULT: FAIL (${failed} check(s))` : 'RESULT: PASS'];
const report = [...header, ...lines, ...footer].join('\n') + '\n';
mkdirSync(resolve(reportPath, '..'), { recursive: true });
writeFileSync(reportPath, report);
console.log(report);
process.exit(failed ? 1 : 0);
