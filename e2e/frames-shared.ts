import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, type Page } from '@playwright/test';
import { closeHatch } from './helpers.ts';

/**
 * RD-02: every window and tab of the game, listed from the code of the windows — the tab bar (src/ui/nav.ts TABS), every
 * createOverlay(parent, '<id>') and every inner page sheet.detail('<id>') / the egg card. A window added to the code without an
 * opener below fails the «every window has an opener» check, so the shots never silently miss a screen.
 */
export interface WindowsInCode {
  tabs: string[];
  overlays: string[];
  details: string[];
}

export function windowsInCode(): WindowsInCode {
  const dir = resolve(import.meta.dirname, '../src/ui');
  const src = readdirSync(dir)
    // V («Ресейл 16»): the windows of the VK and OK build (vk-*.ts) exist only there — e2e/vk-v.spec.ts opens them on dist-vk.
    .filter((f) => f.endsWith('.ts') && !f.startsWith('vk-'))
    .map((f) => readFileSync(resolve(dir, f), 'utf8'))
    .join('\n');
  const tabs = JSON.parse(src.match(/export const TABS = (\[[^\]]+\])/)![1]!.replace(/'/g, '"')) as string[];
  const overlays = [...src.matchAll(/createOverlay\(\s*\w+,\s*'([\w-]+)'/g)].map((m) => m[1]!);
  const details = [...src.matchAll(/\.detail\(\s*'([\w-]+)'/g), ...src.matchAll(/detailName = '([\w-]+)'/g)].map((m) => m[1]!);
  const uniq = (a: string[]) => [...new Set(a)].sort();
  return { tabs: uniq(tabs), overlays: uniq(overlays), details: uniq(details) };
}

/** A rich save past the first minute: every tab open, pets on the shelf and in the storage, an egg in the incubator, coins for the store. */
export const FRAMES_SAVE = {
  coins: 4000,
  crystals: 3,
  incubators: [{ egg: 'egg_basic', startedAt: 0, progress: 0, elapsed: 0, waiting: false, careFed: 1 }, { egg: null }],
  creatures: [
    { uid: 'f1', species: 'kettle', level: 2, fed: 0, hatchedAt: 0, age: 0 },
    { uid: 'f2', species: 'cloudcat', level: 1, fed: 0, hatchedAt: 0, age: 0 },
    { uid: 'f3', species: 'lampbug', level: 3, fed: 0, hatchedAt: 0, age: 0 },
  ],
  showcase: ['f1'],
  upgrades: { showcase: 2, incubator: 1 },
  stats: { deals: 200, coinsEarned: 100_000, hatched: 210, taps: 900, levelUps: 50, haggles: 4, xp: 400, sessions: 1 },
  collection: { kettle: { seen: 3, hatched: 3, sold: 3 } },
  flags: {
    ftue_starter: true, ftue_done: true, ftue_fed: true, ftue_bought: true, showcase_m3: true,
    tab_market: true, tab_inventory: true, tab_sales: true, tab_chats: true, tab_shop: true, tab_eggs: true,
  },
};

const tab = (page: Page, id: string) => page.locator(`[data-tab=${id}]`).click();
const shown = (page: Page, sel: string) => expect(page.locator(sel).first()).toBeVisible();

/** How a player reaches each window; `away` is opened by the save itself (the first shot of a session). */
export const OPENERS: Record<string, (page: Page) => Promise<void>> = {
  'overlay:away': async (page) => shown(page, '[data-overlay=away]'),
  'overlay:gifts': async (page) => {
    await tab(page, 'home');
    await page.locator('[data-action=gifts]').click();
    await shown(page, '[data-overlay=gifts]');
  },
  'overlay:rate': async (page) => {
    await OPENERS['overlay:gifts']!(page);
    await page.locator('[data-action=gift-review]').click();
    await shown(page, '[data-overlay=rate]');
  },
  'overlay:hatch': async (page) => {
    await page.evaluate(() => (window as unknown as { __TEST__: { hatch(uid: string, egg: string): boolean } }).__TEST__.hatch('f2', 'egg_basic'));
    const win = page.locator('[data-overlay=hatch]');
    await expect(win).toBeVisible();
    if (await win.locator('[data-hatch-result]').isHidden()) await win.locator('[data-action=hatch-skip]').click();
    await expect(win.locator('[data-action=hatch-shop]')).toBeVisible();
  },
  'overlay:leaders': async (page) => {
    await tab(page, 'home');
    await page.locator('[data-action=leaders]').click();
    await shown(page, '[data-overlay=leaders]');
  },
  // Needs 3 minutes of play (events.json fromMin): the spec opens it last, after every other window.
  'overlay:merchant': async (page) => {
    await tab(page, 'home');
    type T = { __TEST__: { runSim(s: number): number; event(id: string): boolean; targets(): { eventThing: { x: number; y: number } | null } | null } };
    await page.evaluate(() => (window as unknown as T).__TEST__.runSim(181));
    await expect.poll(() => page.evaluate(() => (window as unknown as T).__TEST__.event('merchant') || ((window as unknown as T).__TEST__.runSim(25), false)), { timeout: 30_000 }).toBe(true);
    const win = page.locator('[data-overlay=merchant]');
    await expect.poll(() => page.evaluate(() => Boolean((window as unknown as T).__TEST__.targets()?.eventThing))).toBe(true);
    const p = (await page.evaluate(() => (window as unknown as T).__TEST__.targets()!.eventThing))!;
    await page.mouse.click(p.x, p.y);
    await expect(win).toBeVisible();
  },
  'overlay:pause': async (page) => {
    await page.locator('[data-action=pause]').click();
    await shown(page, '[data-overlay=pause]');
  },
  'overlay:settings': async (page) => {
    await OPENERS['overlay:pause']!(page);
    await page.locator('[data-overlay=pause] [data-action=settings]').click();
    await shown(page, '[data-overlay=settings]');
  },
  'overlay:reputation': async (page) => {
    await tab(page, 'home');
    await page.locator('[data-action=reputation]').click();
    await shown(page, '[data-overlay=reputation]');
  },
  'overlay:rebirth': async (page) => {
    await OPENERS['overlay:reputation']!(page);
    await page.locator('[data-action=rep-city]').click();
    await shown(page, '[data-overlay=rebirth]');
  },
  'overlay:work': async (page) => {
    await tab(page, 'home');
    await page.locator('.home-ui [data-action=work]').click();
    await shown(page, '[data-overlay=work]');
  },
  'detail:egg-card': async (page) => {
    await tab(page, 'eggs');
    await page.locator('[data-sheet=eggs] [data-action=egg-card-egg_basic]').click();
    await shown(page, '[data-detail=egg-card]');
  },
  'detail:lot': async (page) => {
    await tab(page, 'market');
    await page.locator('[data-sheet=market] .card-lot:not(.sold) [data-action^=lot-open-]').first().click();
    await shown(page, '[data-detail=lot]');
  },
  'detail:sale': async (page) => {
    await tab(page, 'sales');
    await page.locator('[data-sheet=sales] [data-action=sale-add]').first().click();
    await shown(page, '[data-detail=sale]');
  },
};

/** Closes whatever is open so the next opener starts from the home screen (a tab closes windows; the hatch has its own way out). */
export async function closeAll(page: Page): Promise<void> {
  await closeHatch(page).catch(() => false);
  for (const sel of ['[data-action=away-ok]', '[data-action=merchant-close]', '[data-action=rebirth-later]', '[data-overlay=rate] [data-action$=-close]', '[data-action=settings-close]', '[data-action=menu-back]', '[data-action=menu-play]']) {
    const b = page.locator(sel);
    if (await b.first().isVisible().catch(() => false)) await b.first().click();
  }
  await page.locator('[data-tab=home]').click();
}

/**
 * RD-02: «a button is seen whole» — every visible button of the screen, scrolled into view the way a player scrolls, lies inside
 * the screen and inside every box that clips it, and nothing covers any of its corners (the tab bar, a toast, another card).
 * Returns the problems as «action «text»: why».
 */
export async function buttonsSeenWhole(page: Page): Promise<string[]> {
  // Game time stands still meanwhile: lists re-rendered by a tick would swap the buttons under the check.
  type T = { __TEST__: { setTimeScale(k: number): void } };
  await page.evaluate(() => (window as unknown as T).__TEST__.setTimeScale(0));
  const bad = await checkButtons(page);
  await page.evaluate(() => (window as unknown as T).__TEST__.setTimeScale(1));
  return bad;
}

function checkButtons(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const bad: string[] = [];
    const visible = (el: HTMLElement) => {
      for (let e: HTMLElement | null = el; e; e = e.parentElement) {
        const cs = getComputedStyle(e);
        if (e.hidden || cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false;
      }
      const r = el.getBoundingClientRect();
      return r.width >= 1 && r.height >= 1;
    };
    // An open window is the screen now: its buttons and the tab bar (it stays above every window); otherwise the whole interface.
    // The top window is the one a tap in the middle of the screen reaches (a review window over «Подарки»).
    const open = [...document.querySelectorAll<HTMLElement>('.overlay:not([hidden]):not(.under)')].filter(visible);
    const z = (e: HTMLElement) => Number(getComputedStyle(e).zIndex) || 0;
    const top = open.sort((a, b) => z(a) - z(b) || (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1)).at(-1);
    // No window: the active tab's screen (on «Лавка» also the buttons over the scene), the top bar and the tab bar.
    const tab = document.querySelector<HTMLElement>('[data-tab].active')?.dataset.tab ?? 'home';
    const screen = [document.querySelector<HTMLElement>(`[data-sheet=${tab}]`), ...(tab === 'home' ? [...document.querySelectorAll<HTMLElement>('.home-ui')] : [])];
    const bars = [document.getElementById('hud') ?? document.querySelector<HTMLElement>('.hud'), document.getElementById('nav')];
    // W: on a short screen a window lies over the tab bar under its own dim — then the bar is not on the screen for a tap.
    const nb = bars[1]?.getBoundingClientRect();
    const navUnder = Boolean(top && nb && top.contains(document.elementFromPoint(nb.left + nb.width / 2, nb.top + nb.height / 2)));
    const roots = (top ? [top, ...(navUnder ? [] : [bars[1]])] : [...screen, ...bars]).filter((e): e is HTMLElement => Boolean(e));
    const buttons = roots.flatMap((root) => [...root.querySelectorAll<HTMLElement>('button, [role=button], a[href]')]).filter(visible);
    // RD-02 after the review: in a popup the main action is seen whole before any scrolling (the move window hid its buttons
    // below the fold sideways); and a button of a window stays inside its card (the merchant's price buttons ran over the names).
    if (top && top.dataset.kind === 'popup') {
      const card = top.querySelector<HTMLElement>(':scope > .card');
      const all = [...(card?.querySelectorAll<HTMLElement>('button') ?? [])].filter((b) => visible(b) && !b.classList.contains('win-x'));
      const main = all.filter((b) => b.classList.contains('btn-primary'));
      const want = main.length ? main : all;
      const seen = (b: HTMLElement) => {
        const r = b.getBoundingClientRect();
        const c = card!.getBoundingClientRect();
        return r.top >= Math.max(0, c.top) - 0.5 && r.bottom <= Math.min(innerHeight, c.bottom) + 0.5;
      };
      if (want.length && !want.some(seen)) bad.push(`${top.dataset.overlay} window: the main action «${(want[0]!.innerText ?? '').trim().slice(0, 24)}» needs scrolling to be seen`);
    }
    for (const b of top ? [...top.querySelectorAll<HTMLElement>(':scope > .card button')].filter(visible) : []) {
      const card = top!.querySelector<HTMLElement>(':scope > .card')!.getBoundingClientRect();
      const r = b.getBoundingClientRect();
      if (r.left < card.left - 0.5 || r.right > card.right + 0.5) bad.push(`${b.dataset.action ?? b.className} «${(b.innerText ?? '').trim().slice(0, 24)}»: out of its window's card`);
    }
    const retries = new Map<HTMLElement, number>();
    const key = (b: HTMLElement) => `${b.dataset.action ?? ''}|${b.dataset.chat ?? ''}|${b.dataset.sub ?? ''}|${b.dataset.chat ? '' : b.innerText}`;
    for (let i = 0; i < buttons.length; i++) {
      const el = buttons[i]!;
      const label = `${el.dataset.action ?? el.dataset.tab ?? el.dataset.sub ?? el.className} «${(el.innerText ?? '').trim().replace(/\s+/g, ' ').slice(0, 24)}»`;
      // Scroll like a player: only boxes the player can scroll (overflow auto / scroll) move, the button to their middle.
      for (let e = el.parentElement; e && e !== document.body; e = e.parentElement) {
        const cs = getComputedStyle(e);
        const r0 = el.getBoundingClientRect();
        const c = e.getBoundingClientRect();
        if (/(auto|scroll)/.test(cs.overflowY) && e.scrollHeight > e.clientHeight) e.scrollTop += r0.top + r0.height / 2 - (c.top + c.height / 2);
        if (/(auto|scroll)/.test(cs.overflowX) && e.scrollWidth > e.clientWidth) e.scrollLeft += r0.left + r0.width / 2 - (c.left + c.width / 2);
      }
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      // A list that re-renders on its tick (the shop, the market) replaces the node: the new one is checked in its own turn.
      if (!el.isConnected) {
        // A list that re-renders on its tick (the chats) replaces the node: the same button is found again by its action and text.
        const again = roots.flatMap((root) => [...root.querySelectorAll<HTMLElement>('button, [role=button], a[href]')]).find((b) => !buttons.includes(b) && key(b) === key(el));
        if (again && (retries.get(again) ?? 0) < 3) {
          retries.set(again, (retries.get(el) ?? 0) + 1);
          buttons.push(again);
        } else bad.push(`${label}: re-rendered under the check, not seen`);
        continue;
      }
      const r = el.getBoundingClientRect();
      const why: string[] = [];
      if (r.left < -0.5 || r.top < -0.5 || r.right > innerWidth + 0.5 || r.bottom > innerHeight + 0.5) why.push('off screen');
      for (let e = el.parentElement; e && e !== document.body; e = e.parentElement) {
        const cs = getComputedStyle(e);
        if (cs.overflowX === 'visible' && cs.overflowY === 'visible') continue;
        const c = e.getBoundingClientRect();
        if (r.left < c.left - 0.5 || r.right > c.right + 0.5 || r.top < c.top - 0.5 || r.bottom > c.bottom + 0.5) {
          why.push(`clipped by ${e.className || e.tagName}`);
          break;
        }
      }
      // A button the scene takes taps for (pointer-events: none) is drawn, not tapped: only its box counts.
      if (!why.length && getComputedStyle(el).pointerEvents !== 'none') {
        // The tap points: the middle and four points a quarter in from the corners (a title box over a ✕ corner is not a cover).
        const dx = r.width / 4;
        const dy = r.height / 4;
        for (const [x, y] of [[r.left + r.width / 2, r.top + r.height / 2], [r.left + dx, r.top + dy], [r.right - dx, r.top + dy], [r.left + dx, r.bottom - dy], [r.right - dx, r.bottom - dy]] as Array<[number, number]>) {
          const top = document.elementFromPoint(x, y);
          if (top && top !== el && !el.contains(top) && !top.contains(el)) {
            why.push(`covered by ${(top as HTMLElement).className || top.tagName}`);
            break;
          }
        }
      }
      if (why.length) bad.push(`${label}: ${why.join(', ')}`);
    }
    return bad;
  });
}

/**
 * RD-02, PT-01: opens every window and tab from the code of the windows the way a player does (the away window first, the merchant
 * last) and calls frame(name) on each; with shots — also the goals of the day in «Подарки».
 */
export async function walkEveryWindow(page: Page, frame: (name: string) => Promise<void>, tag: string | null, shotsDir: string | null, openers = OPENERS): Promise<void> {
  const w = windowsInCode();
  await openers['overlay:away']!(page);
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
  // W: «Цена» (the pet picked for sale) and the goals of the day in «Подарки» — screens inside the windows above.
  await openers['detail:sale']!(page);
  await page.locator('[data-detail=sale] [data-action^=sale-list-]').first().click();
  await frame('detail-sale-price');
  await closeAll(page);
  await openers['overlay:gifts']!(page);
  if (shotsDir && tag) {
    await page.locator('[data-overlay=gifts] .day-goal').first().scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${shotsDir}/overlay-gifts-goals_${tag}.png` });
  }
  await closeAll(page);
  for (const kind of ['detail', 'overlay'] as const) {
    const ids = kind === 'overlay' ? [...w.overlays.filter((id) => id !== 'merchant'), 'merchant'] : w.details;
    for (const id of ids) {
      if (id === 'away') continue;
      await openers[`${kind}:${id}`]!(page);
      await frame(`${kind}-${id}`);
      await closeAll(page);
    }
  }
}
