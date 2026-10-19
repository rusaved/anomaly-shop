// MU-12: screenshots of every screen of docs/07 next to its mockup (docs/mockups) — portrait 375×650 (the zone of a phone) and landscape 812×330.
// Run after `npm run build:e2e`: node scripts/mu-shots.mjs [outDir=docs/evidence/MU/screens] [--only=name,name] [--font130]
// The save is seeded past the first minute with one pet of every rarity; console errors are printed and fail the run.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const out = resolve(args.find((a) => !a.startsWith('--')) ?? 'docs/evidence/MU/screens');
const only = (args.find((a) => a.startsWith('--only='))?.slice(7) ?? '').split(',').filter(Boolean);
// --font130: a system font at 130 % the way the check of 07 emulates it — every text of the HTML layer 1.3 times larger (the game sets px).
const font130 = args.includes('--font130');
mkdirSync(out, { recursive: true });
const port = 4198;
const srv = spawn('npx', ['vite', 'preview', '--outDir', process.env.MU_DIST || 'dist-e2e', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], { stdio: 'ignore', detached: true });
await new Promise((r) => setTimeout(r, 2500));
const marker = resolve('.cache/chromium-path');
const executablePath = process.env.CHROMIUM_EXECUTABLE || (existsSync(marker) ? readFileSync(marker, 'utf8').trim() : undefined);
const browser = await chromium.launch({ executablePath, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

const pet = (uid, species, level = 1) => ({ uid, species, level, fed: 0, hatchedAt: 0, age: 0 });
const save = () => ({
  v: 1, rev: 999, savedAt: Date.now(), createdAt: 0, lastSeenAt: 0, coins: 120, crystals: 3,
  incubators: [{ egg: 'egg_basic', startedAt: 0, progress: 0, elapsed: 0, waiting: false }, { egg: null }],
  creatures: [pet('a', 'kettle', 2), pet('b', 'cloudcat'), pet('c', 'lampbug', 3), pet('d', 'jellytoast'), pet('e', 'shroom'), pet('f', 'moon_donut')],
  showcase: ['a', 'b'],
  upgrades: { showcase: 2, incubator: 1 },
  stats: { deals: 8, coinsEarned: 300, hatched: 10, taps: 100, levelUps: 3, haggles: 1 },
  settings: { sound: false, lang: null },
  flags: { open_market: true, open_inventory: true, open_sales: true, open_chats: true, open_shop: true, ftue_starter: true, ftue_done: true, ftue_fed: true, ftue_bought: true, tab_market: true, tab_inventory: true, tab_sales: true, tab_chats: true, tab_shop: true, tab_eggs: true },
});

const errors = [];
async function session(w, h, tag, fresh = false, patch = null) {
  // The 130 % set is for overflow only: 1× pictures keep the evidence small.
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true, deviceScaleFactor: font130 ? 1 : 2 });
  const page = await ctx.newPage();
  page.on('console', (m) => m.type() === 'error' && errors.push(`${tag}: ${m.text()}`));
  page.on('pageerror', (e) => errors.push(`${tag}: ${e.message}`));
  await page.addInitScript(({ text }) => {
    if (text && !sessionStorage.getItem('mu-seeded')) {
      localStorage.setItem('anomaly-shop:save', text);
      localStorage.setItem('__yasdk_mock_player__', JSON.stringify({ save: text }));
      sessionStorage.setItem('mu-seeded', '1');
    }
  }, { text: fresh ? '' : JSON.stringify({ ...save(), ...(patch ?? {}) }) });
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.waitForFunction(() => window.__TEST__?.state().controllable);
  await page.waitForTimeout(600);
  return { page, ctx };
}
const shot = async (page, name, keepToast = false) => {
  if (only.length && !only.includes(name.split('.')[0])) return;
  // After the animation: a toast moves the screen down while it shows (the toast shot keeps it).
  if (!keepToast) await page.waitForFunction(() => !document.querySelector('.toast'), null, { timeout: 8000 }).catch(() => {});
  // A window still opening is half transparent: the finite animations end first.
  await page.evaluate(() => Promise.all(document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations !== Infinity).map((a) => a.finished.catch(() => {})))).catch(() => {});
  if (font130)
    await page.evaluate(() => {
      // Read every size first, then set them (a scaled parent must not scale its children twice); scaled ones stay marked.
      const els = [...document.querySelectorAll('#ui *')].filter((el) => !el.dataset.mu130);
      const sizes = els.map((el) => parseFloat(getComputedStyle(el).fontSize));
      // A piece drawn anew inside a scaled parent (a window filled after it opened) already inherits the larger size: only marked, not scaled twice.
      const inherits = els.map((el) => el.parentElement?.dataset.mu130 === '1' && Math.abs(parseFloat(getComputedStyle(el.parentElement).fontSize) - parseFloat(getComputedStyle(el).fontSize)) < 0.01);
      els.forEach((el, i) => {
        el.dataset.mu130 = '1';
        if (!inherits[i]) el.style.fontSize = `${Math.round((sizes[i] ?? 16) * 13) / 10}px`;
      });
    });
  await page.waitForTimeout(350);
  await page.screenshot({ path: `${out}/${name}.png` });
};
const tab = (page, id) => page.locator(`[data-tab=${id}]`).click();
const tryStep = async (name, fn) => {
  try {
    await fn();
  } catch (e) {
    errors.push(`${name}: ${String(e).split('\n')[0]}`);
  }
};

for (const [w, h, tag] of [[375, 650, 'p'], [812, 330, 'l']]) {
  const { page, ctx } = await session(w, h, tag);
  await tryStep(`${tag} home`, async () => shot(page, `home.${tag}`));
  await tryStep(`${tag} eggs`, async () => {
    await tab(page, 'eggs');
    await shot(page, `eggs.${tag}`);
    await page.locator('[data-sheet=eggs] [data-action="egg-card-egg_basic"]').click();
    await shot(page, `egg-card.${tag}`);
  });
  await tryStep(`${tag} inventory`, async () => {
    await tab(page, 'inventory');
    await shot(page, `inventory.${tag}`);
    await page.locator('[data-sheet=inventory] [data-sub=collection]').click();
    await shot(page, `collection.${tag}`);
    await page.locator('[data-sheet=inventory] [data-sub=finds]').click();
    await shot(page, `finds.${tag}`);
  });
  await tryStep(`${tag} sales`, async () => {
    await tab(page, 'sales');
    await shot(page, `sales.${tag}`);
    await page.locator('[data-sheet=sales] [data-action="sale-add"]').first().click();
    await shot(page, `pick.${tag}`);
    await page.locator('[data-detail=sale] [data-action^="sale-list-"]').first().click();
    await shot(page, `price.${tag}`);
    await page.locator('[data-detail=sale] [data-action="sale-back"]').click();
    await page.locator('[data-detail=sale] [data-action="sale-back"]').click();
  });
  await tryStep(`${tag} market`, async () => {
    await tab(page, 'market');
    await shot(page, `market.${tag}`);
    await page.locator('[data-sheet=market] [data-action^="lot-open-"]').first().click();
    await shot(page, `lot.${tag}`);
  });
  await tryStep(`${tag} shop`, async () => {
    await tab(page, 'shop');
    await shot(page, `shop.${tag}`);
    // The section «Пункт продаж» (07 «Словарь»: «Пункт» in the segment).
    await page.locator('[data-sheet=shop] [data-sub=point]').click();
    await shot(page, `point.${tag}`);
    await page.locator('[data-sheet=shop] [data-sub=upgrades]').click();
  });
  await tryStep(`${tag} chats`, async () => {
    // A buyer writes about a pet on the shelf: the game runs on a minute.
    await page.evaluate(() => window.__TEST__.runSim(60));
    await tab(page, 'chats');
    await shot(page, `chats.${tag}`);
    // Portrait: the list, then a dialog; sideways the newest chat stands open next to the list (l2) — chat.l is another one.
    const rows = page.locator('[data-sheet=chats] .chat-row:not(.closed)');
    const row = tag === 'l' && (await rows.count()) > 1 ? rows.nth(1) : rows.first();
    if (await row.isVisible()) await row.click();
    await shot(page, `chat.${tag}`);
    // A pet a buyer writes about: its place in «Продажи» with the main «В чат» (s3).
    await tab(page, 'sales');
    await shot(page, `sales-chat.${tag}`);
    // One toast at the top under the bar (07 rule 17).
    await tab(page, 'home');
    await page.evaluate(() => window.__TEST__.toast('Новые находки: 2!'));
    await page.waitForTimeout(400);
    await shot(page, `toast.${tag}`, true);
  });
  await tryStep(`${tag} windows`, async () => {
    await tab(page, 'home');
    await page.locator('[data-action=gifts]').click();
    await shot(page, `gifts.${tag}`);
    // Круг правок FB п. 8: «Цели дня» — the bottom of «Подарки».
    await page.locator('[data-overlay=gifts] .day-goal').first().scrollIntoViewIfNeeded();
    await shot(page, `goals.${tag}`);
    await page.locator('[data-overlay=gifts] [data-action=gift-review]').click();
    await shot(page, `rate.${tag}`);
    await tab(page, 'home');
    await page.locator('[data-action=pause]').click();
    await shot(page, `pause.${tag}`);
    await page.locator('[data-action=settings]').click();
    await shot(page, `settings.${tag}`);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await tab(page, 'home');
    await page.locator('[data-action=leaders]').click();
    await shot(page, `leaders.${tag}`);
    await tab(page, 'home');
    await page.locator('[data-action=work]').click();
    await shot(page, `work.${tag}`);
    await tab(page, 'home');
    await page.locator('[data-action=reputation]').click();
    await shot(page, `level.${tag}`);
    await tab(page, 'home');
  });
  await tryStep(`${tag} hatch`, async () => {
    await tab(page, 'eggs');
    await page.evaluate(() => window.__TEST__.grant(500));
    await page.locator('[data-sheet=eggs] [data-action="egg-buy-egg_basic"]').click();
    const open = page.locator('[data-sheet=eggs] [data-action^="egg-open-"]').first();
    for (let i = 0; i < 40 && !(await open.isVisible()); i++) await page.evaluate(() => window.__TEST__.runSim(5));
    if (await open.isVisible()) {
      await open.click();
      // Круг правок FB п. 8: the strip runs where the pet will stand (a shot mid-run, no animation wait).
      await page.waitForTimeout(1200);
      if (!only.length || only.includes('hatch-run')) await page.screenshot({ path: `${out}/hatch-run.${tag}.png` });
      const skip = page.locator('[data-action=hatch-skip]');
      if (await skip.isVisible()) await skip.click();
      await page.waitForTimeout(900);
      await shot(page, `hatch.${tag}`);
      await page.locator('[data-action=hatch-keep]').click();
    } else throw new Error('the egg did not get ready');
  });
  // «Вылупился!» of the seed's VIP and exclusive pets (r1, s6): the frame, the shine and the pulse, «1 из N яиц».
  for (const [uid, name] of [['e', 'hatch-vip'], ['f', 'hatch-exclusive']])
    await tryStep(`${tag} ${name}`, async () => {
      await tab(page, 'home');
      if (!(await page.evaluate((id) => window.__TEST__.hatch(id), uid))) throw new Error(`no pet ${uid}`);
      await page.waitForTimeout(400);
      await page.locator('[data-action=hatch-skip]').click();
      // Круг правок FB п. 8: the salute of the rarity while it plays (no wait for the animations).
      await page.waitForTimeout(260);
      const salute = name.replace('hatch-', 'salute-');
      if (!only.length || only.includes(salute)) await page.screenshot({ path: `${out}/${salute}.${tag}.png` });
      await page.waitForTimeout(900);
      await shot(page, `${name}.${tag}`);
      await page.locator('[data-action=hatch-keep]').click();
    });
  await ctx.close();
  // Круг правок FB п. 8: «Пока тебя не было» after 5 hours away; «На витрину» with a full shelf (the window closes, a toast says it).
  await tryStep(`${tag} away`, async () => {
    const ago = Date.now() - 5 * 3600 * 1000;
    const away = await session(w, h, `${tag}-away`, false, { savedAt: ago, lastSeenAt: ago, incomeMinutes: [300, 300, 300], stats: { deals: 8, coinsEarned: 300, hatched: 10, taps: 100, levelUps: 3, haggles: 1, income: 300 } });
    await away.page.locator('[data-overlay=away]:not([hidden])').waitFor();
    await shot(away.page, `away.${tag}`);
    await away.ctx.close();
  });
  await tryStep(`${tag} full shelf`, async () => {
    const full = await session(w, h, `${tag}-full`, false, { showcase: ['a', 'b', 'c'] });
    if (!(await full.page.evaluate(() => window.__TEST__.hatch('d', 'egg_basic')))) throw new Error('no pet d');
    await full.page.waitForTimeout(450);
    await full.page.locator('[data-action=hatch-skip]').click();
    await full.page.waitForTimeout(900);
    await shot(full.page, `full-shelf-result.${tag}`);
    await full.page.locator('[data-action=hatch-shop]').click();
    await full.page.waitForTimeout(300);
    await shot(full.page, `full-shelf.${tag}`, true);
    await full.ctx.close();
  });
  // The hint of the first minute (07 rule 16): a new player, the hint next to its target in a green frame.
  await tryStep(`${tag} hint`, async () => {
    const first = await session(w, h, `${tag}-hint`, true);
    await first.page.locator('.hint:not([hidden]) [data-hint-text]').waitFor();
    await shot(first.page, `hint.${tag}`);
    await first.ctx.close();
  });
}
// Круг правок FB-2 п. 7: the salute of VIP and exclusive at 0, 150 and 300 ms after the reveal (the CSS animations paused and stepped; the
// window's own fade-in finished), portrait and sideways; a PC 1280×720 «Лавка».
for (const [w, h, tag] of [[375, 650, 'p'], [812, 330, 'l']])
  for (const [uid, name] of [['e', 'vip'], ['f', 'exclusive']])
    await tryStep(`${tag} salute ${name}`, async () => {
      if (only.length && !only.includes('salute-ms')) return;
      const s = await session(w, h, `${tag}-salute`);
      await s.page.waitForFunction(() => !document.querySelector('.toast'), null, { timeout: 8000 }).catch(() => {});
      if (!(await s.page.evaluate((id) => window.__TEST__.hatch(id), uid))) throw new Error(`no pet ${uid}`);
      await s.page.waitForTimeout(400);
      await s.page.locator('[data-action=hatch-skip]').click();
      await s.page.evaluate(() => document.getAnimations().forEach((a) => (a.animationName === 'win-in' ? a.finish() : a.pause())));
      for (const t of [0, 150, 300]) {
        await s.page.evaluate((t) => {
          const card = document.querySelector('.card-hatch');
          for (const a of document.getAnimations()) {
            const el = a.effect?.target;
            if (a.animationName !== 'win-in' && el && (el === card || card.contains(el) || el.classList.contains('burst-flash'))) a.currentTime = t;
          }
        }, t);
        await s.page.screenshot({ path: `${out}/salute-${name}-${t}ms.${tag}.png` });
      }
      await s.ctx.close();
    });
await tryStep('pc home', async () => {
  if (only.length && !only.includes('pc')) return;
  const s = await session(1280, 720, 'pc');
  await s.page.waitForFunction(() => !document.querySelector('.toast'), null, { timeout: 8000 }).catch(() => {});
  await s.page.waitForTimeout(350);
  await s.page.screenshot({ path: `${out}/home.pc.png` });
  await s.ctx.close();
});
await browser.close();
// The preview server and its children go with the run (npx starts vite as a child).
try {
  process.kill(-srv.pid);
} catch {
  srv.kill();
}
console.log(`shots: ${out}`);
if (errors.length) {
  console.log(errors.join('\n'));
  process.exitCode = 1;
}
