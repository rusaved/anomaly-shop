import { expect, test, type Page } from '@playwright/test';
import { collectErrors, open, seedSave } from './helpers.ts';

/** FB-14: what the reviewers of MU left — whole words at 130 %, «Аномалия дня» in three lines (s5), «Продать сразу» out of the bottom third,
 * the bottom of a list (a cut card shows its picture only), the switcher ≤ 420 px and the main button ≤ 360 px sideways. */
type T = { __TEST__: { hatch(uid: string, egg?: string): boolean } };
const pets = ['kettle', 'cloudcat', 'lampbug', 'jellytoast', 'shroom', 'moon_donut', 'sockfish', 'pillow'].map((species, i) => ({ uid: `p${i}`, species, level: 1, fed: 0, hatchedAt: 0, age: 0 }));
const seed = (page: Page) => seedSave(page, { coins: 500, creatures: pets, showcase: [], flags: { ftue_starter: true, ftue_done: true, ftue_fed: true, ftue_bought: true, showcase_m3: true } });

const scale130 = (page: Page) =>
  page.evaluate(() => {
    const fresh = [...document.querySelectorAll<HTMLElement>('#ui *')].filter((el) => !el.dataset.mu130);
    const sizes = fresh.map((el) => parseFloat(getComputedStyle(el).fontSize));
    fresh.forEach((el, i) => {
      el.dataset.mu130 = '1';
      el.style.fontSize = `${Math.round((sizes[i] ?? 16) * 13) / 10}px`;
    });
  });

/** Labels whose word runs out of its box (it would break inside) or whose font went under 12 px. */
const broken = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.nav-label, .mu-seg > button, .mu-name')]
      .filter((el) => el.offsetParent !== null && el.clientWidth > 0)
      .filter((el) => el.scrollWidth > el.clientWidth + 1 || parseFloat(getComputedStyle(el).fontSize) < 11.9)
      .map((el) => `${el.className} «${el.textContent?.trim()}» ${el.scrollWidth}/${el.clientWidth} ${getComputedStyle(el).fontSize}`),
  );

test.describe('FB-14 portrait 375×650', () => {
  test.use({ viewport: { width: 375, height: 650 }, hasTouch: true, isMobile: true });

  test('130 %: tab labels, segments and names keep whole words (≥ 12 px)', async ({ page }) => {
    const errors = collectErrors(page);
    await seed(page);
    await open(page);
    for (const tab of ['home', 'inventory', 'sales', 'eggs', 'shop']) {
      await page.locator(`[data-tab=${tab}]`).click();
      await scale130(page);
      await page.waitForTimeout(300);
      expect(await broken(page), `${tab} at 130 %`).toEqual([]);
    }
    expect(errors).toEqual([]);
  });

  test('«Аномалия дня» in three lines; «Продать сразу» out of the bottom third; a cut card shows only its picture', async ({ page }) => {
    await seed(page);
    await open(page);
    await page.locator('[data-action=gifts]').click();
    const lines = await page.locator('.day-anomaly .day-text').evaluate((el) => {
      const lh = parseFloat(getComputedStyle(el.querySelector('.mu-meta')!).lineHeight) || 16;
      return Math.round(el.getBoundingClientRect().height / lh);
    });
    expect(lines).toBeLessThanOrEqual(3);
    await page.locator('[data-action=gifts-close]').click();
    expect(await page.evaluate(() => (window as unknown as T).__TEST__.hatch('p0'))).toBe(true);
    await page.waitForTimeout(300);
    if (await page.locator('[data-action=hatch-skip]').isVisible()) await page.locator('[data-action=hatch-skip]').click();
    await expect(page.locator('[data-action=hatch-sell]')).toBeVisible();
    const sell = (await page.locator('[data-action=hatch-sell]').boundingBox())!;
    expect(sell.y + sell.height).toBeLessThanOrEqual((650 * 2) / 3);
    await page.locator('[data-action=hatch-keep]').click();
    await page.locator('[data-tab=sales]').click();
    await page.waitForTimeout(300);
    const cut = await page.evaluate(() => {
      const list = document.querySelector<HTMLElement>('[data-sheet=sales] > .sheet-body')!;
      const bottom = list.getBoundingClientRect().bottom;
      return [...list.querySelectorAll<HTMLElement>('.mu-card:not(.peek) .mu-name')].filter((n) => {
        const r = n.getBoundingClientRect();
        return r.top < bottom && r.bottom > bottom + 1;
      }).length;
    });
    expect(cut).toBe(0);
  });
});

test.describe('FB-14 sideways 812×330', () => {
  test.use({ viewport: { width: 812, height: 330 }, hasTouch: true, isMobile: true });

  test('the section switcher ≤ 420 px, the main button ≤ 360 px', async ({ page }) => {
    await seed(page);
    await open(page);
    for (const tab of ['home', 'inventory', 'shop', 'eggs']) {
      await page.locator(`[data-tab=${tab}]`).click();
      await page.waitForTimeout(200);
      const wide = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('.mu-seg, .mu-btn.main, .btn-primary')]
          .filter((el) => el.offsetParent !== null)
          .filter((el) => el.getBoundingClientRect().width > (el.classList.contains('mu-seg') ? 420.5 : 360.5))
          .map((el) => `${el.className} ${Math.round(el.getBoundingClientRect().width)}`),
      );
      expect(wide, tab).toEqual([]);
    }
  });
});

test.describe('FB-15 the round of fixes (usability review)', () => {
  test.use({ viewport: { width: 375, height: 650 }, hasTouch: true, isMobile: true });

  test('a second tap right after skipping the strip never sells the pet', async ({ page }) => {
    await seed(page);
    await open(page);
    expect(await page.evaluate(() => (window as unknown as T).__TEST__.hatch('p0'))).toBe(true);
    await page.waitForTimeout(450);
    const strip = (await page.locator('[data-action=hatch-skip]').boundingBox())!;
    await page.mouse.click(strip.x + strip.width / 2, strip.y + strip.height - 4);
    await page.waitForTimeout(150);
    // The second tap lands where «Продать сразу» now stands.
    const sell = (await page.locator('[data-action=hatch-sell]').boundingBox())!;
    await page.mouse.click(sell.x + sell.width / 2, sell.y + sell.height / 2);
    await expect(page.locator('[data-hatch-result]')).toBeVisible();
    const st = await page.evaluate(() => (window as unknown as { __TEST__: { state(): { creatures: Array<{ uid: string }> } } }).__TEST__.state());
    expect(st.creatures.map((c) => c.uid)).toContain('p0');
  });

  test('«Пока тебя не было»: the ad button says its coins, away longer than the shop works says both times', async ({ page }) => {
    await seedSave(page, { coins: 0, lastSeenAt: Date.now() - 5 * 3600 * 1000, savedAt: Date.now() - 5 * 3600 * 1000, incomeMinutes: [300, 300, 300], stats: { deals: 8, coinsEarned: 300, hatched: 10, taps: 100, levelUps: 3, haggles: 1, income: 300 } });
    await open(page);
    await expect(page.locator('[data-overlay=away]')).toBeVisible();
    await expect(page.locator('[data-action=away-ad]')).toHaveText(/\+\s?[\d\s ]+/);
    await expect(page.locator('[data-action=away-ad]')).not.toContainText('{n}');
    await expect(page.locator('[data-overlay=away] .away-time')).toContainText(/5/);
    await expect(page.locator('[data-overlay=away] .away-time')).toContainText(/2/);
  });
});
