import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadContent } from '../scripts/validate-content.mjs';
import { validateContent } from '../src/content/validate.ts';
import { customers, eggs, gifts, market, species, style, work } from '../src/content/index.ts';
import { RARITIES } from '../src/content/schemas.ts';

/** M3-01: the data of the genre-standard frame (docs/01 §1а, §3 p. 12–15). */
const root = resolve(__dirname, '..');
const game = JSON.parse(readFileSync(resolve(root, 'game.json'), 'utf8')) as Record<string, unknown>;
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

describe('M3-01 frame data', () => {
  const { files } = loadContent() as { files: Record<string, Record<string, unknown>> };

  it('six rarities grey to red (Q-022): every one has species, a color and egg odds', () => {
    expect(RARITIES).toHaveLength(6);
    for (const r of RARITIES) {
      expect(species.species.some((s) => s.rarity === r)).toBe(true);
      expect(style.rarity[r]).toMatch(/^#[0-9a-f]{6}$/i);
    }
    for (const e of eggs.eggs.filter((x) => !x.special)) expect(RARITIES.reduce((s, r) => s + e.chances[r], 0)).toBeCloseTo(100, 9);
  });

  it('the egg ladder: 8 steps, ×10 up to the glowing one, then the city top ×5, ×3, ×3, ×3 (M4-08, Q-029); free, seasonal and reward sections; every egg has a shell look', () => {
    const ladder = eggs.eggs.filter((e) => e.section === 'ladder');
    expect(ladder).toHaveLength(8);
    expect(ladder.slice(1).map((e, i) => e.price.coins / ladder[i]!.price.coins)).toEqual([10, 10, 10, 5, 3, 3, 3]);
    for (const s of ['free', 'seasonal', 'reward'] as const) expect(eggs.eggs.some((e) => e.section === s)).toBe(true);
    for (const e of eggs.eggs.filter((x) => !x.special)) expect(style.eggs[e.id], e.id).toBeTruthy();
    expect(eggs.care.shell.length).toBeGreaterThanOrEqual(2);
  });

  it('characters with a temper and hobbies; market, gifts and side job numbers', () => {
    expect(customers.characters.map((c) => c.id)).toEqual(['chatty', 'greedy', 'hasty', 'collector', 'rich', 'troll']);
    expect(customers.hobbies.length).toBeGreaterThanOrEqual(6);
    expect(market.refreshSec).toEqual({ min: 60, max: 90 });
    expect(market.price.min).toBeLessThan(1);
    expect(gifts.daily.map((d) => d.day)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(gifts.subscribe.map((s) => s.id).sort()).toEqual(['telegram', 'vk']);
    expect(work.priceGrowth).toBe(2.3);
  });

  it('broken frame data fails: odds off 100, a gap in the ladder, an unknown gift egg', () => {
    const a = clone(files);
    ((a['eggs.json']!.eggs as Array<{ chances: Record<string, number> }>)[0]!.chances).common! += 1;
    expect(validateContent(a, game).errors).toContainEqual(expect.stringContaining('expected 100'));
    const b = clone(files);
    (b['eggs.json']!.eggs as Array<{ id: string; price: { coins: number } }>).find((e) => e.id === 'egg_odd')!.price.coins = 900;
    expect(validateContent(b, game).errors).toContainEqual(expect.stringContaining('expected ×10'));
    const c = clone(files);
    ((c['gifts.json']!.review as { reward: { egg: string } }).reward.egg = 'egg_nope');
    expect(validateContent(c, game).errors).toContainEqual(expect.stringContaining('unknown egg "egg_nope"'));
  });
});

describe('FB-09 burst levels', () => {
  it('stronger by rarity, ≤ 1.5 s, VIP and exclusive with their own sound, the exclusive one on the whole screen', async () => {
    const b = (JSON.parse(readFileSync(resolve(import.meta.dirname, '../content/feel.json'), 'utf8')) as { burst: import('../src/content/schemas.ts').FeelData['burst'] }).burst;
    expect(b.sec).toBeLessThanOrEqual(1.5);
    const order = [b.good, b.valuable, b.premium, b.vip, b.exclusive];
    for (let i = 1; i < order.length; i++) expect(order[i]!.sparks + order[i]!.salutes * 20).toBeGreaterThan(order[i - 1]!.sparks + order[i - 1]!.salutes * 20);
    expect(b.valuable.flash).toBeGreaterThan(0);
    expect(b.premium.salutes).toBeGreaterThan(0);
    expect(b.vip.sound).toBe('vip');
    expect(b.exclusive.sound).toBe('exclusive');
    expect(b.exclusive.full && b.exclusive.shake > 0).toBe(true);
  });
});
