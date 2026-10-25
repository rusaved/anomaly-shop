import { expect, test, type Page } from '@playwright/test';
import { collectErrors, open, seedSave, state } from './helpers.ts';

/** M6 «Полировка»: sounds on every action, the new things and their secrets, events 13–15, marks, the shop name. */
type Sounds = Partial<Record<string, number>>;
const sounds = async (page: Page): Promise<Sounds> => ((await state(page)) as unknown as { sounds: Sounds }).sounds;
const incubator = (page: Page) =>
  page.evaluate(() => (window as unknown as { __TEST__: { targets(): { incubators: Array<{ x: number; y: number }> } } }).__TEST__.targets().incubators[0]!);

test('M6-01 the hatch wheel clicks as portraits pass the marker; the result has its rarity sound', async ({ page }) => {
  const errors = collectErrors(page);
  await seedSave(page, { coins: 0, incubators: [{ egg: 'egg_warm', progress: 30, elapsed: 30, waiting: false }] });
  await open(page);
  const t = await incubator(page);
  await page.mouse.click(t.x, t.y);
  await expect(page.locator('[data-hatch-result]')).toBeVisible({ timeout: 8000 });
  const s = await sounds(page);
  // 30 portraits pass in 4–5 s, a click a frame at most (the cloud's software WebGL gives 9–12 frames a second, several portraits a frame
  // at the fast start): at least a few clicks, not one.
  expect(s.spin ?? 0).toBeGreaterThanOrEqual(3);
  expect((s.hatch ?? 0) + (s.rare ?? 0) + (s.vip ?? 0) + (s.exclusive ?? 0)).toBeGreaterThanOrEqual(1);
  expect(errors).toEqual([]);
});

type Pt = { x: number; y: number };
type Things = { window: Pt | null; clock: Pt; flower: Pt };
const targets = (page: Page) =>
  page.evaluate(() => (window as unknown as { __TEST__: { targets(): { things: Things; slots: Pt[] } } }).__TEST__.targets());

test('M6-20 window, clock and flower answer a tap; 15 on the window — the winged teapot; a tickle laughs', async ({ page }) => {
  const errors = collectErrors(page);
  await seedSave(page, { coins: 50, creatures: [{ uid: 'k1', species: 'kettle', level: 1, fed: 0, hatchedAt: 0, age: 0 }], showcase: ['k1'] });
  await open(page);
  const t = await targets(page);
  expect(t.things.window).not.toBeNull();
  const win = t.things.window!;
  const tTeapot = await page.evaluate(() => (window as unknown as { __TEST__: { t(k: string): string } }).__TEST__.t('secret.window.teapot'));
  for (let i = 0; i < 15; i++) await page.mouse.click(win.x, win.y);
  await expect(page.locator('.toast', { hasText: tTeapot })).toBeVisible();
  await page.mouse.click(t.things.clock.x, t.things.clock.y);
  await page.mouse.click(t.things.flower.x, t.things.flower.y);
  const before = (await sounds(page)).tap ?? 0;
  expect(before).toBeGreaterThanOrEqual(17);
  // The tickle: ten quick taps on the pet on the shelf.
  const slot = t.slots[0]!;
  for (let i = 0; i < 10; i++) await page.mouse.click(slot.x, slot.y);
  await expect.poll(async () => (await sounds(page)).giggle ?? 0).toBeGreaterThanOrEqual(1);
  expect(errors).toEqual([]);
});

test('M6-20 the clock strikes noon by the device time: «Bong», a toast, a treat for every pet', async ({ page }) => {
  const errors = collectErrors(page);
  await page.clock.setFixedTime(new Date(2026, 9, 25, 12, 0, 5));
  await seedSave(page, { coins: 50 });
  await open(page);
  const text = await page.evaluate(() => (window as unknown as { __TEST__: { t(k: string): string } }).__TEST__.t('toast.chime'));
  await expect(page.locator('.toast', { hasText: text })).toBeVisible({ timeout: 6000 });
  expect((await sounds(page)).bong).toBe(1);
  expect(errors).toEqual([]);
});

test('M6-22 every speech line has its sound: a pet speaks on taps (chirp), a buyer writes (voice); marked pets on the shelf', async ({ page }) => {
  const errors = collectErrors(page);
  await seedSave(page, {
    coins: 50,
    creatures: [
      { uid: 'm1', species: 'kettle', level: 1, fed: 0, hatchedAt: 0, age: 0, mark: 'shiny' },
      { uid: 'm2', species: 'sun_bun', level: 1, fed: 0, hatchedAt: 0, age: 0, mark: 'sleepy' },
      { uid: 'm3', species: 'piano_dog', level: 1, fed: 0, hatchedAt: 0, age: 0, mark: 'singing' },
    ],
    showcase: ['m1', 'm2', 'm3'],
    upgrades: { showcase: 2 },
  });
  await open(page);
  const slot = (await targets(page)).slots[0]!;
  for (let i = 0; i < 3; i++) await page.mouse.click(slot.x, slot.y);
  await expect.poll(async () => (await sounds(page)).chirp ?? 0, { timeout: 10_000 }).toBeGreaterThanOrEqual(1);
  // A buyer comes and writes within a minute of game time; its line has the voice.
  await page.evaluate(() => (window as unknown as { __TEST__: { runSim(s: number): number } }).__TEST__.runSim(40));
  await expect.poll(async () => (await sounds(page)).voice ?? 0, { timeout: 15_000 }).toBeGreaterThanOrEqual(1);
  expect(errors).toEqual([]);
});
