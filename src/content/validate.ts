// What: content validator for `npm run validate:content` and the unit tests: schemas plus cross-file checks.
// Called by: scripts/validate-content.mjs (Node, no bundler: relative imports with .ts only), tests/content.test.ts.
// Keep: the contract validateContent(files, game) => { ok, errors }; errors read "file: path — problem".

import * as v from 'valibot';
import {
  CalendarFile,
  CustomersFile,
  EggsFile,
  GameFile,
  I18nFile,
  RARITIES,
  SpeciesFile,
  StyleFile,
  UpgradesFile,
  type CalendarData,
  type CustomersData,
  type EggsData,
  type GameData,
  type I18nData,
  type SpeciesData,
  type UpgradesData,
} from './schemas.ts';

type Json = unknown;
type Files = Record<string, Json>;

export const REQUIRED_FILES = ['eggs.json', 'species.json', 'customers.json', 'upgrades.json', 'calendar.json', 'style.json'] as const;

const CYRILLIC = /[\u0400-\u04ff]/;
const PLACEHOLDER = /\{[a-zA-Z0-9_]+\}/g;

function issuePath(issue: v.BaseIssue<unknown>): string {
  return (issue.path ?? []).map((p) => String(p.key)).join('.') || '(root)';
}

/** Parses one file against its schema; pushes "file: path — message" for every issue. */
function parseFile<S extends v.BaseSchema<unknown, unknown, v.BaseIssue<unknown>>>(name: string, schema: S, data: Json, errors: string[]): v.InferOutput<S> | null {
  if (data === undefined) {
    errors.push(`${name}: (root) — file is missing`);
    return null;
  }
  const result = v.safeParse(schema, data);
  if (result.success) return result.output;
  for (const issue of result.issues) errors.push(`${name}: ${issuePath(issue)} — ${issue.message}`);
  return null;
}

function duplicates(name: string, what: string, ids: string[], errors: string[]): void {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) errors.push(`${name}: ${what} — duplicate id "${id}"`);
    seen.add(id);
  }
}

function checkEggs(eggs: EggsData, customers: CustomersData | null, errors: string[]): void {
  duplicates('eggs.json', 'eggs', eggs.eggs.map((e) => e.id), errors);
  const districts = new Set((customers?.districts ?? []).map((d) => d.id));
  eggs.eggs.forEach((egg, i) => {
    const sum = RARITIES.reduce((s, r) => s + egg.chances[r], 0);
    if (!egg.special && Math.abs(sum - 100) > 1e-9) errors.push(`eggs.json: eggs.${i}.chances — sum is ${sum}, expected 100`);
    if (egg.unlock.type === 'district' && customers && !districts.has(egg.unlock.id)) errors.push(`eggs.json: eggs.${i}.unlock.id — unknown district "${egg.unlock.id}"`);
    if (egg.hatchSec < eggs.minHatchSec && !egg.special) errors.push(`eggs.json: eggs.${i}.hatchSec — below minHatchSec ${eggs.minHatchSec}`);
  });
}

function checkSpecies(species: SpeciesData, eggs: EggsData | null, errors: string[]): void {
  duplicates('species.json', 'species', species.species.map((s) => s.id), errors);
  if (!eggs) return;
  const present = new Set(species.species.map((s) => s.rarity));
  for (const r of RARITIES) {
    const needed = eggs.eggs.some((e) => !e.special && e.chances[r] > 0);
    if (needed && !present.has(r)) errors.push(`species.json: species — no species of rarity "${r}", but an egg can hatch it`);
  }
}

function checkCustomers(customers: CustomersData, errors: string[]): void {
  duplicates('customers.json', 'districts', customers.districts.map((d) => d.id), errors);
  duplicates('customers.json', 'districts.customer', customers.districts.map((d) => d.customer.id), errors);
  if (customers.bargainBonus.min > customers.bargainBonus.max) errors.push('customers.json: bargainBonus — min above max');
  customers.districts.forEach((d, i) => {
    if (d.customer.offer.min > d.customer.offer.max) errors.push(`customers.json: districts.${i}.customer.offer — min above max`);
    if (d.unlock.type === 'district') errors.push(`customers.json: districts.${i}.unlock — a district cannot unlock by district`);
  });
  if (!customers.districts.some((d) => d.unlock.type === 'start')) errors.push('customers.json: districts — no district is open at start');
}

function checkUpgrades(upgrades: UpgradesData, eggs: EggsData | null, errors: string[]): void {
  duplicates('upgrades.json', 'upgrades', upgrades.upgrades.map((u) => u.id), errors);
  const eggIds = new Set((eggs?.eggs ?? []).map((e) => e.id));
  upgrades.upgrades.forEach((u, i) => {
    if (u.priceMax < u.price1) errors.push(`upgrades.json: upgrades.${i}.priceMax — below price1`);
    if (u.levels === 1 && u.priceMax !== u.price1) errors.push(`upgrades.json: upgrades.${i}.priceMax — one level, so priceMax must equal price1`);
    if (u.effect.type === 'autoBuyEgg' && eggs && !eggIds.has(u.effect.egg)) errors.push(`upgrades.json: upgrades.${i}.effect.egg — unknown egg "${u.effect.egg}"`);
  });
}

function checkCalendar(calendar: CalendarData, eggs: EggsData | null, errors: string[]): void {
  if (eggs && !eggs.eggs.some((e) => e.id === calendar.daily.eggId)) errors.push(`calendar.json: daily.eggId — unknown egg "${calendar.daily.eggId}"`);
  duplicates('calendar.json', 'tasks.pool', calendar.tasks.pool.map((t) => t.id), errors);
  if (calendar.tasks.pool.length < calendar.tasks.perDay) errors.push(`calendar.json: tasks.pool — fewer tasks than perDay ${calendar.tasks.perDay}`);
  calendar.login.forEach((entry, i) => {
    if (entry.day !== i + 1) errors.push(`calendar.json: login.${i}.day — expected ${i + 1}`);
  });
  duplicates('calendar.json', 'events', calendar.events.map((e) => e.id), errors);
  calendar.events.forEach((e, i) => {
    if (e.from > e.to) errors.push(`calendar.json: events.${i} — from is after to`);
  });
}

function checkI18n(game: GameData, dicts: Record<string, I18nData | null>, errors: string[]): void {
  const base = dicts[game.fallbackLanguage];
  if (!base) return;
  const baseKeys = Object.keys(base);
  for (const lang of game.languages) {
    const dict = dicts[lang];
    if (!dict) continue;
    const name = `i18n/${lang}.json`;
    for (const key of baseKeys) if (!(key in dict)) errors.push(`${name}: ${key} — missing (present in ${game.fallbackLanguage})`);
    for (const key of Object.keys(dict)) {
      if (!(key in base)) errors.push(`${name}: ${key} — not in ${game.fallbackLanguage}.json`);
      const a = (base[key] ?? '').match(PLACEHOLDER)?.sort().join(',') ?? '';
      const b = (dict[key] ?? '').match(PLACEHOLDER)?.sort().join(',') ?? '';
      if (key in base && a !== b) errors.push(`${name}: ${key} — placeholders differ from ${game.fallbackLanguage} (${a || 'none'} vs ${b || 'none'})`);
    }
    if (lang === 'en') {
      for (const [key, value] of Object.entries(dict)) if (!key.startsWith('lang.') && CYRILLIC.test(value)) errors.push(`${name}: ${key} — Cyrillic in the English text`);
    }
  }
}

/** Strips builder notes ("$schema", "note") before schema parsing: they are never game data. */
function data(json: Json): Json {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return json;
  const out: Record<string, Json> = {};
  for (const [k, val] of Object.entries(json as Record<string, Json>)) if (k !== '$schema' && k !== 'note') out[k] = val;
  return out;
}

export function validateContent(files: Files, gameJson: Json): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  const game = parseFile('game.json', GameFile, data(gameJson), errors);
  const eggs = parseFile('eggs.json', EggsFile, data(files['eggs.json']), errors);
  const species = parseFile('species.json', SpeciesFile, data(files['species.json']), errors);
  const customers = parseFile('customers.json', CustomersFile, data(files['customers.json']), errors);
  const upgrades = parseFile('upgrades.json', UpgradesFile, data(files['upgrades.json']), errors);
  const calendar = parseFile('calendar.json', CalendarFile, data(files['calendar.json']), errors);
  parseFile('style.json', StyleFile, data(files['style.json']), errors);

  if (eggs) checkEggs(eggs, customers, errors);
  if (species) checkSpecies(species, eggs, errors);
  if (customers) checkCustomers(customers, errors);
  if (upgrades) checkUpgrades(upgrades, eggs, errors);
  if (calendar) checkCalendar(calendar, eggs, errors);

  if (game) {
    if (!game.languages.includes(game.fallbackLanguage)) errors.push('game.json: fallbackLanguage — not in languages');
    const dicts: Record<string, I18nData | null> = {};
    for (const lang of game.languages) dicts[lang] = parseFile(`i18n/${lang}.json`, I18nFile, data(files[`i18n/${lang}.json`]), errors);
    checkI18n(game, dicts, errors);
  }
  for (const name of Object.keys(files)) {
    if (!(REQUIRED_FILES as readonly string[]).includes(name) && !/^i18n\/[a-z]{2}\.json$/.test(name)) errors.push(`${name}: (root) — unexpected content file (no schema)`);
  }
  return { ok: errors.length === 0, errors };
}
