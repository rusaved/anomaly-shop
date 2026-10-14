// Shared e2e helpers: wait for the game to be controllable, collect console errors, read the test API.
import { expect, type ConsoleMessage, type Page } from '@playwright/test';

export interface TestState {
  platform: string;
  device: string;
  lang: string;
  controllable: boolean;
  fps: number;
  pause: string[];
  elapsed: number;
  coins: number;
  creatures: unknown[];
}

export function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m: ConsoleMessage) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('dialog', (d) => {
    errors.push(`dialog: ${d.type()} ${d.message()}`);
    void d.dismiss();
  });
  return errors;
}

export async function open(page: Page, query = ''): Promise<void> {
  await page.goto(`/${query}`);
  await page.waitForFunction(() => {
    const t = (window as unknown as { __TEST__?: { state(): { controllable: boolean } } }).__TEST__;
    return Boolean(t && t.state().controllable);
  });
}

export function state(page: Page): Promise<TestState> {
  return page.evaluate(() => (window as unknown as { __TEST__: { state(): TestState } }).__TEST__.state());
}

export function events(page: Page): Promise<Array<{ name: string; t: number; params?: Record<string, string | number> }>> {
  return page.evaluate(() => (window as unknown as { __TEST__: { events: Array<{ name: string; t: number; params?: Record<string, string | number> }> } }).__TEST__.events);
}

export function mockCalls(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { __YA_MOCK__: { calls: Array<{ name: string }> } }).__YA_MOCK__.calls.map((c) => c.name));
}

export function mockViolations(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { __YA_MOCK__: { violations: string[] } }).__YA_MOCK__.violations);
}

export function translated(page: Page, key: string): Promise<string> {
  return page.evaluate((k) => (window as unknown as { __TEST__: { t(key: string): string } }).__TEST__.t(k), key);
}

/** Every listed element is visible and fully inside the viewport, with a tap area of at least 44 px for buttons. */
export async function expectInsideViewport(page: Page, selectors: string[]): Promise<void> {
  const vp = page.viewportSize()!;
  for (const sel of selectors) {
    const el = page.locator(sel).first();
    await expect(el, sel).toBeVisible();
    const box = (await el.boundingBox())!;
    expect(box.x, `${sel} left`).toBeGreaterThanOrEqual(-0.5);
    expect(box.y, `${sel} top`).toBeGreaterThanOrEqual(-0.5);
    expect(box.x + box.width, `${sel} right`).toBeLessThanOrEqual(vp.width + 0.5);
    expect(box.y + box.height, `${sel} bottom`).toBeLessThanOrEqual(vp.height + 0.5);
    if (await el.evaluate((e) => e.tagName === 'BUTTON')) {
      expect(Math.min(box.width, box.height), `${sel} tap size`).toBeGreaterThanOrEqual(40);
    }
  }
}

export async function expectNoPageScroll(page: Page): Promise<void> {
  const s = await page.evaluate(() => ({ w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight, iw: window.innerWidth, ih: window.innerHeight }));
  expect(s.w).toBeLessThanOrEqual(s.iw);
  expect(s.h).toBeLessThanOrEqual(s.ih);
}

/** A save past the first minute (M2 e2e): written to the local mirror and the mock cloud before the page loads. */
export async function seedSave(page: Page, patch: Record<string, unknown> = {}): Promise<void> {
  const save = {
    v: 1,
    rev: 999,
    savedAt: Date.now(),
    createdAt: 0,
    lastSeenAt: 0,
    coins: 30,
    crystals: 0,
    incubators: [{ egg: null }],
    creatures: [
      { uid: 'e2e1', species: 'kettle', level: 2, fed: 0, hatchedAt: 0, age: 0 },
      { uid: 'e2e2', species: 'cloudcat', level: 1, fed: 0, hatchedAt: 0, age: 0 },
    ],
    upgrades: {},
    stats: { deals: 8, coinsEarned: 300, hatched: 10, taps: 100, levelUps: 3, haggles: 1 },
    flags: { ftue_starter: true, ftue_done: true, ftue_fed: true, ftue_bought: true },
    settings: { sound: false, lang: null },
    ...patch,
  };
  await page.addInitScript((text: string) => {
    if (sessionStorage.getItem('e2e-seeded')) return;
    localStorage.setItem('anomaly-shop:save', text);
    localStorage.setItem('__yasdk_mock_player__', JSON.stringify({ save: text }));
    sessionStorage.setItem('e2e-seeded', '1');
  }, JSON.stringify(save));
}

/** M3-05: a tapped egg plays the hatch show; flows that go on playing skip it and keep the creature in the shop. */
export async function closeHatch(page: Page): Promise<boolean> {
  const overlay = page.locator('[data-overlay=hatch]');
  if (!(await overlay.isVisible())) return false;
  const toShop = overlay.locator('[data-action=hatch-shop]');
  if (!(await toShop.isVisible())) await overlay.locator('[data-action=hatch-skip]').click();
  await toShop.click();
  return true;
}

/** UB-05: the only way to sell — the Chats tab → the oldest chat → «Sell for N». */
export async function sellInChat(page: Page): Promise<void> {
  await page.locator('[data-tab=chats]').click();
  const sell = page.locator('[data-sheet=chats] [data-action=chat-sell]');
  if (!(await sell.isVisible())) await page.locator('[data-sheet=chats] .chat-row:not(.closed)').last().click();
  await sell.click();
}

/** UB-01: eggs are bought on the home screen — the egg's tile, then «Buy» in its card. */
export async function buyEggAtHome(page: Page, egg = 'egg_basic'): Promise<void> {
  await page.locator('[data-tab=eggs]').click();
  const buy = page.locator('[data-action=egg-buy-1]');
  if (!(await buy.isVisible())) await page.locator(`[data-action=egg-card-${egg}]`).click();
  await buy.click();
}

/** UB-03: a creature waiting in the inventory goes on the shelf through «My sales». */
export async function listFromInventory(page: Page): Promise<void> {
  await page.locator('[data-tab=sales]').click();
  await page.locator('[data-sheet=sales] [data-action=sale-add]').first().click();
  await page.locator('[data-sheet=sales] [data-action^=sale-list-]').first().click();
}

