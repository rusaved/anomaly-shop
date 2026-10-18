import { expect, test, type Page } from '@playwright/test';
import { buyEggAtHome, closeHatch, collectErrors, events, listFromInventory, mockViolations, open, sellInChat, state } from './helpers.ts';

/**
 * M1-09, UB-01, UB-05: the first minute (docs/01, section 4) on the phone projects, played by taps on what is visible:
 * tap the egg → «To the shop» → feed → a buyer writes → sell in the chat → buy a new egg at home → a rare one; hints 6 words at most.
 */
interface Targets {
  incubators: Array<{ x: number; y: number }>;
  slots: Array<{ x: number; y: number }>;
}
const targets = (page: Page) => page.evaluate(() => (window as unknown as { __TEST__: { targets(): Targets } }).__TEST__.targets());
const hintText = async (page: Page) => ((await page.locator('.hint:not([hidden]) [data-hint-text]').count()) ? (await page.locator('[data-hint-text]').innerText()).trim() : '');
type S = Awaited<ReturnType<typeof state>> & { ftue: string | null; rarities: string[]; stats: { deals: number; hatched: number } };
const st = (page: Page) => state(page) as Promise<S>;

test('M1-09 first minute: hints up to 6 words lead from the starter egg to a rare creature', async ({ page }) => {
  // The first buyer writes 12 s after the listing (UB-10): the scripted loop needs room on a loaded machine.
  test.setTimeout(180_000);
  const errors = collectErrors(page);
  await open(page, '?mock_device=mobile');
  const hints: string[] = [];
  const seenSteps: string[] = [];
  const note = async () => {
    const s = await st(page);
    const text = await hintText(page);
    if (s.ftue && seenSteps.at(-1) !== s.ftue) seenSteps.push(s.ftue);
    if (text && hints.at(-1) !== text) hints.push(text);
    return s;
  };
  const tapAt = async (p: { x: number; y: number }) => {
    if (page.viewportSize()!.width < 900) await page.touchscreen.tap(p.x, p.y);
    else await page.mouse.click(p.x, p.y);
  };

  await expect(page.locator('.hint [data-hint-text]')).toBeVisible();
  // The closing toast starts with the second hatch and may end while the hatch window is closed: it is caught when it appears.
  await page.evaluate(() => {
    const w = window as unknown as { goodToast?: boolean };
    new MutationObserver(() => {
      if (document.querySelector('[data-toast=good]')) w.goodToast = true;
    }).observe(document.body, { subtree: true, childList: true });
  });
  const deadline = Date.now() + 150_000;
  while (Date.now() < deadline) {
    if (await closeHatch(page)) continue;
    const s = await note();
    if (!s.ftue) break;
    const t = await targets(page);
    if (s.ftue === 'tapEgg' || s.ftue === 'hatchRare') await tapAt(t.incubators[0]!);
    else if (s.ftue === 'feed') await tapAt(t.slots[0]!);
    else if (s.ftue === 'list') await listFromInventory(page);
    else if (s.ftue === 'sell') await sellInChat(page);
    else if (s.ftue === 'buyEgg') await buyEggAtHome(page);
    // The scene is on the home screen: back to it after a tab.
    if (s.ftue === 'sell' || s.ftue === 'list' || s.ftue === 'buyEgg') await page.locator('[data-tab=home]').click();
    await page.waitForTimeout(220);
  }
  const end = await st(page);
  expect(end.ftue).toBeNull();
  expect(seenSteps.filter((x) => x !== 'waitCustomer' && x !== 'list')).toEqual(['tapEgg', 'feed', 'sell', 'buyEgg', 'hatchRare']);
  expect(end.stats.deals).toBe(1);
  expect(end.rarities).toContain('valuable');
  for (const h of hints) expect(h.split(/\s+/).length, h).toBeLessThanOrEqual(6);
  expect(hints.length).toBeGreaterThanOrEqual(5);
  // The closing words of the first minute and the funnel events in order (docs/06, section 1).
  await page.waitForFunction(() => (window as unknown as { goodToast?: boolean }).goodToast === true, null, { timeout: 15_000 });
  const names = (await events(page)).map((e) => e.name);
  const order = ['first_tap', 'hatch_1', 'feed_1', 'sale_1', 'egg_buy_1'].map((n) => names.indexOf(n));
  expect(order.every((i) => i >= 0)).toBe(true);
  expect([...order].sort((a, b) => a - b)).toEqual(order);
  expect(await mockViolations(page)).toEqual([]);
  expect(errors).toEqual([]);
});
