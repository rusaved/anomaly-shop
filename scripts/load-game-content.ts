// Game content for Node (tests and `npm run sim:balance`): content/*.json through the same valibot schemas as the game,
// without the bundler (no @content alias). Builder notes ($schema, note) are dropped by the schemas.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as v from 'valibot';
import { AdsFile, HaggleFile, AchievementsFile, CalendarFile, CollectionFile, CustomersFile, DecorFile, FeelFile, PaceFile, ReputationFile, EggsFile, EventsFile, CodesFile, FtueFile, GiftsFile, MarketFile, SecretsFile, SpeciesFile, UpgradesFile, WorkFile } from '../src/content/schemas.ts';
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
    secrets: v.parse(SecretsFile, json('secrets.json')),
    market: v.parse(MarketFile, json('market.json')),
    gifts: v.parse(GiftsFile, json('gifts.json')),
    work: v.parse(WorkFile, json('work.json')),
    codes: v.parse(CodesFile, json('codes.json')),
    reputation: v.parse(ReputationFile, json('reputation.json')),
    collection: v.parse(CollectionFile, json('collection.json')),
    decor: v.parse(DecorFile, json('decor.json')),
    achievements: v.parse(AchievementsFile, json('achievements.json')),
    calendar: v.parse(CalendarFile, json('calendar.json')),
    ads: v.parse(AdsFile, json('ads.json')),
    haggle: v.parse(HaggleFile, json('haggle.json')),
  };
}

/** Q-027 B: the live tempo of the balance model — content/pace.json plus the hatch show of feel.json. */
export type Pace = v.InferOutput<typeof PaceFile> & { hatchSec: number };
export function loadPace(): Pace {
  return { ...v.parse(PaceFile, json('pace.json')), hatchSec: v.parse(FeelFile, json('feel.json')).hatchShowSec };
}
