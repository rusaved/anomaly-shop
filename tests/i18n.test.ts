import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createI18n, format, MISSING_OPEN } from '../src/ui/i18n.ts';
import { dictionaries } from '../src/content/index.ts';

/** docs/02-tech.md, section 11 and docs/03 LOC-01..03: every key used by the code exists in both dictionaries. */
const root = resolve(__dirname, '..');
function walk(dir: string, filter: (p: string) => boolean, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, filter, acc);
    else if (filter(p)) acc.push(p);
  }
  return acc;
}

describe('t()', () => {
  it('substitutes {vars} and leaves unknown placeholders alone', () => {
    expect(format('Sold for {n} coins', { n: 12 })).toBe('Sold for 12 coins');
    expect(format('{a} and {b}', { a: 'x' })).toBe('x and {b}');
    expect(format('plain')).toBe('plain');
  });

  it('falls back to English, then to a marker in dev and the key in release', () => {
    const dicts = { ru: { 'a.b': 'А {n}' }, en: { 'a.b': 'A {n}', 'only.en': 'Only' } };
    const dev = createI18n(dicts, 'ru', 'en', true);
    expect(dev.t('a.b', { n: 1 })).toBe('А 1');
    expect(dev.t('only.en')).toBe('Only');
    expect(dev.t('nope')).toBe(`${MISSING_OPEN}nope⟧`);
    expect(dev.has('nope')).toBe(false);
    const release = createI18n(dicts, 'ru', 'en', false);
    expect(release.t('nope')).toBe('nope');
    const seen: string[] = [];
    release.onChange((l) => seen.push(l));
    release.setLanguage('en');
    release.setLanguage('en');
    expect(release.t('a.b', { n: 2 })).toBe('A 2');
    expect(seen).toEqual(['en']);
  });

  it('every key used in src/**/*.ts exists in ru and en', () => {
    const used = new Set<string>();
    const files = walk(resolve(root, 'src'), (p) => p.endsWith('.ts'));
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      for (const m of src.matchAll(/\bt\(\s*'([a-z0-9_.]+)'/g)) used.add(m[1]!);
      for (const m of src.matchAll(/data-i18n="([a-z0-9_.]+)"/g)) used.add(m[1]!);
      for (const m of src.matchAll(/\bi18nKey\(\s*'([a-z0-9_.]+)'/g)) used.add(m[1]!);
    }
    const missing = [...used].filter((k) => !(k in dictionaries.ru) || !(k in dictionaries.en));
    expect(missing).toEqual([]);
  });

  it('LOC-02 English texts are English: no Cyrillic outside the language names', () => {
    const bad = Object.entries(dictionaries.en).filter(([k, v]) => !k.startsWith('lang.') && /[Ѐ-ӿ]/.test(v));
    expect(bad).toEqual([]);
  });
});
