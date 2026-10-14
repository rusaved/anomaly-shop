import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadContent } from '../scripts/validate-content.mjs';
import { validateContent } from '../src/content/validate.ts';
import { dictionaries, eggs, species, style } from '../src/content/index.ts';

/** Content schemas and cross checks (docs/02-tech.md, section 5): the real data passes, broken data fails verify. */
const root = resolve(__dirname, '..');
const game = JSON.parse(readFileSync(resolve(root, 'game.json'), 'utf8')) as Record<string, unknown>;
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

describe('validate:content', () => {
  const { files, errors: loadErrors } = loadContent() as { files: Record<string, Record<string, unknown>>; errors: string[] };

  it('the shipped content is valid', () => {
    expect(loadErrors).toEqual([]);
    const result = validateContent(files, game);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('a schema error is reported as "file: path — problem"', () => {
    const broken = clone(files);
    (broken['eggs.json']!.eggs as Array<Record<string, unknown>>)[0]!.hatchSec = 'fast';
    const r = validateContent(broken, game);
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => /^eggs\.json: eggs\.0\.hatchSec — /.test(e))).toBe(true);
  });

  it('cross checks: chances sum, unknown district, unknown egg in courier, missing rarity', () => {
    const b1 = clone(files);
    (b1['eggs.json']!.eggs as Array<{ chances: Record<string, number> }>)[0]!.chances.common = 50;
    expect(validateContent(b1, game).errors).toContainEqual(expect.stringContaining('eggs.0.chances — sum is'));
    const b2 = clone(files);
    (b2['eggs.json']!.eggs as Array<{ unlock: { type: string; id?: string } }>)[2]!.unlock = { type: 'district', id: 'moon' };
    expect(validateContent(b2, game).errors).toContainEqual(expect.stringContaining('unknown district "moon"'));
    const b3 = clone(files);
    const courier = (b3['upgrades.json']!.upgrades as Array<{ effect: { type: string; egg?: string } }>).find((u) => u.effect.type === 'autoBuyEgg')!;
    courier.effect.egg = 'egg_none';
    expect(validateContent(b3, game).errors).toContainEqual(expect.stringContaining('unknown egg "egg_none"'));
    const b4 = clone(files);
    b4['species.json']!.species = (b4['species.json']!.species as Array<{ rarity: string }>).filter((s) => s.rarity !== 'exclusive');
    expect(validateContent(b4, game).errors).toContainEqual(expect.stringContaining('no species of rarity "exclusive"'));
  });

  it('LOC-01 i18n: key parity, placeholders, no Cyrillic in en, no empty strings', () => {
    const b1 = clone(files);
    delete b1['i18n/ru.json']!['pause.resume'];
    expect(validateContent(b1, game).errors).toContainEqual('i18n/ru.json: pause.resume — missing (present in en)');
    const b2 = clone(files);
    b2['i18n/ru.json']!['extra.key'] = 'x';
    expect(validateContent(b2, game).errors).toContainEqual('i18n/ru.json: extra.key — not in en.json');
    const b3 = clone(files);
    b3['i18n/en.json']!['pause.title'] = 'Пауза';
    expect(validateContent(b3, game).errors).toContainEqual(expect.stringContaining('Cyrillic in the English text'));
    const b4 = clone(files);
    b4['i18n/ru.json']!['pause.title'] = '  ';
    expect(validateContent(b4, game).errors).toContainEqual(expect.stringContaining('i18n/ru.json: pause.title — '));
    const b5 = clone(files);
    b5['i18n/en.json']!['hud.coins'] = 'Coins {n}';
    expect(validateContent(b5, game).errors).toContainEqual(expect.stringContaining('placeholders differ'));
  });

  it('game.json: community links must be https, fallback language in languages', () => {
    const g = clone(game) as { community: { vk: string }; fallbackLanguage: string };
    g.community.vk = 'http://vk.com/x';
    expect(validateContent(files, g).errors).toContainEqual(expect.stringContaining('game.json: community.vk — '));
    const g2 = clone(game) as { languages: string[] };
    g2.languages = ['ru'];
    expect(validateContent(files, g2).errors).toContainEqual('game.json: fallbackLanguage — not in languages');
  });

  it('a missing required file and an unexpected file both fail', () => {
    const b = clone(files);
    delete b['calendar.json'];
    b['secret.json'] = { a: 1 };
    const r = validateContent(b, game);
    expect(r.errors).toContainEqual('calendar.json: (root) — file is missing');
    expect(r.errors).toContainEqual('secret.json: (root) — unexpected content file (no schema)');
  });
});

describe('typed content at load', () => {
  it('exposes parsed data without builder notes', () => {
    expect(eggs.eggs[0]?.id).toBe('egg_basic');
    expect((eggs as Record<string, unknown>).note).toBeUndefined();
    expect(species.species).toHaveLength(12);
    expect(style.colors.sky).toMatch(/^#/);
    expect(Object.keys(dictionaries.ru)).toEqual(Object.keys(dictionaries.en));
    expect(dictionaries.en['pause.resume']).toBe('Resume');
  });
});
