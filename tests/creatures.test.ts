import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as v from 'valibot';
import { CREATURE_SHAPES, StyleFile } from '../src/content/schemas.ts';
import { coins, creatureValue } from '../src/sim/rules.ts';
import { loadGameContent } from '../scripts/load-game-content.ts';

/** M1-03: every species of species.json has its own look (shape + colors), a price by level and a line in ru and en. */
const content = loadGameContent();
const style = v.parse(StyleFile, JSON.parse(readFileSync(resolve(__dirname, '../content/style.json'), 'utf8')));

describe('M1-03 creatures', () => {
  it('30 species (8 of M1, 4 of M2-06, 18 of M6-02), each with a look the scene can draw; no two look alike (shape + body color)', () => {
    expect(content.species.species).toHaveLength(30);
    const keys = content.species.species.map((s) => {
      const look = style.creatures[s.id];
      expect(look, s.id).toBeDefined();
      expect(CREATURE_SHAPES).toContain(look!.shape);
      return `${look!.shape}:${look!.body}`;
    });
    expect(new Set(keys).size).toBe(keys.length);
    // Shapes differ within a rarity, so neighbours on the showcase never read as one creature.
    const shapes = content.species.species.map((s) => style.creatures[s.id]!.shape);
    expect(new Set(shapes).size).toBe(30);
  });

  it('price = basePrice × growth^(level − 1), whole coins, capped at maxLevel', () => {
    const kettle = content.species.species.find((s) => s.id === 'kettle')!;
    expect(coins(creatureValue(kettle, 1))).toBe(12);
    expect(coins(creatureValue(kettle, 2))).toBe(15);
    expect(coins(creatureValue(kettle, 3))).toBe(19);
    expect(creatureValue(kettle, 99)).toBe(creatureValue(kettle, kettle.maxLevel));
  });

  it('every species has a line in both languages', () => {
    for (const s of content.species.species) {
      expect(s.line.ru.length).toBeGreaterThan(0);
      expect(s.line.en.length).toBeGreaterThan(0);
    }
  });
});
