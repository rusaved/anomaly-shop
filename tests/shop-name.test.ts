import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRng } from '../src/core/rng.ts';
import { createGame, type GameEvent } from '../src/sim/game.ts';
import { nameBlocked, wordHash } from '../src/sim/rules.ts';
import { newSave } from '../src/sim/state.ts';
import { createStore } from '../src/sim/store.ts';
import * as v from 'valibot';
import { NewsFile } from '../src/content/schemas.ts';
import { pickNews, newsFits } from '../src/sim/news.ts';
import { loadGameContent } from '../scripts/load-game-content.ts';
import { blockedHashes } from '../scripts/stopword-hashes.mjs';

/** M6-23 (docs/01b §5.8): the player names the shop; the name is in the news and the buyers' lines; secret names give a find; stop-words are not taken. */
const content = loadGameContent();
const news = v.parse(NewsFile, JSON.parse(readFileSync(resolve(import.meta.dirname, '../content/news.json'), 'utf8')));
const stop = JSON.parse(readFileSync(resolve(import.meta.dirname, '../scripts/stopwords.json'), 'utf8')) as { brands: string[]; gambling: string[] };

function shop() {
  const save = newSave(0);
  Object.assign(save.flags, { ftue_starter: true, ftue_done: true });
  const game = createGame(createStore(save, () => 0), content, createRng(2));
  const seen: GameEvent[] = [];
  game.events.on((e) => seen.push(e));
  return { game, seen };
}

describe('M6-23 shop name', () => {
  it('the hashes in content/secrets.json are the stop-list of today (run node scripts/stopword-hashes.mjs after editing it)', () => {
    expect(content.secrets.shopName.blocked).toEqual(blockedHashes());
  });

  it('a name is saved trimmed; empty and too long ones are not; stop-words are not taken, alone, inside a name or in any case', () => {
    const { game, seen } = shop();
    expect(game.setShopName('   ')).toBe('empty');
    expect(game.setShopName('я'.repeat(content.secrets.shopName.maxLength + 1))).toBe('long');
    for (const w of [...stop.brands.slice(0, 5), ...stop.gambling.slice(0, 3)]) {
      expect(game.setShopName(w), w).toBe('blocked');
      expect(game.setShopName(`Лавка ${w.toUpperCase()}`), w).toBe('blocked');
    }
    expect(game.setShopName('  Чайная   лавка ')).toBe('ok');
    expect(game.state.shopName).toBe('Чайная лавка');
    expect(seen.find((e) => e.type === 'shopNamed')).toEqual({ type: 'shopNamed', name: 'Чайная лавка', secret: false });
    expect(nameBlocked('Чайная лавка', content.secrets.shopName.blocked)).toBe(false);
    expect(wordHash('Ёлка')).toBe(wordHash('елка'));
  });

  it('a secret name (any language, any case) marks the find «Secret Name»', () => {
    const { game } = shop();
    const secret = content.secrets.shopName.secret[0]!;
    expect(game.setShopName(secret.en.toUpperCase())).toBe('ok');
    expect(game.state.flags.seen_secret_name).toBe(true);
    game.tick(1.1);
    expect(game.finds().find((f) => f.id === 'secret_name')?.got).toBe(true);
  });

  it('the news speaks of the name only when there is one', () => {
    const lines = news.lines.filter((l) => l.when.type === 'named');
    expect(lines.length).toBeGreaterThanOrEqual(3);
    for (const l of lines) for (const text of [l.ru, l.en]) expect(text).toContain('{shop}');
    const ctx = { deals: 0, coins: 0, species: [], upgrades: [], districts: [], hour: 13, idleSec: 0, events: [] };
    expect(newsFits({ type: 'named' }, ctx)).toBe(false);
    expect(newsFits({ type: 'named' }, { ...ctx, shop: 'Чайная' })).toBe(true);
    expect(pickNews(news, { ...ctx, shop: 'Чайная' }, [], 0.5, true)).toBeGreaterThanOrEqual(0);
  });
});
