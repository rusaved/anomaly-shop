import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as v from 'valibot';
import { CREATURE_CONTEXTS, CUSTOMER_CONTEXTS, LinesFile } from '../src/content/schemas.ts';
import { pickLine } from '../src/sim/lines.ts';
import { validateContent } from '../src/content/validate.ts';
import { loadContent } from '../scripts/validate-content.mjs';
import { loadGameContent } from '../scripts/load-game-content.ts';

/** M2-17: creature lines (12 species × tap, hungry, level, max, farewell) and customer lines (3 types + golden × 6 contexts), short, no repeats. */
const root = resolve(import.meta.dirname, '..');
const lines = v.parse(LinesFile, JSON.parse(readFileSync(resolve(root, 'content/lines.json'), 'utf8')));
const content = loadGameContent();

describe('M2-17 lines', () => {
  it('2–3 lines ru/en per context for every species and customer type (golden too)', () => {
    for (const s of content.species.species) for (const ctx of CREATURE_CONTEXTS) expect(lines.creatures[s.id]?.[ctx]?.length ?? 0, `${s.id}.${ctx}`).toBeGreaterThanOrEqual(2);
    for (const type of [...content.customers.districts.map((d) => d.customer.id), 'golden'])
      for (const ctx of CUSTOMER_CONTEXTS) expect(lines.customers[type]?.[ctx]?.length ?? 0, `${type}.${ctx}`).toBeGreaterThanOrEqual(2);
  });

  it('6 words at most, no full stop at the end (validate:content)', () => {
    for (const set of [...Object.values(lines.creatures), ...Object.values(lines.customers)])
      for (const pool of Object.values(set))
        for (const l of pool)
          for (const text of [l.ru, l.en]) {
            expect(text.trim().split(/\s+/).length, text).toBeLessThanOrEqual(6);
            expect(text, text).not.toMatch(/\.$/);
          }
  });

  it('never one of the last three of a pool', () => {
    const recent: number[] = [];
    for (let i = 0; i < 200; i++) {
      const pick = pickLine(5, recent, 3, (i * 0.618) % 1);
      expect(recent.slice(-3)).not.toContain(pick);
      recent.push(pick);
    }
    // A pool of 3 avoids the last two (one choice left), a pool of 1 always gives it.
    expect(pickLine(3, [0, 1], 3, 0.5)).toBe(2);
    expect(pickLine(1, [0], 3, 0.5)).toBe(0);
  });

  it('the validator catches long lines, a full stop, a missing species and English with Cyrillic', () => {
    const game = JSON.parse(readFileSync(resolve(root, 'game.json'), 'utf8')) as Record<string, unknown>;
    const files = JSON.parse(JSON.stringify((loadContent() as { files: Record<string, unknown> }).files)) as Record<string, { creatures: Record<string, Record<string, Array<{ ru: string; en: string }>>> }>;
    const l = files['lines.json']!;
    l.creatures.kettle!.tap![0] = { ru: 'Раз два три четыре пять шесть семь', en: 'Конец.' };
    delete l.creatures.pillow;
    const errors = validateContent(files, game).errors.join('\n');
    expect(errors).toContain('creatures.kettle.tap.0.ru — 7 words');
    expect(errors).toContain('creatures.kettle.tap.0.en — no full stop');
    expect(errors).toContain('creatures.kettle.tap.0.en — Cyrillic');
    expect(errors).toContain('creatures.pillow — no lines');
  });
});
