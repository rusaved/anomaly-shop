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
