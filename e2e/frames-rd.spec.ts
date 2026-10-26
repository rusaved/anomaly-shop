import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { collectErrors, open, seedSave } from './helpers.ts';
import { buttonsSeenWhole, closeAll, FRAMES_SAVE, OPENERS, windowsInCode } from './frames-shared.ts';

/**
 * RD-02: truthful frames — every window and tab from the code of the windows on the producer's phone sizes (880×405 and 815×290,
 * landscape), each checked «every button is seen whole». RD_SHOTS=1 also saves the frames to docs/evidence/RD/screens/.
 */
const SIZES = [
  { width: 880, height: 405 },
  { width: 815, height: 290 },
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
          await page.evaluate(() => document.querySelectorAll('.sheet-body, .detail-page, .overlay .card, [data-sheet] .mu-scroll').forEach((e) => (e.scrollTop = 0)));
          await page.screenshot({ path: `${shotsDir}/${name}_${tag}.png` });
        }
      };
      const w = windowsInCode();
      await OPENERS['overlay:away']!(page);
      await frame('overlay-away');
      await closeAll(page);
      for (const id of w.tabs) {
        await page.locator(`[data-tab=${id}]`).click();
        await frame(`tab-${id}`);
        const subs = page.locator(`[data-sheet=${id}] .subtab:not([aria-disabled=true])`);
        const n = await subs.count();
        for (let i = 1; i < n; i++) {
          const sub = subs.nth(i);
          const name = await sub.getAttribute('data-sub');
          await sub.click();
          await frame(`tab-${id}-${name}`);
        }
        if (n > 1) await subs.first().click();
      }
      for (const kind of ['detail', 'overlay'] as const) {
        const ids = kind === 'overlay' ? [...w.overlays.filter((id) => id !== 'merchant'), 'merchant'] : w.details;
        for (const id of ids) {
          if (id === 'away') continue;
          await OPENERS[`${kind}:${id}`]!(page);
          await frame(`${kind}-${id}`);
          await closeAll(page);
        }
      }
      expect(problems).toEqual([]);
      expect(errors).toEqual([]);
    });
  });
}

