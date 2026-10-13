// `npm run check:youtube` (docs/02-tech.md 6.3, docs/05 section 3): no external address in a built bundle.
// youtube: the only allowed external address is the ytgame SDK tag in index.html, exactly once; nothing from
//   Yandex, no analytics, no community links; sizes: whole bundle <= 250 MiB, first load <= 30 MiB (target 15).
// yandex: allowed /sdk.js, the Metrika counter and the two community links of game.json.
// Namespaces (w3.org) are strings, not requests, and are allowed everywhere.
// `findExternalUrls` is pure and unit-tested in tests/architecture.test.ts.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';

export const YOUTUBE_SDK = 'https://www.youtube.com/game_api/v1';
export const NAMESPACES = [
  'http://www.w3.org/1999/xhtml',
  'http://www.w3.org/2000/svg',
  'http://www.w3.org/1999/xlink',
  'http://www.w3.org/XML/1998/namespace',
  'http://www.w3.org/2000/xmlns/',
];
// Strings that are never fetched but sit in a dependency (doc links in messages). Add one only with a line in
// docs/допущения.md: what it is and why it is never requested.
export const NEVER_FETCHED = [
  // PixiJS banner text (lib/utils/sayHello.mjs): a console.log string, never requested; see docs/допущения.md, row 12.
  'http://www.pixijs.com/',
];
const TEXT_EXT = new Set(['.html', '.js', '.mjs', '.css', '.json', '.svg', '.txt', '.webmanifest']);
const MIB = 1024 * 1024;
export const YOUTUBE_LIMITS = { bundle: 250 * MIB, firstLoad: 30 * MIB, firstLoadTarget: 15 * MIB };

/**
 * files: Array<[relativePath, text]>; profile: 'youtube' | 'yandex' | 'null'; community: allowed links (yandex).
 * Returns { problems, warnings }: problems fail the check.
 */
export function findExternalUrls(files, profile, community = []) {
  const problems = [];
  const warnings = [];
  const allowed = (u) =>
    NAMESPACES.some((ns) => u.startsWith(ns)) ||
    NEVER_FETCHED.some((s) => u.startsWith(s)) ||
    (profile === 'yandex' && (/^(https?:)?\/\/mc\.yandex\.ru(\/|$)/.test(u) || community.includes(u)));
  for (const [name, src] of files) {
    if (!TEXT_EXT.has(extname(name))) continue;
    let text = src;
    if (profile === 'youtube' && name === 'index.html') {
      const tag = `<script src="${YOUTUBE_SDK}"></script>`;
      const count = text.split(tag).length - 1;
      if (count !== 1) problems.push(`index.html: the ytgame SDK tag must appear exactly once, found ${count}`);
      text = text.split(tag).join('');
    }
    const found = new Set();
    for (const m of text.matchAll(/\bhttps?:\/\/[^\s"'`)<>\\]+/gi)) found.add(m[0]);
    for (const m of text.matchAll(/["'`(=]\s*(\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)+[^\s"'`)<>\\]*)/gi)) found.add(m[1]);
    for (const u of found) if (!allowed(u)) problems.push(`${name}: external address ${u.slice(0, 120)}`);
    if (profile === 'youtube') {
      for (const needle of ['YaGames', 'mc.yandex', '/sdk.js', 'ysdk']) {
        if (text.includes(needle)) problems.push(`${name}: "${needle}" in the youtube build`);
      }
    }
  }
  if (profile === 'youtube' && files.some(([n]) => extname(n) === '.wasm')) warnings.push('.wasm in the youtube build: avoid WASM where possible');
  return { problems, warnings };
}

function walk(dir, acc = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else acc.push(p);
  }
  return acc;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const args = process.argv.slice(2);
  const dirArg = args.find((a) => !a.startsWith('--'));
  const pIndex = args.indexOf('--profile');
  const profile = pIndex >= 0 ? args[pIndex + 1] : 'youtube';
  if (!dirArg) {
    console.error('usage: node scripts/check-bundle-urls.mjs <dir> --profile youtube|yandex');
    process.exit(2);
  }
  const dir = resolve(dirArg);
  let paths;
  try {
    paths = walk(dir);
  } catch {
    console.error(`check-bundle-urls: ${dirArg} not found — build it first`);
    process.exit(1);
  }
  const game = JSON.parse(readFileSync(resolve(import.meta.dirname, '../game.json'), 'utf8'));
  const community = game.community ? [game.community.telegram, game.community.vk] : [];
  const files = paths.map((p) => [relative(dir, p).split('\\').join('/'), TEXT_EXT.has(extname(p)) ? readFileSync(p, 'utf8') : '']);
  const { problems, warnings } = findExternalUrls(files, profile, community);
  if (profile === 'youtube') {
    const total = paths.reduce((s, p) => s + statSync(p).size, 0);
    // First load = everything except files under a "lazy/" folder (loaded after gameReady).
    const first = paths.filter((p) => !/[\\/]lazy[\\/]/.test(p)).reduce((s, p) => s + statSync(p).size, 0);
    const mib = (n) => `${(n / MIB).toFixed(2)} MiB`;
    console.log(`check-bundle-urls: bundle ${mib(total)}, first load ${mib(first)}`);
    if (total > YOUTUBE_LIMITS.bundle) problems.push(`bundle ${mib(total)} > 250 MiB`);
    if (first > YOUTUBE_LIMITS.firstLoad) problems.push(`first load ${mib(first)} > 30 MiB`);
    else if (first > YOUTUBE_LIMITS.firstLoadTarget) warnings.push(`first load ${mib(first)} above the 15 MiB target`);
  }
  for (const w of warnings) console.warn(`WARN ${w}`);
  if (problems.length) {
    console.error(`check-bundle-urls (${profile}): ${problems.length} problem(s)`);
    for (const p of problems.slice(0, 50)) console.error(`  ${p}`);
    process.exit(1);
  }
  console.log(`check-bundle-urls (${profile}): ${files.length} files, no external addresses — ok`);
}
