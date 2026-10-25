import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const json = (name: string) => JSON.parse(readFileSync(resolve(import.meta.dirname, '../content', name), 'utf8'));

describe('release content (M7-01)', () => {
  it('GD-06 nothing is promised «in an update»: the seller level lists only what the game already has', () => {
    expect(json('reputation.json').future).toEqual([]);
  });
});
