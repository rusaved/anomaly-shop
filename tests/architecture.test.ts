import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { findExternalUrls, YOUTUBE_SDK } from '../scripts/check-bundle-urls.mjs';

/**
 * Architecture rules (docs/02-tech.md, section 4; CLAUDE.md, hard rules 1, 2, 4, 9):
 * core, sim and content are pure (no DOM, no PixiJS, no platform, scene, ui, audio, analytics);
 * pixi.js only in src/scene and src/main.ts; platform SDKs only in src/platform, youtube and yandex modules
 * never import each other; no Math.random in core and sim; no Cyrillic and no absolute URLs in src;
 * no stop-list words in sources; three-line module headers; evidence PNG up to 300 KB;
 * the youtube build (if built) has no external addresses.
 * Every rule passes on an empty src/: the scaffold comes before the code (milestone M0).
 */
const root = resolve(__dirname, '..');

export function walk(dir: string, filter: (p: string) => boolean, acc: string[] = []): string[] {
  if (!existsSync(dir)) return acc;
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, filter, acc);
    else if (filter(p)) acc.push(p);
  }
  return acc;
}
const rel = (p: string): string => relative(root, p).split('\\').join('/');
const tsFiles = (dir: string): string[] => walk(resolve(root, dir), (p) => p.endsWith('.ts') && !p.endsWith('.d.ts'));
const read = (p: string): string => readFileSync(p, 'utf8');

/** Strips line and block comments but keeps string literals (good enough for our own code). */
export function stripComments(src: string): string {
  let out = '';
  let i = 0;
  let quote: string | null = null;
  while (i < src.length) {
    const c = src[i] as string;
    const next = src[i + 1];
    if (quote) {
      out += c;
      if (c === '\\') {
        out += next ?? '';
        i += 2;
        continue;
      }
      if (c === quote) quote = null;
      i++;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      quote = c;
      out += c;
      i++;
      continue;
    }
    if (c === '/' && next === '/') {
      while (i < src.length && src[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && next === '*') {
      i += 2;
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

const PURE_LAYERS = ['src/core', 'src/sim', 'src/content'];
const FORBIDDEN_FOR_PURE = ['/scene/', '/ui/', '/platform/', '/audio/', '/analytics/', '/debug/', '/studio/', '/test-api/'];

export function imports(src: string): string[] {
  const out: string[] = [];
  for (const m of src.matchAll(/import\s+(?:type\s+)?[^'";]*?\s*from\s*['"]([^'"]+)['"]/g)) out.push(m[1] as string);
  for (const m of src.matchAll(/import\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) out.push(m[1] as string);
  for (const m of src.matchAll(/^\s*import\s+['"]([^'"]+)['"]/gm)) out.push(m[1] as string);
  return out;
}

export function checkPureFile(file: string, src: string): string[] {
  const problems: string[] = [];
  const name = rel(file);
  for (const spec of imports(src)) {
    if (spec.startsWith('.') || spec.startsWith('@/')) {
      const target = spec.startsWith('@/') ? '/' + spec.slice(2) : resolve(file, '..', spec).split('\\').join('/');
      for (const bad of FORBIDDEN_FOR_PURE) if (target.includes(bad)) problems.push(`${name}: imports ${spec} (${bad.replaceAll('/', '')} layer)`);
    } else if (spec.startsWith('@content/')) {
      /* data is fine everywhere */
    } else if (spec === 'valibot' && name.startsWith('src/content/')) {
      /* content schemas (docs/02-tech.md, section 5) */
    } else {
      problems.push(`${name}: external import "${spec}"`);
    }
  }
  if (/\b(document|window|navigator|localStorage|HTMLElement|requestAnimationFrame)\b/.test(stripComments(src))) problems.push(`${name}: references the DOM`);
  return problems;
}

export function checkPixiImport(file: string, src: string): string[] {
  const name = rel(file);
  const allowed = name.startsWith('src/scene/') || name === 'src/main.ts';
  return !allowed && imports(src).some((s) => s === 'pixi.js' || s.startsWith('pixi.js/') || s.startsWith('@pixi/'))
    ? [`${name}: pixi.js is imported only in src/scene and src/main.ts`]
    : [];
}

export function checkPlatformIsolation(file: string, src: string): string[] {
  const name = rel(file);
  const code = stripComments(src);
  const problems: string[] = [];
  if (!name.startsWith('src/platform/') && /\b(YaGames|ysdk|ytgame)\b/.test(code)) problems.push(`${name}: platform SDK outside src/platform`);
  const base = name.split('/').pop() ?? '';
  for (const spec of imports(src)) {
    if (base.startsWith('youtube') && /yandex/.test(spec)) problems.push(`${name}: youtube module imports ${spec}`);
    if (base.startsWith('yandex') && /youtube/.test(spec)) problems.push(`${name}: yandex module imports ${spec}`);
  }
  return problems;
}

export function checkRandom(file: string, src: string): string[] {
  return /Math\.random\s*\(/.test(src) ? [`${rel(file)}: Math.random is forbidden here (seeded rng only)`] : [];
}

export function checkCyrillic(file: string, src: string): string[] {
  const code = stripComments(src);
  const m = code.match(/[Ѐ-ӿ]/);
  return m ? [`${rel(file)}: Cyrillic outside comments ("${code.slice(Math.max(0, m.index! - 20), m.index! + 20).replace(/\n/g, ' ')}")`] : [];
}

export function checkUrls(file: string, src: string): string[] {
  const m = stripComments(src).match(/\bhttps?:\/\/[^\s"'`]+/);
  return m ? [`${rel(file)}: absolute address ${m[0]} in src (links live in game.json, SDK tags in vite.config.ts)`] : [];
}

const stop = JSON.parse(read(resolve(root, 'scripts/stopwords.json'))) as { brands: string[]; onlineWords: string[] };
const esc = (w: string): string => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export function checkStopwords(file: string, src: string, words: string[]): string[] {
  const problems: string[] = [];
  for (const w of words) {
    const re = new RegExp(`(^|[^\\p{L}\\p{N}_])${esc(w)}(?=$|[^\\p{L}\\p{N}_])`, 'iu');
    if (re.test(src)) problems.push(`${rel(file)}: contains stop-list word #${words.indexOf(w)} (${w.length} letters)`);
  }
  return problems;
}

/** Builder notes in json ("note", "_comment", "$schema") are never shown to players: online words are allowed there, brands are not. */
const NOTE_KEYS = new Set(['note', '_comment', '$schema']);
export function playerText(file: string, src: string): string {
  if (!file.endsWith('.json')) return src;
  const strip = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(strip)
      : v && typeof v === 'object'
        ? Object.fromEntries(Object.entries(v).filter(([k]) => !NOTE_KEYS.has(k)).map(([k, x]) => [k, strip(x)]))
        : v;
  try {
    return JSON.stringify(strip(JSON.parse(src)));
  } catch {
    return src;
  }
}

/** CLAUDE.md «Как работать» p. 7: every src module of 10+ lines opens with What / Called by / Keep. */
const HEADER_PREFIXES = [/^\/\/ (What|Что):\s*\S/, /^\/\/ (Called by|Кто вызывает):\s*\S/, /^\/\/ (Keep|Не трогать):\s*\S/];
export function checkHeader(file: string, src: string): string[] {
  const lines = src.split('\n');
  if (lines.length < 10) return [];
  const ok = HEADER_PREFIXES.every((re, i) => re.test(lines[i] ?? '')) && !/^\s*\/\//.test(lines[3] ?? '');
  return ok ? [] : [`${rel(file)}: no three-line header (// What: / // Called by: / // Keep:)`];
}

const MAX_EVIDENCE_PNG = 300 * 1024;

describe('architecture', () => {
  it('core, sim, content: no DOM, no PixiJS, no scene, ui, platform, audio, analytics', () => {
    const problems = PURE_LAYERS.flatMap((layer) => tsFiles(layer).flatMap((f) => checkPureFile(f, read(f))));
    expect(problems).toEqual([]);
  });

  it('pixi.js only in src/scene and src/main.ts', () => {
    expect(tsFiles('src').flatMap((f) => checkPixiImport(f, read(f)))).toEqual([]);
  });

  it('platform SDKs only in src/platform; youtube and yandex modules never import each other', () => {
    expect(tsFiles('src').flatMap((f) => checkPlatformIsolation(f, read(f)))).toEqual([]);
  });

  it('no Math.random in core and sim', () => {
    expect(['src/core', 'src/sim'].flatMap((l) => tsFiles(l).flatMap((f) => checkRandom(f, read(f))))).toEqual([]);
  });

  it('no Cyrillic in src/**/*.ts outside comments (texts live in content/i18n)', () => {
    expect(tsFiles('src').flatMap((f) => checkCyrillic(f, read(f)))).toEqual([]);
  });

  it('no absolute addresses in src/**/*.ts', () => {
    expect(tsFiles('src').flatMap((f) => checkUrls(f, read(f)))).toEqual([]);
  });

  it('window.open in one module at most (community buttons)', () => {
    const files = tsFiles('src').filter((f) => /window\.open\(/.test(stripComments(read(f))));
    expect(files.length).toBeLessThanOrEqual(1);
  });

  it('no stop-list words (brands anywhere, online outside builder notes) in src, content, game.json, index.html, scripts', () => {
    const files = [
      ...walk(resolve(root, 'src'), () => true),
      ...walk(resolve(root, 'content'), () => true),
      resolve(root, 'index.html'),
      resolve(root, 'game.json'),
      ...walk(resolve(root, 'scripts'), (p) => !p.endsWith('stopwords.json')),
    ].filter((f) => existsSync(f));
    const problems = files.flatMap((f) => {
      const src = read(f);
      return [...checkStopwords(f, src, stop.brands), ...checkStopwords(f, playerText(f, src), stop.onlineWords)];
    });
    expect(problems).toEqual([]);
  });

  it('every src module of 10+ lines opens with the three-line header (What / Called by / Keep)', () => {
    expect(tsFiles('src').flatMap((f) => checkHeader(f, read(f)))).toEqual([]);
  });

  it('evidence PNG files are 300 KB at most (full-size shots stay out of git)', () => {
    const big = walk(resolve(root, 'docs/evidence'), (p) => p.endsWith('.png') && !/[\\/]raw[\\/]/.test(p) && statSync(p).size > MAX_EVIDENCE_PNG);
    expect(big.map(rel)).toEqual([]);
  });

  it('youtube build (when dist-youtube exists): no external addresses', () => {
    const dir = resolve(root, 'dist-youtube');
    const files = walk(dir, () => true).map((p) => [relative(dir, p).split('\\').join('/'), read(p)] as [string, string]);
    if (files.length === 0) return;
    expect(findExternalUrls(files, 'youtube').problems).toEqual([]);
  });

  it('the checks themselves catch violations', () => {
    const f = (p: string): string => resolve(root, p);
    expect(checkPureFile(f('src/sim/x.ts'), "import { Sprite } from 'pixi.js';")).toHaveLength(1);
    expect(checkPureFile(f('src/sim/x.ts'), "import { a } from '../ui/a.ts';")).toHaveLength(1);
    expect(checkPureFile(f('src/sim/x.ts'), "import { a } from '../core/a.ts';")).toHaveLength(0);
    expect(checkPureFile(f('src/sim/x.ts'), 'const w = window.innerWidth;')).toHaveLength(1);
    expect(checkPixiImport(f('src/ui/x.ts'), "import { Sprite } from 'pixi.js';")).toHaveLength(1);
    expect(checkPixiImport(f('src/scene/x.ts'), "import { Sprite } from 'pixi.js';")).toHaveLength(0);
    expect(checkPlatformIsolation(f('src/ui/x.ts'), 'const ok = typeof ytgame;')).toHaveLength(1);
    expect(checkPlatformIsolation(f('src/platform/youtube.ts'), "import { a } from './yandex.ts';")).toHaveLength(1);
    expect(checkPlatformIsolation(f('src/platform/youtube.ts'), "import { a } from './types.ts';")).toHaveLength(0);
    expect(checkRandom('x.ts', 'const r = Math.random();')).toHaveLength(1);
    expect(checkCyrillic(f('x.ts'), 'const s = "Привет";')).toHaveLength(1);
    expect(checkCyrillic(f('x.ts'), '// Привет\nconst s = "hi";')).toHaveLength(0);
    expect(checkUrls(f('x.ts'), 'const u = "https://example.org/a";')).toHaveLength(1);
    expect(checkUrls(f('x.ts'), '// https://example.org/a\nconst u = 1;')).toHaveLength(0);
    expect(checkStopwords(f('x.ts'), 'const s = "' + ['Ro', 'blox'].join('') + '";', stop.brands)).toHaveLength(1);
    expect(checkStopwords(f('x.ts'), 'const s = "egg";', stop.brands)).toHaveLength(0);
    const online = stop.onlineWords[0] as string;
    expect(checkStopwords(f('x.json'), playerText('x.json', `{"note":"${online}","a":"egg"}`), stop.onlineWords)).toHaveLength(0);
    expect(checkStopwords(f('x.json'), playerText('x.json', `{"a":"${online}"}`), stop.onlineWords)).toHaveLength(1);
    const body = '\nconst a = 1;'.repeat(12);
    expect(checkHeader(f('x.ts'), '// What: a\n// Called by: b\n// Keep: c\n' + body)).toHaveLength(0);
    expect(checkHeader(f('x.ts'), '// What: a\n// Keep: c\n' + body)).toHaveLength(1);
    expect(checkHeader(f('x.ts'), 'const a = 1;')).toHaveLength(0);
    const sdkTag = `<script src="${YOUTUBE_SDK}"></script>`;
    expect(findExternalUrls([['index.html', sdkTag]], 'youtube').problems).toEqual([]);
    expect(findExternalUrls([['index.html', '']], 'youtube').problems).toHaveLength(1);
    expect(findExternalUrls([['index.html', sdkTag], ['a.js', 'fetch("https://example.org/x")']], 'youtube').problems).toHaveLength(1);
    expect(findExternalUrls([['index.html', sdkTag], ['a.js', 'const s="http://www.w3.org/2000/svg"']], 'youtube').problems).toEqual([]);
    expect(findExternalUrls([['index.html', sdkTag], ['a.js', 'x.YaGames.init()']], 'youtube').problems).toHaveLength(1);
    expect(findExternalUrls([['a.js', 'open("https://t.me/x")']], 'yandex', ['https://t.me/x']).problems).toEqual([]);
  });
});
