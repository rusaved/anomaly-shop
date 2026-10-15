import { expect, test } from '@playwright/test';
import { collectErrors, open, seedSave, translated } from './helpers.ts';
import { marketMood } from '../src/sim/rules.ts';
import species from '../content/species.json' with { type: 'json' };

/** M4-01 on the phone projects: the collection by rarity — «Collected N/M», a row per rarity with its bonus, statuses on the tiles. */
test('M4-01 collection: rows by rarity, «N/M», not yet / in the shop / sold', async ({ page }) => {
  const errors = collectErrors(page);
  await seedSave(page, {
    creatures: [{ uid: 'e2e1', species: 'kettle', level: 2, fed: 0, hatchedAt: 0, age: 0 }],
    collection: { kettle: { seen: 1, hatched: 1, sold: 0 }, cloudcat: { seen: 1, hatched: 1, sold: 1 } },
  });
  await open(page, '?mock_device=mobile');
  await page.locator('[data-tab=inventory]').tap();
  await page.locator('[data-sheet=inventory] [data-sub=collection]').tap();
  const sum = page.locator('[data-sheet=inventory] [data-collected]');
  await expect(sum).toHaveAttribute('data-collected', /^2\/\d+$/);
  await expect(page.locator('[data-sheet=inventory] [data-row]')).toHaveCount(6);
  await expect(page.locator('[data-species=kettle]')).toHaveAttribute('data-status', 'shop');
  await expect(page.locator('[data-species=cloudcat]')).toHaveAttribute('data-status', 'sold');
  await expect(page.locator('[data-species=kettle] .card-sub')).toHaveText(await translated(page, 'collection.status.shop'));
  await expect(page.locator('[data-row=exclusive] [data-status=none]')).toHaveCount(2);
  expect(await page.locator('[data-row=common] [data-row-bonus]').innerText()).toMatch(/\d/);
  // The section stays when the tab is left and opened again (M4-00).
  await page.locator('[data-tab=eggs]').tap();
  await page.locator('[data-tab=inventory]').tap();
  await expect(page.locator('[data-sheet=inventory] [data-sub=collection]')).toHaveClass(/active/);
  expect(errors).toEqual([]);
});

/** M4-23 on the phone projects: the species in fashion today shows its chip in the sale card (the mood follows the day and the save). */
test('M4-23 market mood: the chip in the sale card of the species in fashion', async ({ page }) => {
  const errors = collectErrors(page);
  const d = new Date();
  const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const mood = marketMood(day, 0, species.species.map((s) => s.id))!;
  await seedSave(page, { createdAt: 0, showcase: ['hot1'], creatures: [{ uid: 'hot1', species: mood.hot, level: 1, fed: 0, hatchedAt: 0, age: 0 }] });
  await open(page, '?mock_device=mobile');
  await page.locator('[data-tab=sales]').tap();
  await page.locator('[data-sheet=sales] [data-uid=hot1]').tap();
  await expect(page.locator('[data-detail=sale] [data-mood=hot]')).toBeVisible();
  expect(errors).toEqual([]);
});

/** M4-20 on the phone projects: «Finds» — a screen of its own in the Inventory: got ones with an edge, hidden ones «???» until found. */
test('M4-20 finds: «Found N of 30», hidden ones «???», a got one is marked', async ({ page }) => {
  const errors = collectErrors(page);
  await seedSave(page, { stats: { deals: 12, coinsEarned: 1500, hatched: 12, taps: 100, levelUps: 3, haggles: 1, xp: 12 } });
  await open(page, '?mock_device=mobile');
  await page.locator('[data-tab=inventory]').tap();
  await page.locator('[data-sheet=inventory] [data-sub=finds]').tap();
  await expect(page.locator('[data-sheet=inventory] [data-finds]')).toHaveAttribute('data-finds', /^\d+\/30$/);
  await expect(page.locator('[data-find=first_deal]')).toHaveClass(/got/);
  await page.locator('[data-action=find-take-first_deal]').tap();
  await expect(page.locator('[data-find=first_deal] .find-progress')).not.toBeEmpty();
  await expect(page.locator('[data-find=door_knock] .find-name')).toHaveText('???');
  await expect(page.locator('.find.secret')).toHaveCount(10);
  expect(errors).toEqual([]);
});
