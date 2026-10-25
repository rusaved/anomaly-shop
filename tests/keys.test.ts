import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') ? [p] : [];
  });

describe('SCR-05 keys (M7-01)', () => {
  it('keys are optional and read by event.code: no event.key, keyCode, Ctrl or Meta combos, F1–F12 in src/', () => {
    const bad: string[] = [];
    for (const f of files(resolve(import.meta.dirname, '../src'))) {
      readFileSync(f, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (/^\s*(\/\/|\*)/.test(line)) return;
          if (/\be\.key\b|\bevent\.key\b|keyCode|\bwhich\b\s*===|ctrlKey|metaKey|['"]F([1-9]|1[0-2])['"]/.test(line)) bad.push(`${f}:${i + 1}`);
        });
    }
    expect(bad).toEqual([]);
  });
});
