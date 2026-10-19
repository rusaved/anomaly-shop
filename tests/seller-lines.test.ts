import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SELLER_CONTEXTS } from '../src/content/schemas.ts';
import { loadGameContent } from '../scripts/load-game-content.ts';

/** FB-06 (Q-040 A): the seller on the Market speaks its own lines — yes, «no discount», a polite no — in ru and en, never a buyer's. */
const { customers } = loadGameContent();

describe('FB-06 seller lines', () => {
  it('every context has lines in ru and en', () => {
    for (const k of SELLER_CONTEXTS) {
      expect(customers.seller[k].length, k).toBeGreaterThanOrEqual(3);
      for (const l of customers.seller[k]) {
        expect(l.ru.trim(), k).not.toBe('');
        expect(l.en.trim(), k).not.toBe('');
      }
    }
  });

  it('no seller line is a buyer line', () => {
    const buyer = new Set(customers.characters.flatMap((c) => Object.values(c.lines).flat().map((l) => l.ru)));
    for (const k of SELLER_CONTEXTS) for (const l of customers.seller[k]) expect(buyer.has(l.ru), l.ru).toBe(false);
  });

  it('the lot page takes the seller pool, not the buyer character lines', () => {
    const src = readFileSync(new URL('../src/ui/seller.ts', import.meta.url), 'utf8');
    expect(src).toContain('look.sellerLines[ctx]');
    expect(src).not.toMatch(/ch\?\.lines\[/);
    expect(src).toContain("say('noDiscount')");
  });
});
