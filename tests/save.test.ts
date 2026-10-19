import { describe, expect, it } from 'vitest';
import { newSave, normalize, parseSave, SAVE_LIMIT_BYTES, SAVE_TARGET_BYTES, SAVE_VERSION, saveSize, serialize, type SaveData } from '../src/sim/state.ts';
import { migrate, MIGRATIONS, runMigrations, type Migration } from '../src/sim/migrate.ts';
import { createStore } from '../src/sim/store.ts';

/** Saves (docs/02-tech.md, sections 4.3 and 7; docs/03 SAV-05): schema, migrations, size, store commits. */
describe('SaveData', () => {
  it('serialize → parse → normalize is the identity for a fresh save', () => {
    const s = newSave(1000);
    expect(normalize(parseSave(serialize(s)), 2000)).toEqual(s);
  });

  it('normalize fills missing fields and drops broken ones; parseSave rejects junk', () => {
    const n = normalize({ v: 1, coins: -5, creatures: [{ uid: 'a', species: 'kettle', level: 'x' }, { species: 'no-uid' }, 7], settings: { lang: 'xx' } }, 50);
    expect(n.coins).toBe(0);
    expect(n.creatures).toEqual([{ uid: 'a', species: 'kettle', level: 1, fed: 0, hatchedAt: 0, age: 0, mult: 1 }]);
    expect(n.settings).toEqual({ sound: true, lang: null, vibrate: true });
    expect(n.incubators).toHaveLength(1);
    expect(n.createdAt).toBe(50);
    for (const junk of ['{broken', '[]', '"x"', '{"coins":1}', '', null, undefined]) expect(parseSave(junk)).toBeNull();
    expect(parseSave('{"v":1}')).toEqual({ v: 1 });
  });

  it('a full shop stays far below the 100 KB limit (and below the 50 KB target)', () => {
    const s: SaveData = newSave(0);
    s.incubators = Array.from({ length: 4 }, () => ({ egg: 'egg_basic', startedAt: 1700000000000, progress: 1.5, elapsed: 1.2, waiting: false }));
    s.creatures = Array.from({ length: 60 }, (_, i) => ({ uid: `c${i}-${Math.round(i * 1234567.89)}`, species: 'mirrorfrog', level: 20, fed: 7, hatchedAt: 1700000000000 + i, age: 0 }));
    s.showcase = s.creatures.slice(0, 8).map((c) => c.uid);
    for (let i = 0; i < 40; i++) s.collection[`species_${i}`] = { seen: 99, hatched: 99, sold: 99 };
    for (let i = 0; i < 12; i++) s.upgrades[`upgrade_${i}`] = 5;
    for (let i = 0; i < 40; i++) s.flags[`flag_${i}`] = true;
    const size = saveSize(s);
    expect(size).toBeLessThan(SAVE_LIMIT_BYTES);
    expect(size).toBeLessThan(SAVE_TARGET_BYTES);
  });
});

describe('migrations', () => {
  it('runs every step from the save version to the target and stamps v', () => {
    const table: Record<number, Migration> = {
      1: (raw) => ({ ...raw, crystals: 5 }),
      2: (raw) => ({ ...raw, gems: raw.crystals }),
    };
    expect(runMigrations({ v: 1, coins: 3 }, table, 3)).toEqual({ v: 3, coins: 3, crystals: 5, gems: 5 });
    expect(runMigrations({ v: 2, coins: 3 }, table, 3)).toEqual({ v: 3, coins: 3, gems: undefined });
    expect(runMigrations({ v: 3 }, table, 3)).toEqual({ v: 3 });
  });

  it('SAV-05 a newer or unreachable version means a fresh profile (null)', () => {
    expect(runMigrations({ v: SAVE_VERSION + 1 }, MIGRATIONS, SAVE_VERSION)).toBeNull();
    expect(runMigrations({ v: 0 }, {}, 1)).toBeNull();
    expect(migrate({ v: SAVE_VERSION + 5, coins: 1 }, 0)).toBeNull();
  });

  it('the live table reaches SAVE_VERSION from every version it knows', () => {
    for (let v = 0; v < SAVE_VERSION; v++) {
      if (MIGRATIONS[v]) expect(runMigrations({ v }, MIGRATIONS, SAVE_VERSION)?.v).toBe(SAVE_VERSION);
    }
    expect(migrate({ v: SAVE_VERSION, coins: 12, creatures: [{ uid: 'x', species: 'kettle', level: 3, fed: 1, hatchedAt: 1 }] }, 9)).toMatchObject({ coins: 12, creatures: [{ uid: 'x', level: 3 }] });
  });
});

describe('store', () => {
  it('commit bumps rev and savedAt and tells the listeners; flush is passed through', () => {
    let t = 100;
    const store = createStore(newSave(0), () => t);
    const seen: Array<[number, boolean]> = [];
    store.onCommit((s, flush) => seen.push([s.rev, flush]));
    store.state.coins += 10;
    store.commit();
    t = 200;
    store.commit({ flush: true });
    expect(store.state.rev).toBe(2);
    expect(store.state.savedAt).toBe(200);
    expect(seen).toEqual([[1, false], [2, true]]);
    const fresh = newSave(300);
    store.replace(fresh);
    expect(store.state).toBe(fresh);
    expect(seen[2]).toEqual([1, true]);
  });
});
