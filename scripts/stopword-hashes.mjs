// `node scripts/stopword-hashes.mjs` (M6-23): writes the stop-list of shop names into content/secrets.json → shopName.blocked as hashes.
// Words: the brands, gambling and network lists of scripts/stopwords.json (the only place they are written literally); the game checks a name
// against the hashes (src/sim/rules.ts nameBlocked). tests/shop-name.test.ts fails when the hashes and the stop-list drift apart.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { wordHash } from '../src/sim/rules.ts';

const root = resolve(import.meta.dirname, '..');
const stop = JSON.parse(readFileSync(resolve(root, 'scripts/stopwords.json'), 'utf8'));
export const blockedHashes = () => [...new Set([...stop.brands, ...stop.gambling, ...stop.onlineWords].map(wordHash))].sort();

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const file = resolve(root, 'content/secrets.json');
  const text = readFileSync(file, 'utf8');
  const next = text.replace(/"blocked": \[[^\]]*\]/, `"blocked": ${JSON.stringify(blockedHashes()).replace(/,/g, ', ')}`);
  writeFileSync(file, next);
  console.log(`stopword-hashes: ${blockedHashes().length} hashes in content/secrets.json`);
}
