import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { collectErrors, open, seedSave } from './helpers.ts';
import { buttonsSeenWhole, FRAMES_SAVE, OPENERS, closeAll } from './frames-shared.ts';
import species from '../content/species.json' with { type: 'json' };
import stop from '../scripts/stopwords.json' with { type: 'json' };

/**
 * M6 frames on the producer's phone sizes (880×405 and 815×290, landscape): the 30 species in the collection and on the shelf,
 * each frame checked «every button is seen whole» (RD-02). M6_SHOTS=1 also saves them to docs/evidence/M6/screens/.
 */
const SIZES = [
  { width: 880, height: 405 },
  { width: 815, height: 290 },
];
const shotsDir = process.env.M6_SHOTS ? resolve(import.meta.dirname, '../docs/evidence/M6/screens') : null;
if (shotsDir) mkdirSync(shotsDir, { recursive: true });
const NEW = species.species.slice(0).filter((s) => !['kettle', 'sockfish', 'pillow', 'cloudcat', 'lampbug', 'cactus', 'jellytoast', 'mirrorfrog', 'shroom', 'teacup_dragon', 'sockfish_gold', 'moon_donut'].includes(s.id));

const frame = async (page: Page, problems: string[], name: string, tag: string): Promise<void> => {
  await page.waitForFunction(() => !document.querySelector('.toast'), null, { timeout: 8000 }).catch(() => undefined);
  await page.waitForTimeout(300);
  for (const p of await buttonsSeenWhole(page)) problems.push(`${name}: ${p}`);
  if (shotsDir) await page.screenshot({ path: `${shotsDir}/${name}_${tag}.png` });
};

for (const size of SIZES) {
  test.describe(`${size.width}x${size.height}`, () => {
    test.use({ viewport: size, isMobile: true, hasTouch: true });

    test(`M6-02 the 30 species: collection and the shelf @ ${size.width}x${size.height}`, async ({ page }) => {
      const errors = collectErrors(page);
      const tag = `${size.width}x${size.height}`;
      const problems: string[] = [];
      // M6-22: the first three wear the three marks (their particles in the frame).
      const pets = NEW.map((s, i) => ({ uid: `m6${i}`, species: s.id, level: 1 + (i % 5), fed: 0, hatchedAt: 0, age: 0, ...(i < 3 ? { mark: ['shiny', 'sleepy', 'singing'][i] } : {}) }));
      await seedSave(page, {
        ...FRAMES_SAVE,
        creatures: pets,
        showcase: pets.slice(0, 6).map((p) => p.uid),
        upgrades: { ...FRAMES_SAVE.upgrades, showcase: 5 },
        // M6-20: the flower in bloom on the counter, the window and the wall clock in the frame.
        secrets: { flower: 30 },
        collection: Object.fromEntries(species.species.map((s) => [s.id, { seen: 1, hatched: 1, sold: 0 }])),
      });
      await open(page);
      await frame(page, problems, 'shop-new-species', tag);
      // M6-21: the three new events in the shop (started by the test API past their first minutes), each frame «buttons seen whole».
      const api = <T,>(fn: (t: { event(id: string): boolean; runSim(s: number): number; state(): { event: string | null } }) => T) =>
        page.evaluate(`(${fn.toString()})(window.__TEST__)`) as Promise<T>;
      await api((t) => t.runSim(250));
      for (const id of ['weather', 'mouse', 'parade']) {
        for (let i = 0; i < 6 && (await api((t) => t.state().event)); i++) await api((t) => t.runSim(25));
        expect(await page.evaluate((x) => (window as unknown as { __TEST__: { event(id: string): boolean } }).__TEST__.event(x), id)).toBe(true);
        // The event's toast (2.6 s) goes first: a toast over a button for a moment is not a layout fault.
        await page.waitForTimeout(3200);
        await frame(page, problems, `event-${id}`, tag);
        await api((t) => t.runSim(61));
      }
      await page.locator('[data-tab=inventory]').click();
      await page.locator('[data-sheet=inventory] [data-sub=collection]').click();
      await expect(page.locator('[data-sheet=inventory] [data-collected]')).toHaveAttribute('data-collected', `${species.species.length}/${species.species.length}`);
      await frame(page, problems, 'collection-30', tag);
      for (const r of ['valuable', 'exclusive']) {
        await page.locator(`[data-row=${r}]`).scrollIntoViewIfNeeded();
        await frame(page, problems, `collection-30-${r}`, tag);
      }
      expect(problems).toEqual([]);
      expect(errors).toEqual([]);
    });
  });

  test.describe(`${size.width}x${size.height} shop name`, () => {
    test.use({ viewport: size, isMobile: true, hasTouch: true });

    test(`M6-23 the shop name in the settings: a stop-word is not taken, the name is kept after F5 @ ${size.width}x${size.height}`, async ({ page }) => {
      const errors = collectErrors(page);
      const tag = `${size.width}x${size.height}`;
      const problems: string[] = [];
      await seedSave(page, FRAMES_SAVE);
      await open(page);
      await OPENERS['overlay:settings']!(page);
      const input = page.locator('[data-action=shopname-input]');
      await input.scrollIntoViewIfNeeded();
      // A word of the stop-list (scripts/stopwords.json, never written in the game), upper case, inside a name.
      await input.fill(`Лавка ${stop.gambling[0]!.toUpperCase()}`);
      await page.locator('[data-action=shopname-save]').click();
      await expect(page.locator('[data-name-answer]')).toHaveAttribute('data-name-answer', 'blocked');
      await input.fill('Чайная');
      await page.locator('[data-action=shopname-save]').click();
      await expect(page.locator('[data-name-answer]')).toHaveAttribute('data-name-answer', 'ok');
      await frame(page, problems, 'settings-shop-name', tag);
      await closeAll(page);
      await page.reload();
      await OPENERS['overlay:settings']!(page);
      await expect(page.locator('[data-action=shopname-input]')).toHaveValue('Чайная');
      expect(problems).toEqual([]);
      expect(errors).toEqual([]);
    });
  });
}

