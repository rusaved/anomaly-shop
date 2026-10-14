// What: content validator for `npm run validate:content` and the unit tests: schemas plus cross-file checks.
// Called by: scripts/validate-content.mjs (Node, no bundler: relative imports with .ts only), tests/content.test.ts.
// Keep: the contract validateContent(files, game) => { ok, errors }; errors read "file: path — problem".

import * as v from 'valibot';
import {
  CalendarFile,
  CustomersFile,
  AudioFile,
  EggsFile,
  FeelFile,
  FtueFile,
  GameFile,
  I18nFile,
  NewsFile,
  EventsFile,
  SecretsFile,
  LinesFile,
  MarketFile,
  GiftsFile,
  WorkFile,
  CodesFile,
  ReputationFile,
  RARITIES,
  SpeciesFile,
  StyleFile,
  UpgradesFile,
  type CalendarData,
  type CustomersData,
  type GiftsData,
  type MarketData,
  type RewardData,
  type EggsData,
  type FtueData,
  type GameData,
  type I18nData,
  type NewsData,
  type SpeciesData,
  type StyleData,
  type UpgradesData,
} from './schemas.ts';

type Json = unknown;
type Files = Record<string, Json>;

export const REQUIRED_FILES = ['eggs.json', 'species.json', 'customers.json', 'upgrades.json', 'calendar.json', 'style.json', 'ftue.json', 'feel.json', 'audio.json', 'news.json', 'events.json', 'secrets.json', 'lines.json', 'market.json', 'gifts.json', 'work.json', 'codes.json', 'reputation.json'] as const;
/** The egg price ladder (docs/01 §3 p. 12): eight steps, each ×10 the one before. */
const LADDER_STEPS = 8;
const LADDER_STEP = 10;
/** Lines players read in the scene and the panel (news, creature and customer lines): no full stop at the end (docs/01a, section 8). */
const TRAILING_STOP = /[.。]$/;
/** Long dashes stay out of player texts (producer's style rule). */
const LONG_DASH = /—/;

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
  const rescue = eggs.eggs.find((e) => e.id === eggs.rescueEgg);
  if (!rescue || rescue.unlock.type !== 'start' || rescue.special) errors.push(`eggs.json: rescueEgg — "${eggs.rescueEgg}" must be an egg open from the start`);
  const districts = new Set((customers?.districts ?? []).map((d) => d.id));
  eggs.eggs.forEach((egg, i) => {
    const sum = RARITIES.reduce((s, r) => s + egg.chances[r], 0);
    if (!egg.special && Math.abs(sum - 100) > 1e-9) errors.push(`eggs.json: eggs.${i}.chances — sum is ${sum}, expected 100`);
    if (egg.unlock.type === 'district' && customers && !districts.has(egg.unlock.id)) errors.push(`eggs.json: eggs.${i}.unlock.id — unknown district "${egg.unlock.id}"`);
    if (egg.hatchSec < eggs.minHatchSec && !egg.special) errors.push(`eggs.json: eggs.${i}.hatchSec — below minHatchSec ${eggs.minHatchSec}`);
    if (egg.section === 'free' && !egg.freeEverySec) errors.push(`eggs.json: eggs.${i}.freeEverySec — a free egg needs its timer`);
    if (egg.section !== 'free' && egg.freeEverySec) errors.push(`eggs.json: eggs.${i}.freeEverySec — only free eggs have a timer`);
  });
  const ladder = eggs.eggs.filter((e) => e.section === 'ladder');
  if (ladder.length !== LADDER_STEPS) errors.push(`eggs.json: eggs — ${ladder.length} eggs on the ladder, expected ${LADDER_STEPS}`);
  ladder.forEach((e, i) => {
    const prev = ladder[i - 1];
    if (prev && Math.abs(e.price.coins / prev.price.coins - LADDER_STEP) > 1e-9) errors.push(`eggs.json: ${e.id}.price — expected ×${LADDER_STEP} the price of ${prev.id}`);
  });
  const care = eggs.care;
  if (care.warm.steps * care.warm.bonus + care.feed.steps * care.feed.bonus + care.ripe.bonus < care.maxBonus - 1e-9) errors.push('eggs.json: care.maxBonus — above what warmth, food and ripening can give');
}

/** Rewards point at real eggs (gifts, codes). */
function checkReward(file: string, path: string, reward: RewardData, eggs: EggsData | null, errors: string[]): void {
  if (reward.egg && eggs && !eggs.eggs.some((e) => e.id === reward.egg && !e.special)) errors.push(`${file}: ${path}.egg — unknown egg "${reward.egg}"`);
  if (!reward.egg && !reward.coins && !reward.crystals) errors.push(`${file}: ${path} — an empty reward`);
}

function playerLine(file: string, path: string, text: { ru: string; en: string }, errors: string[]): void {
  for (const lang of ['ru', 'en'] as const) {
    if (TRAILING_STOP.test(text[lang])) errors.push(`${file}: ${path}.${lang} — no full stop at the end`);
    if (LONG_DASH.test(text[lang])) errors.push(`${file}: ${path}.${lang} — no long dash in player texts`);
  }
  if (CYRILLIC.test(text.en)) errors.push(`${file}: ${path}.en — Cyrillic in the English text`);
}

function checkMarket(market: MarketData, errors: string[]): void {
  for (const k of ['refreshSec', 'price', 'level', 'hobbyDiscount'] as const) if (market[k].min > market[k].max) errors.push(`market.json: ${k} — min above max`);
  if (market.price.min >= 1) errors.push('market.json: price.min — no lot would be below the market');
  if (market.replySec.min > market.replySec.max) errors.push('market.json: replySec — min above max');
  // Cheaper zones answer faster: the delays grow from the first zone to the last.
  if (market.slider.delay.some((d, i) => i > 0 && d < (market.slider.delay[i - 1] ?? 0))) errors.push('market.json: slider.delay — must grow from zone to zone');
  if (market.slider.min >= 1) errors.push('market.json: slider.min — the slider must reach below the market');
}

function checkGifts(gifts: GiftsData, eggs: EggsData | null, errors: string[]): void {
  gifts.subscribe.forEach((s, i) => checkReward('gifts.json', `subscribe.${i}.reward`, s.reward, eggs, errors));
  duplicates('gifts.json', 'subscribe', gifts.subscribe.map((s) => s.id), errors);
  checkReward('gifts.json', 'review.reward', gifts.review.reward, eggs, errors);
  gifts.daily.forEach((d, i) => {
    if (d.day !== i + 1) errors.push(`gifts.json: daily.${i}.day — expected ${i + 1}`);
    checkReward('gifts.json', `daily.${i}.reward`, d.reward, eggs, errors);
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
  customers.districts.forEach((d, i) => {
    if (d.customer.offer.min > d.customer.offer.max) errors.push(`customers.json: districts.${i}.customer.offer — min above max`);
    if (d.unlock.type === 'district') errors.push(`customers.json: districts.${i}.unlock — a district cannot unlock by district`);
  });
  if (!customers.districts.some((d) => d.unlock.type === 'start')) errors.push('customers.json: districts — no district is open at start');
  if (customers.people.names.length < 20) errors.push(`customers.json: people.names — ${customers.people.names.length} names, 20 at least (M2-18)`);
  duplicates('customers.json', 'people.names', customers.people.names.map((n) => n.ru), errors);
  duplicates('customers.json', 'characters', customers.characters.map((c) => c.id), errors);
  duplicates('customers.json', 'hobbies', customers.hobbies.map((h) => h.id), errors);
  customers.characters.forEach((c, i) => {
    if (c.offer.min > c.offer.max) errors.push(`customers.json: characters.${i}.offer — min above max`);
  });
  if (!customers.characters.some((c) => c.weight > 0)) errors.push('customers.json: characters — every weight is 0');
  customers.hobbies.forEach((h, i) => playerLine('customers.json', `hobbies.${i}.line`, h.line, errors));
  // Chat lines (M3-08): 8 words at most, {n} in the offers.
  customers.characters.forEach((c, i) => {
    for (const [ctx, pool] of Object.entries(c.lines))
      pool.forEach((line, j) => {
        const path = `characters.${i}.lines.${ctx}.${j}`;
        playerLine('customers.json', path, line, errors);
        for (const lang of ['ru', 'en'] as const) {
          if (line[lang].trim().split(/\s+/).length > 8) errors.push(`customers.json: ${path}.${lang} — more than 8 words`);
          if ((ctx === 'offer' || ctx === 'last') && !line[lang].includes('{n}')) errors.push(`customers.json: ${path}.${lang} — no {n} for the price`);
        }
      });
  });
  customers.people.names.forEach((n, i) => {
    if (CYRILLIC.test(n.en)) errors.push(`customers.json: people.names.${i}.en — Cyrillic in the English text`);
  });
}

function checkUpgrades(upgrades: UpgradesData, eggs: EggsData | null, errors: string[]): void {
  duplicates('upgrades.json', 'upgrades', upgrades.upgrades.map((u) => u.id), errors);
  const eggIds = new Set((eggs?.eggs ?? []).map((e) => e.id));
  upgrades.upgrades.forEach((u, i) => {
    if (u.priceMax < u.price1) errors.push(`upgrades.json: upgrades.${i}.priceMax — below price1`);
    if (u.levels === 1 && u.priceMax !== u.price1) errors.push(`upgrades.json: upgrades.${i}.priceMax — one level, so priceMax must equal price1`);
    if (u.effect.type === 'autoBuyEgg' && eggs && !eggIds.has(u.effect.egg)) errors.push(`upgrades.json: upgrades.${i}.effect.egg — unknown egg "${u.effect.egg}"`);
  });
  upgrades.shop.forEach((id, i) => {
    if (!upgrades.upgrades.some((u) => u.id === id)) errors.push(`upgrades.json: shop.${i} — unknown upgrade "${id}"`);
  });
  duplicates('upgrades.json', 'shop', upgrades.shop, errors);
}

function checkCalendar(calendar: CalendarData, eggs: EggsData | null, errors: string[]): void {
  if (eggs && !eggs.eggs.some((e) => e.id === calendar.daily.eggId)) errors.push(`calendar.json: daily.eggId — unknown egg "${calendar.daily.eggId}"`);
  duplicates('calendar.json', 'tasks.pool', calendar.tasks.pool.map((t) => t.id), errors);
  if (calendar.tasks.pool.length < calendar.tasks.perDay) errors.push(`calendar.json: tasks.pool — fewer tasks than perDay ${calendar.tasks.perDay}`);
  duplicates('calendar.json', 'events', calendar.events.map((e) => e.id), errors);
  calendar.events.forEach((e, i) => {
    if (e.from > e.to) errors.push(`calendar.json: events.${i} — from is after to`);
  });
}

function checkLooks(style: StyleData, species: SpeciesData, errors: string[]): void {
  const seen = new Map<string, string>();
  for (const s of species.species) {
    const look = style.creatures[s.id];
    if (!look) {
      errors.push(`style.json: creatures.${s.id} — no look for this species (shape and colors)`);
      continue;
    }
    const key = `${look.shape}:${look.body.toLowerCase()}`;
    const twin = seen.get(key);
    if (twin) errors.push(`style.json: creatures.${s.id} — same shape and body color as "${twin}", the two would look alike`);
    seen.set(key, s.id);
  }
  for (const id of Object.keys(style.creatures)) if (!species.species.some((s) => s.id === id)) errors.push(`style.json: creatures.${id} — unknown species`);
}

function checkNews(news: NewsData, refs: { species: string[]; upgrades: string[]; districts: string[]; events: string[] | null }, errors: string[]): void {
  if (news.lines.length < 40) errors.push(`news.json: lines — ${news.lines.length} lines, 40 at least (M2-14)`);
  if (news.everySec.min > news.everySec.max) errors.push('news.json: everySec — min above max');
  news.lines.forEach((line, i) => {
    for (const lang of ['ru', 'en'] as const) {
      const text = line[lang];
      if (TRAILING_STOP.test(text)) errors.push(`news.json: lines.${i}.${lang} — no full stop at the end`);
      if (LONG_DASH.test(text)) errors.push(`news.json: lines.${i}.${lang} — no long dash in player texts`);
      if (text.length > 70) errors.push(`news.json: lines.${i}.${lang} — ${text.length} characters, 70 at most`);
    }
    if (CYRILLIC.test(line.en)) errors.push(`news.json: lines.${i}.en — Cyrillic in the English text`);
    const w = line.when;
    const known =
      w.type === 'species' ? refs.species : w.type === 'upgrade' ? refs.upgrades : w.type === 'district' ? refs.districts : w.type === 'event' ? refs.events : null;
    if (known && 'id' in w && !known.includes(w.id)) errors.push(`news.json: lines.${i}.when.id — unknown ${w.type} "${w.id}"`);
  });
}

function checkFtue(ftue: FtueData, eggs: EggsData | null, dicts: Record<string, I18nData | null>, errors: string[]): void {
  if (eggs && !eggs.eggs.some((e) => e.id === ftue.starterEgg && !e.special)) errors.push(`ftue.json: starterEgg — unknown egg "${ftue.starterEgg}"`);
  // docs/01, section 4 and section 9: first-minute hints are 6 words at most, in every language.
  for (const [lang, dict] of Object.entries(dicts)) {
    for (const [key, text] of Object.entries(dict ?? {})) {
      if (!key.startsWith('ftue.')) continue;
      const words = text.trim().split(/\s+/).length;
      if (words > ftue.maxHintWords) errors.push(`i18n/${lang}.json: ${key} — ${words} words, a first-minute hint has ${ftue.maxHintWords} at most`);
    }
  }
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
  const style = parseFile('style.json', StyleFile, data(files['style.json']), errors);
  const ftue = parseFile('ftue.json', FtueFile, data(files['ftue.json']), errors);
  parseFile('feel.json', FeelFile, data(files['feel.json']), errors);
  parseFile('audio.json', AudioFile, data(files['audio.json']), errors);
  const news = parseFile('news.json', NewsFile, data(files['news.json']), errors);
  const events = parseFile('events.json', EventsFile, data(files['events.json']), errors);
  const secrets = parseFile('secrets.json', SecretsFile, data(files['secrets.json']), errors);
  const lines = parseFile('lines.json', LinesFile, data(files['lines.json']), errors);
  const market = parseFile('market.json', MarketFile, data(files['market.json']), errors);
  const gifts = parseFile('gifts.json', GiftsFile, data(files['gifts.json']), errors);
  parseFile('work.json', WorkFile, data(files['work.json']), errors);
  const codes = parseFile('codes.json', CodesFile, data(files['codes.json']), errors);
  if (codes) {
    duplicates('codes.json', 'codes', codes.codes.map((c) => c.code), errors);
    codes.codes.forEach((c, i) => checkReward('codes.json', `codes.${i}.reward`, c.reward, eggs, errors));
  }
  const reputation = parseFile('reputation.json', ReputationFile, data(files['reputation.json']), errors);
  if (reputation) {
    // UB-08: levels start at 0 and grow; titles go up the levels; a level unlock names a level that exists.
    if (reputation.levels[0] !== 0) errors.push('reputation.json: levels.0 — the first level needs 0 points');
    reputation.levels.forEach((x, i) => {
      if (i > 0 && x <= reputation.levels[i - 1]!) errors.push(`reputation.json: levels.${i} — not above the level before`);
    });
    reputation.titles.forEach((t, i) => {
      if (i > 0 && t.from <= reputation.titles[i - 1]!.from) errors.push(`reputation.json: titles.${i}.from — not above the title before`);
    });
    const max = reputation.levels.length;
    const level = (file: string, path: string, u: { type: string; n?: number }): void => {
      if (u.type === 'level' && (u.n ?? 0) > max) errors.push(`${file}: ${path}.unlock.n — level ${u.n}, the top is ${max}`);
    };
    eggs?.eggs.forEach((e, i) => level('eggs.json', `eggs.${i}`, e.unlock));
    upgrades?.upgrades.forEach((u, i) => u.unlock && level('upgrades.json', `upgrades.${i}`, u.unlock));
    customers?.districts.forEach((d, i) => level('customers.json', `districts.${i}`, d.unlock));
    reputation.future.forEach((f, i) => {
      if (f.level > max) errors.push(`reputation.json: future.${i}.level — level ${f.level}, the top is ${max}`);
    });
  }
  if (market) checkMarket(market, errors);
  if (gifts) checkGifts(gifts, eggs, errors);
  if (lines) {
    // Every species and every customer type speaks; lines are short, end without a full stop, ru and en side by side (parity by design).
    if (species) for (const s of species.species) if (!lines.creatures[s.id]) errors.push(`lines.json: creatures.${s.id} — no lines for this species`);
    if (customers) for (const d of customers.districts) if (!lines.customers[d.customer.id]) errors.push(`lines.json: customers.${d.customer.id} — no lines for this customer type`);
    const check = (path: string, pool: Array<{ ru: string; en: string }>): void => {
      pool.forEach((line, i) => {
        for (const lang of ['ru', 'en'] as const) {
          const text = line[lang];
          const words = text.trim().split(/\s+/).length;
          if (words > lines.maxWords) errors.push(`lines.json: ${path}.${i}.${lang} — ${words} words, ${lines.maxWords} at most`);
          if (TRAILING_STOP.test(text)) errors.push(`lines.json: ${path}.${i}.${lang} — no full stop at the end`);
          if (LONG_DASH.test(text)) errors.push(`lines.json: ${path}.${i}.${lang} — no long dash in player texts`);
        }
        if (CYRILLIC.test(line.en)) errors.push(`lines.json: ${path}.${i}.en — Cyrillic in the English text`);
      });
    };
    for (const [id, set] of Object.entries(lines.creatures)) for (const [ctx, pool] of Object.entries(set)) check(`creatures.${id}.${ctx}`, pool);
    for (const [id, set] of Object.entries(lines.customers)) for (const [ctx, pool] of Object.entries(set)) check(`customers.${id}.${ctx}`, pool);
  }
  if (secrets) duplicates('secrets.json', 'secrets', secrets.secrets.map((x) => x.id), errors);
  if (events) {
    duplicates('events.json', 'events', events.events.map((e) => e.id), errors);
    for (const r of ['firstAfterSec', 'everySec'] as const) if (events[r].min > events[r].max) errors.push(`events.json: ${r} — min above max`);
    events.events.forEach((e, i) => {
      if (e.kind === 'sneeze' && e.coins.min > e.coins.max) errors.push(`events.json: events.${i}.coins — min above max`);
      if (e.kind === 'merchant' && eggs)
        for (const id of [e.mysteryPriceOf, e.mysteryEgg]) if (!eggs.eggs.some((x) => x.id === id)) errors.push(`events.json: events.${i} — unknown egg "${id}"`);
    });
  }

  if (eggs) checkEggs(eggs, customers, errors);
  if (species) checkSpecies(species, eggs, errors);
  if (customers) checkCustomers(customers, errors);
  if (upgrades) checkUpgrades(upgrades, eggs, errors);
  if (calendar) checkCalendar(calendar, eggs, errors);
  if (style && species) checkLooks(style, species, errors);
  if (news && species && upgrades && customers) {
    const events = (data(files['events.json']) as { events?: Array<{ id?: string }> } | undefined)?.events?.map((e) => String(e.id)) ?? null;
    checkNews(news, { species: species.species.map((s) => s.id), upgrades: upgrades.upgrades.map((u) => u.id), districts: customers.districts.map((d) => d.id), events }, errors);
  }
  if (style && customers)
    for (const d of customers.districts) if (!style.customers[d.customer.id]) errors.push(`style.json: customers.${d.customer.id} — no look for this customer type`);

  if (game) {
    if (!game.languages.includes(game.fallbackLanguage)) errors.push('game.json: fallbackLanguage — not in languages');
    const dicts: Record<string, I18nData | null> = {};
    for (const lang of game.languages) dicts[lang] = parseFile(`i18n/${lang}.json`, I18nFile, data(files[`i18n/${lang}.json`]), errors);
    checkI18n(game, dicts, errors);
    if (ftue) checkFtue(ftue, eggs, dicts, errors);
  }
  for (const name of Object.keys(files)) {
    if (!(REQUIRED_FILES as readonly string[]).includes(name) && !/^i18n\/[a-z]{2}\.json$/.test(name)) errors.push(`${name}: (root) — unexpected content file (no schema)`);
  }
  return { ok: errors.length === 0, errors };
}
