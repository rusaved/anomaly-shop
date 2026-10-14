// Game content for Node (tests and `npm run sim:balance`): content/*.json through the same valibot schemas as the game,
// without the bundler (no @content alias). Builder notes ($schema, note) are dropped by the schemas.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as v from 'valibot';
import { CustomersFile, EggsFile, EventsFile, FtueFile, SpeciesFile, UpgradesFile } from '../src/content/schemas.ts';
import type { GameContent } from '../src/sim/game.ts';

const root = resolve(import.meta.dirname, '..');
const json = (name: string): unknown => JSON.parse(readFileSync(resolve(root, 'content', name), 'utf8'));

export function loadGameContent(): GameContent {
  return {
    eggs: v.parse(EggsFile, json('eggs.json')),
    species: v.parse(SpeciesFile, json('species.json')),
    customers: v.parse(CustomersFile, json('customers.json')),
    upgrades: v.parse(UpgradesFile, json('upgrades.json')),
    ftue: v.parse(FtueFile, json('ftue.json')),
    events: v.parse(EventsFile, json('events.json')),
  };
}
