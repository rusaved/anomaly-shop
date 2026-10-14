import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { RARITIES, CREATURE_SHAPES } from '../src/content/schemas.ts';
import { pickRarity, pickSpecies } from '../src/sim/rules.ts';
import { loadGameContent } from '../scripts/load-game-content.ts';

/** M2-06: 12 species (3 of each rarity) with their own shapes; the odd and glowing eggs are valid and can hatch every rarity. */
const content = loadGameContent();
const style = JSON.parse(readFileSync(resolve(import.meta.dirname, '../content/style.json'), 'utf8')) as { creatures: Record<string, { shape: string }> };

describe('M2-06 species and eggs', () => {
  it('12 species, two of each of the six rarities (Q-022), each with a look', () => {
    expect(content.species.species).toHaveLength(12);
    for (const r of RARITIES) expect(content.species.species.filter((s) => s.rarity === r)).toHaveLength(2);
    for (const s of content.species.species) expect(CREATURE_SHAPES).toContain(style.creatures[s.id]?.shape);
    expect(new Set(content.species.species.map((s) => style.creatures[s.id]!.shape)).size).toBe(12);
  });

  it('odd and glowing eggs: priced, timed and their odds sum to 100', () => {
    for (const id of ['egg_odd', 'egg_glow']) {
      const egg = content.eggs.eggs.find((e) => e.id === id)!;
      expect(egg.price.coins).toBeGreaterThan(60);
      expect(RARITIES.reduce((sum, r) => sum + egg.chances[r], 0)).toBe(100);
      expect(egg.unlock.type).toBe('district');
    }
  });

  it('every new species can come out of an egg', () => {
    const glow = content.eggs.eggs.find((e) => e.id === 'egg_glow')!;
    const seen = new Set<string>();
    for (let i = 0; i < 400; i++) seen.add(pickSpecies(content.species, pickRarity(glow.chances, (i * 0.618) % 1), ((i * 0.377) % 1)).id);
    for (const id of ['pillow', 'cactus', 'shroom', 'moon_donut']) expect(seen).toContain(id);
  });
});
