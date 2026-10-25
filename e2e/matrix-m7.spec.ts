import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { collectErrors, expectNoPageScroll, open, seedSave } from './helpers.ts';
import { buttonsSeenWhole, FRAMES_SAVE } from './frames-shared.ts';

/**
 * M7-05, SCR-01: the size matrix of docs/03, section 6 — phones, phones sideways, tablets, computers, with the sticky banner on
 * computers. Every tab opens with its buttons seen whole and the page never scrolls. M7_SHOTS=1 writes the «Лавка» of each size
 * up to 1280 px wide to docs/evidence/M7/matrix/.
 */
const SIZES: Array<{ w: number; h: number; touch: boolean; banner?: boolean }> = [
  { w: 375, h: 812, touch: true },
  { w: 390, h: 844, touch: true },
  { w: 360, h: 640, touch: true },
  { w: 812, h: 375, touch: true },
  { w: 640, h: 360, touch: true },
  { w: 844, h: 390, touch: true },
  { w: 768, h: 1024, touch: true },
  { w: 1024, h: 768, touch: true },
  { w: 1280, h: 720, touch: false },
  { w: 1920, h: 1080, touch: false },
  { w: 2560, h: 1080, touch: false },
  { w: 600, h: 1300, touch: false },
  { w: 1280, h: 720, touch: false, banner: true },
  { w: 1920, h: 1080, touch: false, banner: true },
];
const TABS = ['home', 'market', 'inventory', 'sales', 'eggs', 'chats', 'shop'];
const shots = process.env.M7_SHOTS ? resolve(import.meta.dirname, '../docs/evidence/M7/matrix') : null;

for (const s of SIZES) {
  const name = `${s.w}x${s.h}${s.banner ? '-banner' : ''}`;
  test.describe(name, () => {
    test.use({ viewport: { width: s.w, height: s.h }, hasTouch: s.touch, isMobile: s.touch });
    test(`M7-05 SCR-01 ${name}: every tab, its buttons seen whole, no page scroll, no console errors @full`, async ({ page }) => {
      const errors = collectErrors(page);
      await seedSave(page, FRAMES_SAVE);
      await open(page, s.banner ? '?mock_banner=1' : '');
      if (s.banner) await expect(page.locator('#__ya_mock_banner__')).toBeVisible();
      const problems: string[] = [];
      for (const id of TABS) {
        const tab = page.locator(`[data-tab=${id}]`);
        await tab.click();
        await expect(tab).toHaveClass(/active/);
        await page.waitForTimeout(250);
        // The shot first: the check below scrolls the lists the way a player does.
        if (id === 'home' && shots && s.w <= 1280) {
          mkdirSync(shots, { recursive: true });
          await page.screenshot({ path: resolve(shots, `home_${name}_ru.png`) });
        }
        // D-01: an event's toast (2.6 s) goes first, as in frames-m6 — one lay over the market's «Купить» for a moment (verify:full 25.10);
        // a toast that never goes still fails the check below.
        await page.waitForFunction(() => !document.querySelector('.toast'), null, { timeout: 15_000 }).catch(() => undefined);
        for (const p of await buttonsSeenWhole(page)) problems.push(`${id}: ${p}`);
        await expectNoPageScroll(page);
      }
      expect(problems).toEqual([]);
      expect(errors).toEqual([]);
    });
  });
}
