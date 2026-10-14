import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { collectErrors, open, seedSave, state } from './helpers.ts';

/** M3-04, UB-02: the Eggs tab — an egg card opens as a panel, the odds on it match eggs.json, buy one and ×3. */
const eggsJson = JSON.parse(readFileSync(resolve(import.meta.dirname, '../content/eggs.json'), 'utf8')) as { eggs: Array<{ id: string; chances: Record<string, number>; price: { coins: number } }> };
const speciesJson = JSON.parse(readFileSync(resolve(import.meta.dirname, '../content/species.json'), 'utf8')) as { species: Array<{ id: string; rarity: string }> };

test('M3-04 egg card: odds match eggs.json, buy one and ×3', async ({ page }) => {
  const errors = collectErrors(page);
  await seedSave(page, { coins: 1000, stats: { deals: 8, coinsEarned: 300, hatched: 10, taps: 100, levelUps: 3, haggles: 1 } });
  await open(page);
  await page.locator('[data-tab=eggs]').click();
  await page.locator('[data-sheet=eggs] [data-egg=egg_warm]').click();
  const warm = eggsJson.eggs.find((e) => e.id === 'egg_warm')!;
  await expect(page.locator('[data-overlay=egg-card]')).toBeVisible();
  const cards = page.locator('[data-overlay=egg-card] .card-odds');
  const shown = await cards.evaluateAll((els) => els.map((el) => ({ species: (el as HTMLElement).dataset.species!, chance: Number((el as HTMLElement).dataset.chance) })));
  expect(shown.length).toBeGreaterThan(0);
  for (const s of shown) {
    const rarity = speciesJson.species.find((x) => x.id === s.species)!.rarity;
    const same = speciesJson.species.filter((x) => x.rarity === rarity).length;
    expect(s.chance * same).toBeCloseTo(warm.chances[rarity]!, 6);
  }
  expect(shown.reduce((a, s) => a + s.chance, 0)).toBeCloseTo(100, 6);
  const before = (await state(page)).coins;
  await page.locator('[data-action=egg-buy-1]').click();
  await expect.poll(async () => (await state(page)).coins).toBe(before - warm.price.coins);
  await page.locator('[data-action=egg-buy-3]').click();
  await expect.poll(async () => (await state(page)).coins).toBe(before - 4 * warm.price.coins);
  await page.locator('[data-action=egg-back]').click();
  await expect(page.locator('[data-overlay=egg-card]')).toBeHidden();
  await expect(page.locator('[data-sheet=eggs] [data-section=my]')).toBeVisible();
  expect(errors).toEqual([]);
});
