import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { collectErrors, open, seedSave } from './helpers.ts';
import { buttonsSeenWhole, closeAll, FRAMES_SAVE, OPENERS, walkEveryWindow, windowsInCode } from './frames-shared.ts';

/**
 * RD-02: truthful frames — every window and tab from the code of the windows on the producer's phone sizes (880×405 and 815×290,
 * landscape), each checked «every button is seen whole». RD_SHOTS=1 also saves the frames to docs/evidence/RD/screens/.
 */
const SIZES = [
  { width: 880, height: 405 },
  { width: 815, height: 290 },
  // T: a browser with a taller panel — frames only (RD_SHOTS); its checks live in e2e/truthful-t.spec.ts.
  ...(process.env.RD_SHOTS ? [{ width: 812, height: 330 }] : []),
];
// W: RD_SHOTS=<dir under docs/evidence> puts them elsewhere (RD_SHOTS=W/screens — the frames of «Окна под браузер»).
const shotsDir = process.env.RD_SHOTS ? resolve(import.meta.dirname, '../docs/evidence', process.env.RD_SHOTS === '1' ? 'RD' : process.env.RD_SHOTS.replace(/\/screens$/, ''), 'screens') : null;
if (shotsDir) mkdirSync(shotsDir, { recursive: true });

test('RD-02 every window in the code has an opener', () => {
  const w = windowsInCode();
  expect(w.tabs.length).toBeGreaterThanOrEqual(7);
  const missing = [...w.overlays.map((id) => `overlay:${id}`), ...w.details.map((id) => `detail:${id}`)].filter((k) => !OPENERS[k]);
  expect(missing).toEqual([]);
});

for (const size of SIZES) {
  test.describe(`${size.width}x${size.height}`, () => {
    test.use({ viewport: size, isMobile: true, hasTouch: true });

    test(`RD-02 every tab, sub-tab and window: buttons seen whole @ ${size.width}x${size.height}`, async ({ page }) => {
      test.setTimeout(300_000);
      const errors = collectErrors(page);
      // The save is two hours old: the session starts with «while you were away» (the away window).
      await seedSave(page, { ...FRAMES_SAVE, savedAt: Date.now() - 2 * 3600 * 1000, upgrades: { ...FRAMES_SAVE.upgrades, helper_sell: 1 } });
      await open(page);
      const problems: string[] = [];
      const tag = `${size.width}x${size.height}`;
      const frame = async (name: string) => {
        await page.waitForFunction(() => !document.querySelector('.toast'), null, { timeout: 8000 }).catch(() => undefined);
        await page.waitForTimeout(250);
        for (const p of await buttonsSeenWhole(page)) problems.push(`${name}: ${p}`);
        if (shotsDir) {
          // W: every scroll of the screen at its start, as a player opens it (the lines of a chat open on the newest, UB-10).
          await page.evaluate(() =>
            document.querySelectorAll<HTMLElement>('.sheet:not([hidden]) *, .overlay:not([hidden]) *, .sheet:not([hidden]), .overlay:not([hidden])').forEach((e) => {
              if (e.scrollTop > 0 && !e.matches('.chat-lines')) e.scrollTop = 0;
            }),
          );
          await page.waitForTimeout(100);
          await page.screenshot({ path: `${shotsDir}/${name}_${tag}.png` });
        }
      };
      await walkEveryWindow(page, frame, shotsDir ? tag : null, shotsDir);
      expect(problems).toEqual([]);
      expect(errors).toEqual([]);
    });
  });
}

// W: the first minute (the hint at the egg, then «Покорми его тапами») in both sizes — frames only (RD_SHOTS).
for (const size of SIZES) {
  test.describe(`${size.width}x${size.height} first minute`, () => {
    test.use({ viewport: size, isMobile: true, hasTouch: true });
    test(`W the first minute: frames @ ${size.width}x${size.height}`, async ({ page }) => {
      test.skip(!shotsDir, 'frames only');
      const errors = collectErrors(page);
      await open(page);
      await expect(page.locator('.hint [data-hint-text]')).toBeVisible();
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${shotsDir}/ftue-egg_${size.width}x${size.height}.png` });
      await page.locator('[data-tab=eggs]').click();
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${shotsDir}/ftue-eggs_${size.width}x${size.height}.png` });
      expect(errors).toEqual([]);
    });
  });
}

// T: the shelf with 3 places (one row) and 6 (two rows) and four ready domes — frames only (RD_SHOTS).
for (const size of SIZES) {
  test.describe(`${size.width}x${size.height} shelf`, () => {
    test.use({ viewport: size, isMobile: true, hasTouch: true });
    for (const level of [2, 5]) {
      test(`T the shelf of ${level + 1} places: frames @ ${size.width}x${size.height}`, async ({ page }) => {
        test.skip(!shotsDir, 'frames only');
        const errors = collectErrors(page);
        const ready = { egg: 'egg_basic', startedAt: 0, progress: 99, elapsed: 99, waiting: false, careFed: 3 };
        await seedSave(page, { ...FRAMES_SAVE, incubators: [ready, ready, ready, ready], upgrades: { ...FRAMES_SAVE.upgrades, showcase: level, incubator: 3 } });
        await open(page);
        await closeAll(page);
        await page.waitForFunction(() => !document.querySelector('.toast'), null, { timeout: 8000 }).catch(() => undefined);
        await page.waitForTimeout(300);
        await page.screenshot({ path: `${shotsDir}/shelf-${level + 1}_${size.width}x${size.height}.png` });
        expect(errors).toEqual([]);
      });
    }
  });
}

// F: the first minute when a buyer writes (the freed place and its hint), «Яйца» with four eggs of «Мои яйца» (two rows before F-02),
// the egg card and the seller level — frames only (RD_SHOTS=F/screens).
for (const size of SIZES) {
  const tag = `${size.width}x${size.height}`;
  test.describe(`${tag} F frames`, () => {
    test.use({ viewport: size, isMobile: true, hasTouch: true });
    test(`F the first minute with a buyer writing: frames @ ${tag}`, async ({ page }) => {
      test.skip(!shotsDir, 'frames only');
      test.setTimeout(120_000);
      const errors = collectErrors(page);
      await open(page);
      const at = () => page.evaluate(() => (window as unknown as { __TEST__: { targets(): { incubators: Array<{ x: number; y: number }>; slots: Array<{ x: number; y: number }> } } }).__TEST__.targets());
      const egg = (await at()).incubators[0]!;
      await page.touchscreen.tap(egg.x, egg.y);
      await page.locator('[data-overlay=hatch] [data-action=hatch-shop]').click({ timeout: 10_000 });
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${shotsDir}/ftue-feed_${tag}.png` });
      const pet = (await at()).slots[0]!;
      const badge = page.locator('[data-tab=chats] [data-badge]');
      for (let i = 0; i < 400 && !(await badge.isVisible()); i++) {
        await page.touchscreen.tap(pet.x, pet.y);
        await page.waitForTimeout(120);
      }
      await page.waitForTimeout(600);
      await page.touchscreen.tap(pet.x, pet.y);
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${shotsDir}/ftue-buyer_${tag}.png` });
      expect(errors).toEqual([]);
    });
    test(`F «Яйца» with four eggs, the egg card, the seller level: frames @ ${tag}`, async ({ page }) => {
      test.skip(!shotsDir, 'frames only');
      const errors = collectErrors(page);
      const egging = { egg: 'egg_basic', startedAt: 0, progress: 0, elapsed: 0, waiting: false, careFed: 1 };
      await seedSave(page, { ...FRAMES_SAVE, incubators: [egging, egging, egging], upgrades: { ...FRAMES_SAVE.upgrades, incubator: 2 }, stats: { ...FRAMES_SAVE.stats, xp: 600 } });
      await open(page);
      await page.evaluate(() => (window as unknown as { __TEST__: { setTimeScale(k: number): void } }).__TEST__.setTimeScale(0));
      await closeAll(page);
      const shot = async (name: string) => {
        await page.waitForFunction(() => !document.querySelector('.toast'), null, { timeout: 8000 }).catch(() => undefined);
        await page.waitForTimeout(300);
        await page.screenshot({ path: `${shotsDir}/${name}_${tag}.png` });
      };
      await page.locator('[data-tab=eggs]').click();
      await shot('tab-eggs-4');
      await page.locator('[data-sheet=eggs] [data-section=my]').evaluate((e) => e.scrollTo({ left: e.scrollWidth }));
      await shot('tab-eggs-4-scrolled');
      await OPENERS['detail:egg-card']!(page);
      await shot('detail-egg-card');
      await closeAll(page);
      await OPENERS['overlay:reputation']!(page);
      await shot('overlay-reputation');
      expect(errors).toEqual([]);
    });
  });
}
