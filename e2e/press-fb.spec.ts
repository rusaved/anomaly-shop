import { expect, test, type Page } from '@playwright/test';
import { collectErrors, open, seedSave } from './helpers.ts';

/** FB-13: every button on every main screen squeezes when pressed (:active → scale 0.95) and gives its press feedback (the click sound). */
type T = { __TEST__: { state(): { presses: number } } };

async function checkScreen(page: Page, name: string): Promise<number> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('DOM.enable');
  await cdp.send('CSS.enable');
  const { root } = await cdp.send('DOM.getDocument', { depth: -1 });
  const { nodeIds } = await cdp.send('DOM.querySelectorAll', { nodeId: root.nodeId, selector: '#ui button' });
  let checked = 0;
  for (const nodeId of nodeIds) {
    const { object } = await cdp.send('DOM.resolveNode', { nodeId });
    const info = await cdp.send('Runtime.callFunctionOn', {
      objectId: object.objectId!,
      returnByValue: true,
      functionDeclaration: `function () {
        const r = this.getBoundingClientRect();
        const visible = r.width > 0 && r.height > 0 && this.offsetParent !== null && getComputedStyle(this).visibility !== 'hidden';
        const off = this.getAttribute('aria-disabled') === 'true' || this.disabled;
        return { visible, off, label: (this.dataset.action || this.textContent || '').trim().slice(0, 30) };
      }`,
    });
    const v = info.result.value as { visible: boolean; off: boolean; label: string };
    if (!v.visible || v.off) continue;
    await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: ['active'] });
    const t = await cdp.send('Runtime.callFunctionOn', { objectId: object.objectId!, returnByValue: true, functionDeclaration: 'function () { return getComputedStyle(this).transform; }' });
    await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [] });
    const m = String(t.result.value);
    expect(m, `${name}: «${v.label}» squeezes when pressed`).toMatch(/^matrix\(0\.95, 0, 0, 0\.95/);
    // The press feedback: a pointerdown (no click, nothing happens in the game) counts as one press.
    const before = await page.evaluate(() => (window as unknown as T).__TEST__.state().presses);
    await cdp.send('Runtime.callFunctionOn', { objectId: object.objectId!, functionDeclaration: "function () { this.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); }" });
    const after = await page.evaluate(() => (window as unknown as T).__TEST__.state().presses);
    expect(after, `${name}: «${v.label}» gives its press sound`).toBe(before + 1);
    checked += 1;
  }
  await cdp.detach();
  return checked;
}

test.use({ viewport: { width: 375, height: 650 }, hasTouch: true, isMobile: true });

test('FB-13 every button: the squeeze 0.95 and the press sound — «Лавка», «Яйца», «Склад», «Продажи», «Магазин», «Пауза»', async ({ page }) => {
  const errors = collectErrors(page);
  await seedSave(page, { coins: 500, flags: { ftue_starter: true, ftue_done: true, ftue_fed: true, ftue_bought: true, showcase_m3: true }, showcase: [] });
  await open(page);
  // The squeeze is read as the computed end state: no transition in the way.
  await page.addStyleTag({ content: '#ui * { transition: none !important; }' });
  let total = await checkScreen(page, 'home');
  for (const tab of ['eggs', 'inventory', 'sales', 'shop']) {
    await page.locator(`[data-tab=${tab}]`).click();
    total += await checkScreen(page, tab);
  }
  await page.locator('[data-tab=home]').click();
  await page.locator('[data-action=pause]').click();
  total += await checkScreen(page, 'pause');
  expect(total).toBeGreaterThan(30);
  expect(errors).toEqual([]);
});
