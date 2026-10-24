import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { zipSync, strToU8 } from 'fflate';
import { describe, expect, it } from 'vitest';

/** RD-05: the new checks of check-release go red on a planted mistake (the green run is the release archive in verify). */
describe('check-release on a planted mistake', () => {
  it('fails the address, SDK order, Web Audio and language checks', () => {
    const dir = mkdtempSync(join(tmpdir(), 'check-release-'));
    const zip = join(dir, 'bad.zip');
    writeFileSync(
      zip,
      zipSync({
        'index.html': strToU8('<html><script type="module" src="./a.js"></script><script src="/sdk.js"></script></html>'),
        'a.js': strToU8('const help = "https://example.com/help"; const s = document.createElement("audio");'),
      }),
    );
    const content = join(dir, 'content');
    mkdirSync(join(content, 'i18n'), { recursive: true });
    writeFileSync(join(content, 'i18n/ru.json'), JSON.stringify({ 'ui.a': 'Да', 'ui.b': 'Нет' }));
    writeFileSync(join(content, 'i18n/en.json'), JSON.stringify({ 'ui.a': 'Yes', 'ui.c': 'Привет' }));
    writeFileSync(join(content, 'species.json'), JSON.stringify({ items: [{ name: { ru: 'Кот', en: '' } }] }));
    const report = join(dir, 'report.txt');
    const run = spawnSync(process.execPath, [resolve('scripts/check-release.mjs'), zip, '--report', report, '--content', content], { encoding: 'utf8' });
    expect(run.status).toBe(1);
    const text = readFileSync(report, 'utf8');
    for (const n of [3, 4, 5, 8]) expect(text).toMatch(new RegExp(`FAIL  ${n}\\.`));
    expect(text).toContain('address in a string: https://example.com/help');
    expect(text).toContain('after the game code');
    expect(text).toContain('createElement(audio/video)');
    expect(text).toContain('en misses ui.b');
    expect(text).toContain('ru misses ui.c');
    expect(text).toContain('en has Cyrillic: ui.c');
    expect(text).toContain('species.json.items[0].name: no en');
  });
});
