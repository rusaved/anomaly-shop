// What: entry point; boots the shop in the order platform → language → data → save → scene → ready (docs/02, section 3).
// Called by: index.html (<script type="module">).
// Keep: the boot order and the single ready() call; layers do their own work, this file only wires them.

import '@fontsource/rubik/cyrillic-400.css';
import '@fontsource/rubik/latin-400.css';
import '@fontsource/rubik/cyrillic-700.css';
import '@fontsource/rubik/latin-700.css';
import './ui/styles.css';
import style from '@content/style.json';
import { applyTheme } from './ui/theme.ts';
import { createHud } from './ui/hud.ts';
import { watchLayout } from './ui/layout.ts';
import { createI18n } from './ui/i18n.ts';
import { createPauseWindow } from './ui/pause.ts';
import { createSettingsWindow } from './ui/settings.ts';
import { communityLinks, renderCommunity } from './ui/community.ts';
import { renderBuildLabel } from './ui/label.ts';
import { createCoinFlight } from './ui/coin-flight.ts';
import { createShopTab } from './ui/upgrades.ts';
import { moodChip } from './ui/mood.ts';
import { createRebirthWindow } from './ui/rebirth.ts';
import { createLeadersWindow } from './ui/leaders.ts';
import { createHints } from './ui/hints.ts';
import { createNextCard } from './ui/next.ts';
import { createNewsTicker } from './ui/news.ts';
import { createMerchantWindow } from './ui/merchant.ts';
import { createChatter } from './ui/chatter.ts';
import { AWAY_MIN_SEC, createAwayWindow } from './ui/away.ts';
import { bindFunnel } from './analytics/funnel.ts';
import { ftueHint, tabHint, tabUnlocked } from './sim/ftue.ts';
import { createToasts } from './ui/toast.ts';
import { createNav, TABS, type TabId } from './ui/nav.ts';
import { dismissAll, dismissTop, topWindow } from './ui/overlay.ts';
import { createSheet, type Sheet } from './ui/sheet.ts';
import { createInventoryTab } from './ui/inventory.ts';
import { createEggsTab } from './ui/eggs.ts';
import { createSalesTab } from './ui/sales.ts';
import { createChatsTab } from './ui/chats.ts';
import { createMarketTab } from './ui/market.ts';
import { renderLot } from './ui/seller.ts';
import { createGiftsWindow } from './ui/gifts.ts';
import { createWorkWindow } from './ui/work.ts';
import { createReputation } from './ui/reputation.ts';
import { RARITIES } from './content/schemas.ts';
import { createHatchShow } from './ui/hatch.ts';
import { eggOdds } from './sim/rules.ts';
import { createPortraits } from './scene/portraits.ts';
import { rarityColor } from './scene/art.ts';
import { audio, codes, collection, decor as decorData, reputation, customers, dictionaries, eggs, events as randomEvents, feel, ftue, gifts, lines, market, nav as navData, news, work, secrets, species, speciesById, style as styleData, upgrades } from './content/index.ts';
import { createSfx } from './audio/sfx.ts';
import { createSceneApp } from './scene/app.ts';
import { createShopView } from './scene/shop.ts';
import { loadPlatform } from './platform/index.ts';
import { watchLifecycle } from './platform/lifecycle.ts';
import { bindPersistence, loadState } from './platform/persist.ts';
import { createRuntime } from './core/runtime.ts';
import { createStore } from './sim/store.ts';
import { createGame, type Game } from './sim/game.ts';
import { createRng } from './core/rng.ts';
import { newSave } from './sim/state.ts';
import { track } from './analytics/track.ts';

async function boot(): Promise<void> {
  applyTheme(style.colors);
  const platform = await loadPlatform(track);
  let game: Game | null = null;
  const runtime = createRuntime((dt) => game?.tick(dt));
  let controllable = false;
  let startupAd = false;
  let flushSave: () => void = () => undefined;
  /** Platform time the tab went hidden (the shop catches up on return, M2-04). */
  let hiddenAt = 0;
  let catchUp: (awaySec: number) => void = () => undefined;

  // Pause wiring (docs/02-tech.md, section 4.2): sdk from the platform, hidden/blur from the browser.
  platform.onPause(() => {
    if (!controllable) {
      startupAd = true;
      track('startup_ad_start');
    }
    runtime.pause.pause('sdk');
  });
  platform.onResume(() => {
    if (startupAd) {
      startupAd = false;
      track('startup_ad_end');
    }
    runtime.pause.resume('sdk');
  });
  watchLifecycle({
    hidden: () => {
      runtime.pause.pause('hidden');
      hiddenAt = platform.now();
      flushSave();
    },
    visible: () => {
      runtime.pause.resume('hidden');
      if (hiddenAt > 0) catchUp((platform.now() - hiddenAt) / 1000);
      hiddenAt = 0;
    },
    blur: () => runtime.pause.pause('blur'),
    focus: () => runtime.pause.resume('blur'),
    pagehide: () => flushSave(),
  });
  runtime.pause.onChange((paused) => {
    if (!controllable) return;
    if (paused) platform.gameplayStop();
    else platform.gameplayStart();
  });

  await platform.init();
  const store = createStore(await loadState(platform, track), () => platform.now());
  /** Last save of the previous visit: the shop works on for the time since (helpers, incubators). */
  const lastSeen = store.state.savedAt;
  const persistence = bindPersistence(store, platform);
  flushSave = () => persistence.flush();
  const play = createGame(store, { eggs, species, customers, upgrades, ftue, events: randomEvents, secrets, market, gifts, work, codes, reputation, collection, decor: decorData }, createRng(platform.now()));
  game = play;
  const funnel = bindFunnel(play, store, track);

  // Language: the saved manual choice (LOC-05) wins over the platform language (SDK-05); set before the first frame.
  const i18n = createI18n(dictionaries, store.state.settings.lang ?? platform.language(), __GAME__.fallbackLanguage, __DEBUG_TOOLS__);
  const lang = i18n.lang();
  document.documentElement.lang = lang;

  const canvas = document.getElementById('scene') as HTMLCanvasElement;
  const appRoot = document.getElementById('app') as HTMLElement;
  const uiRoot = document.getElementById('ui') as HTMLElement;
  const scene = await createSceneApp(canvas, style.colors.sky, window.devicePixelRatio);
  await document.fonts.ready;
  const shop = createShopView(scene.app, {
    style: styleData,
    feel,
    t: i18n.t,
    line: (id) => speciesById(id)?.line[i18n.lang()] ?? '',
    careShell: eggs.care.shell,
    invalidate: scene.invalidate,
    handlers: {
      tapIncubator: (i) => play.tapIncubator(i),
      tapCreature: (uid) => play.tapCreature(uid),
      tapEvent: () => play.tapEvent(),
      tapEventCoin: (id) => play.tapEventCoin(id),
      tapThing: (target) => play.tapThing(target),
      tapBoard: () => {
        const o = store.state.order;
        if (!o) return;
        const lang = i18n.lang();
        const who = customers.people.names[o.person]?.[lang] ?? '';
        toasts.show(i18n.t('order.info', { who, name: speciesById(o.species)?.name[lang] ?? o.species, n: o.level, reward: o.reward, m: Math.max(1, Math.ceil(o.left / 60)) }), 'good', 3200);
        sfx.play('tap');
      },
    },
  });
  const hud = createHud(uiRoot, lang, () => feel.hudRollSec);
  hud.update(store.state.coins, { snap: true });
  // Sale coins roll the counter only as they land (M1-07, the sold handler below); everything else rolls at once.
  store.onCommit((s) => hud.update(s.coins));
  store.onCommit((s) => hud.crystals(s.crystals, s.crystals > 0 || Boolean(s.flags.crystal_seen)));
  hud.crystals(store.state.crystals, store.state.crystals > 0 || Boolean(store.state.flags.crystal_seen));
  const flight = createCoinFlight(uiRoot);
  const links = platform.caps.community ? communityLinks() : null;
  // The genre-standard frame (docs/01 §1а, §6): one tab bar at the bottom, «Eggs» is home (the shop scene + its panel).
  // M4-00: one panel model for every tab — the same panel by the shop (right of it on a PC and sideways, under it on a phone);
  // ✕, a tap on the active tab or on the shop closes a tab to the home «Eggs»; «Back» lives only inside a tab; each keeps its scroll.
  const portraits = createPortraits(scene.app, styleData);
  /** M4-23: the mood chip of a species today. */
  const moodOf = (id: string): string => {
    const m = play.mood();
    const kind = m?.hot === id ? 'hot' : m?.cold === id ? 'cold' : null;
    return moodChip(kind, kind === 'hot' ? (m?.hotMult ?? 1) : (m?.coldMult ?? 1), i18n.t, i18n.lang());
  };
  const sheets = new Map<TabId, Sheet>();
  for (const id of TABS) sheets.set(id, createSheet(uiRoot, id, id === 'eggs'));
  let shown: TabId = 'eggs';
  const showTab = (tab: TabId, again = false): void => {
    // UB-02: a tab works from any window — whatever is open closes its own way first.
    dismissAll();
    if (again && tab !== 'eggs') {
      selectTab('eggs');
      return;
    }
    // On the home tab a second tap brings the egg list back (the egg card closes).
    if (again) eggsTab.show(null);
    for (const [id, sh] of sheets) {
      if (id === tab) sh.show();
      else sh.hide();
    }
    if (shown === 'shop' && tab !== 'shop') play.seenShop();
    shown = tab;
    // UB-10: the Chats tab opens on its list (new buyers on top), never on an old closed chat.
    if (tab === 'chats') chatsTab.show(null);
    // A tap on the shop closes another tab (the shop is the home screen).
    sceneCatcher.hidden = tab === 'eggs';
    renderTabs();
    // UB-06: the first visit of a tab — its one hint, until the next tap.
    intro = play.seenTab(tab) ? { tab, at: performance.now() } : null;
  };
  let intro: { tab: TabId; at: number } | null = null;
  document.addEventListener(
    'pointerdown',
    () => {
      if (intro && performance.now() - intro.at > 300) intro = null;
    },
    true,
  );
  const selectTab = (tab: TabId): void => {
    nav.mark(tab);
    showTab(tab);
  };
  const sceneCatcher = document.createElement('div');
  sceneCatcher.className = 'scene-catcher';
  sceneCatcher.dataset.action = 'scene-close';
  sceneCatcher.hidden = true;
  sceneCatcher.addEventListener('click', () => selectTab('eggs'));
  uiRoot.appendChild(sceneCatcher);
  for (const [id, sh] of sheets) if (id !== 'eggs') sh.onClose(() => selectTab('eggs'));
  // UB-04: a button on the shop itself opens the Shop on its «Upgrades» (Q-021 B), the shop stays in view.
  uiRoot.insertAdjacentHTML(
    'beforeend',
    '<button type="button" class="stage-btn" data-action="open-upgrades"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4l6 6-3 3-6-6z"/><path d="M11 7L4 14l3 3 7-7"/><path d="M6 19l-2 1 1-2"/></svg><span data-i18n="upgrades.open"></span><span class="nav-badge nav-dot" data-upgrades-dot hidden></span></button>',
  );
  const stageButton = uiRoot.querySelector('[data-action="open-upgrades"]') as HTMLElement;
  const openUpgrades = (): void => {
    selectTab('shop');
    shopTab.section('upgrades');
  };
  stageButton.addEventListener('click', openUpgrades);
  const nav = createNav(uiRoot, showTab);
  hud.balance.addEventListener('click', openUpgrades);
  for (const [id, key] of [['season', 'season.later']] as const) {
    const s = sheets.get(id)!;
    s.body.innerHTML = `<p class="empty" data-i18n="${key}"></p>`;
    s.setTitle(i18n.t(`nav.${id}`));
  }
  const shopTab = createShopTab(sheets.get('shop')!, play, {
    t: i18n.t,
    lang: i18n.lang,
    upgrade: (id) => upgrades.upgrades.find((u) => u.id === id),
    tierColors: Object.values(styleData.rarity),
    sections: navData.shop.sections.filter((x) => x.enabled).map((x) => x.id),
    guestName: (id) => decorData.items.find((x) => x.id === id)?.name[i18n.lang()] ?? id,
    themeName: (theme) => decorData.sets.find((x) => x.theme === theme)?.name[i18n.lang()] ?? theme,
    pointLevel: (() => {
      const u = upgrades.upgrades.find((x) => x.id === 'point_rent')?.unlock;
      return u?.type === 'level' ? u.n : 1;
    })(),
  });
  shopTab.section('upgrades');
  const inventoryTab = createInventoryTab(sheets.get('inventory')!, play, {
    t: i18n.t,
    lang: i18n.lang,
    speciesName: (id) => speciesById(id)?.name[i18n.lang()] ?? id,
    portrait: (id, r) => portraits.creature(id, r),
    rarityColor: (r) => rarityColor(styleData.rarity, r),
    pick: (uid) => play.tapCreature(uid),
    mood: moodOf,
    list: (uid) => {
      if (!play.list(uid)) return;
      selectTab('sales');
      salesTab.show(uid);
    },
  });
  const eggsTab = createEggsTab(sheets.get('eggs')!, play, {
    t: i18n.t,
    lang: i18n.lang,
    egg: (id) => eggs.eggs.find((e) => e.id === id),
    eggName: (id) => eggs.eggs.find((e) => e.id === id)?.name[i18n.lang()] ?? id,
    eggPicture: (id, tint) => portraits.egg(id, tint),
    species,
    speciesName: (id) => speciesById(id)?.name[i18n.lang()] ?? id,
    portrait: (id, r) => portraits.creature(id, r),
    rarityColor: (r) => rarityColor(styleData.rarity, r),
    districtName: (id) => customers.districts.find((d) => d.id === id)?.name[i18n.lang()] ?? id,
    careShell: eggs.care.shell,
  });
  const hatchShow = createHatchShow(uiRoot, play, {
    t: i18n.t,
    lang: i18n.lang,
    odds: (id) => {
      const egg = eggs.eggs.find((e) => e.id === id);
      return egg ? eggOdds(egg.chances, species) : [];
    },
    portrait: (id, r) => portraits.creature(id, r),
    rarityColor: (r) => rarityColor(styleData.rarity, r),
    speciesName: (id) => speciesById(id)?.name[i18n.lang()] ?? id,
    spinSec: () => feel.hatchShowSec,
    onReveal: (rarity) => sfx.play(rarity === 'common' ? 'hatch' : 'rare'),
    // UB-10: past the first minute «To the shop» opens the price slider (the first minute stays one tap: FTUE, UB-06).
    onListed: (uid) => {
      if (!store.state.flags.ftue_done) return;
      // M4-00: the price card is an inner page of «My sales» — the tab opens on it.
      selectTab('sales');
      salesTab.show(uid);
    },
  });
  // Timers on the egg screen (free egg, hatching) tick each second while it is open.
  window.setInterval(() => {
    if (nav.active() === 'eggs') eggsTab.render();
  }, 1000);
  const salesTab = createSalesTab(sheets.get('sales')!, play, {
    t: i18n.t,
    lang: i18n.lang,
    speciesName: (id) => speciesById(id)?.name[i18n.lang()] ?? id,
    portrait: (id, r) => portraits.creature(id, r),
    rarityColor: (r) => rarityColor(styleData.rarity, r),
    slider: market.slider,
    zoneColors: RARITIES.map((r) => styleData.rarity[r]),
    mood: moodOf,
    openChat: (uid) => {
      selectTab('chats');
      chatsTab.show(uid);
    },
  });
  const chatsTab = createChatsTab(sheets.get('chats')!, play, {
    t: i18n.t,
    lang: () => i18n.lang(),
    character: (id) => customers.characters.find((c) => c.id === id),
    person: (i) => {
      const p = customers.people.names[i];
      return { name: p?.[i18n.lang()] ?? '?', f: Boolean(p?.f) };
    },
    speciesName: (id) => speciesById(id)?.name[i18n.lang()] ?? id,
    rarity: (id) => speciesById(id)?.rarity ?? 'common',
    portrait: (id, r) => portraits.creature(id, r),
    rarityColor: (r) => rarityColor(styleData.rarity, r),
    avatarColor: (i) => customers.people.outfits[i % customers.people.outfits.length] ?? styleData.colors.uiAccent,
    mood: moodOf,
  });
  const sellerLook = {
    t: i18n.t,
    lang: () => i18n.lang(),
    speciesName: (id: string) => speciesById(id)?.name[i18n.lang()] ?? id,
    portrait: (id: string, r: Parameters<typeof portraits.creature>[1]) => portraits.creature(id, r),
    rarityColor: (r: Parameters<typeof portraits.creature>[1]) => rarityColor(styleData.rarity, r),
    character: (id: string) => customers.characters.find((c) => c.id === id),
    hobby: (id: string) => customers.hobbies.find((h) => h.id === id),
    bargainFloor: market.bargainFloor,
    mood: moodOf,
    person: (i: number) => {
      const p = customers.people.names[i];
      return { name: p?.[i18n.lang()] ?? '?', f: Boolean(p?.f) };
    },
  };
  const marketTab = createMarketTab(sheets.get('market')!, play, {
    t: i18n.t,
    lang: i18n.lang,
    speciesName: sellerLook.speciesName,
    portrait: sellerLook.portrait,
    rarityColor: sellerLook.rarityColor,
    range: market.price,
    openLot: (body, lot, back) => renderLot(body, lot, play, sellerLook, back),
  });
  window.setInterval(() => {
    if (nav.active() === 'market') marketTab.render();
  }, 1000);
  /** The player's local date (platform time) for the 7 days of gifts. */
  const today = (): string => {
    const d = new Date(platform.now());
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const rewardText = (r: { coins?: number | undefined; crystals?: number | undefined; egg?: string | undefined }): string => {
    const fmt = new Intl.NumberFormat(i18n.lang());
    if (r.egg) return eggs.eggs.find((e) => e.id === r.egg)?.name[i18n.lang()] ?? r.egg;
    if (r.crystals) return i18n.t('gifts.crystals', { n: fmt.format(r.crystals) });
    return i18n.t('gifts.coins', { n: fmt.format(r.coins ?? 0) });
  };
  const giftsWindow = createGiftsWindow(uiRoot, play, {
    t: i18n.t,
    lang: i18n.lang,
    gifts,
    links,
    today,
    rewardText,
    rewardShort: (r) => (r.egg ? i18n.t(`egg.short.${r.egg}`) : new Intl.NumberFormat(i18n.lang()).format(r.coins ?? r.crystals ?? 0)),
    eggPicture: (id) => portraits.egg(id),
    review: () => platform.requestReview(),
  });
  hud.side.insertAdjacentHTML(
    'beforeend',
    '<button type="button" class="hud-btn" data-action="gifts" data-i18n="gifts.title" data-i18n-attr="aria-label"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 11h16v9H4z"/><path d="M3 7h18v4H3z"/><path d="M12 7v13"/><path d="M12 7c-2-4-6-3-5 0M12 7c2-4 6-3 5 0"/></svg><span class="nav-badge nav-dot" data-gifts-dot hidden></span></button>',
  );
  (hud.side.querySelector('[data-action="gifts"]') as HTMLElement).addEventListener('click', () => giftsWindow.open());
  const workWindow = createWorkWindow(uiRoot, play, { t: i18n.t, lang: i18n.lang });
  // M4-06: the move to a new city — asked in a popup (the Next card when ready, the city line of the seller level panel).
  const rebirthWindow = createRebirthWindow(uiRoot, play, { t: i18n.t, lang: i18n.lang });
  // UB-08: the seller level in the top bar; a tap shows what the next levels open.
  const reputationChip = createReputation(hud.balance, uiRoot, play, {
    t: i18n.t,
    lang: () => i18n.lang(),
    data: reputation,
    openers: () => {
      const lang = i18n.lang();
      return [
        ...eggs.eggs.filter((e) => !e.special && (e.section === 'ladder' || e.section === 'seasonal')).map((e) => ({ name: e.name[lang], unlock: e.unlock })),
        ...customers.districts.map((d) => ({ name: i18n.t('next.district', { name: d.name[lang] }), unlock: d.unlock })),
        ...upgrades.shop.map((id) => upgrades.upgrades.find((u) => u.id === id)).filter((u) => u !== undefined).map((u) => ({ name: u.name[lang], unlock: u.unlock })),
      ];
    },
    openCity: () => rebirthWindow.open(),
  });
  hud.side.insertAdjacentHTML(
    'beforeend',
    '<button type="button" class="hud-btn" data-action="work" data-i18n="work.title" data-i18n-attr="aria-label"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 11h18a9 6 0 0 1-18 0z"/><path d="M8 8c0-2 2-2 2-4M13 8c0-2 2-2 2-4"/></svg></button>',
  );
  (hud.side.querySelector('[data-action="work"]') as HTMLElement).addEventListener('click', () => workWindow.open());
  // M4-04: «Leaders» in the top bar (docs/01 §6): the platform board of coins earned; the score goes on open and every 2 minutes.
  const leadersWindow = createLeadersWindow(uiRoot, platform.leaders, { t: i18n.t, lang: i18n.lang, score: () => store.state.stats.coinsEarned });
  hud.side.insertAdjacentHTML(
    'beforeend',
    '<button type="button" class="hud-btn" data-action="leaders" data-i18n="leaders.title" data-i18n-attr="aria-label"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4a3 3 0 0 0 3 4"/><path d="M17 6h3a3 3 0 0 1-3 4"/><path d="M12 14v4M8 20h8"/></svg></button>',
  );
  (hud.side.querySelector('[data-action="leaders"]') as HTMLElement).addEventListener('click', () => leadersWindow.open());
  window.setInterval(() => leadersWindow.sync(), 120_000);
  /** Q-026 B: which tabs are open now; an opened one stays open (flag open_<id>), a fresh one pulses. */
  let tabsKnown = false;
  function openTabs(): void {
    const st = store.state;
    const facts = { hatched: st.stats.hatched, chats: play.chats().length, level: play.reputation().level, upgrade: play.upgradeList().some((u) => u.affordable) };
    for (const id of TABS) {
      const u = navData.tabs[id];
      const flag = `open_${id}`;
      if (u.type !== 'hidden' && !st.flags[flag] && tabUnlocked(u, facts)) st.flags[flag] = true;
      const open = u.type === 'always' || Boolean(st.flags[flag] && u.type !== 'hidden');
      nav.setOpen(id, open, tabsKnown);
    }
    tabsKnown = true;
    stageButton.hidden = !store.state.flags.open_shop;
  }
  function renderTabs(): void {
    openTabs();
    (hud.side.querySelector('[data-gifts-dot]') as HTMLElement).hidden = !giftsWindow.hasNew();
    workWindow.render();
    const tab = nav.active();
    if (tab === 'market') marketTab.render();
    if (tab === 'chats') chatsTab.render();
    if (tab === 'inventory') inventoryTab.render();
    if (tab === 'eggs') eggsTab.render();
    if (tab === 'sales') salesTab.render();
    if (tab === 'shop') shopTab.render();
    sheets.get('season')?.setTitle(i18n.t('nav.season'));
    nav.badge('chats', play.chats().filter((c) => c.unread).length);
    const upgradeReady = play.upgradeList().some((u) => u.affordable || u.fresh);
    nav.badge('shop', upgradeReady);
    (stageButton.querySelector('[data-upgrades-dot]') as HTMLElement).hidden = !upgradeReady;
    const shopEggs = play.eggShop();
    nav.badge('eggs', shopEggs.eggs.some((e) => e.fresh || (e.freeIn === 0 && e.open)));
  }
  // The home screen (UB-01): the «Next» card on top of the eggs; the news line takes the title row when it speaks; the community buttons at the end.
  const homeSheet = sheets.get('eggs')!;
  const nextCard = createNextCard(
    homeSheet.head,
    play,
    {
      t: i18n.t,
      lang: i18n.lang,
      name: (g) => {
        const lang = i18n.lang();
        if (g.kind === 'upgrade') return upgrades.upgrades.find((u) => u.id === g.id)?.name[lang] ?? g.id;
        if (g.kind === 'egg') return eggs.eggs.find((e) => e.id === g.id)?.name[lang] ?? g.id;
        if (g.kind === 'district') return i18n.t('next.district', { name: customers.districts.find((d) => d.id === g.id)?.name[lang] ?? g.id });
        if (g.kind === 'level') return i18n.t('next.level', { n: g.id });
        return i18n.t(play.rebirthView().ready ? 'next.rebirthReady' : 'next.rebirth');
      },
    },
    () => {
      // UB-06: «Next» leads to the action — an egg goal opens its card, a seller level the sales (deals raise it), the rest the upgrades.
      const goal = play.nextGoal();
      if (goal.kind === 'rebirth') rebirthWindow.open();
      else if (goal.kind === 'egg') {
        selectTab('eggs');
        eggsTab.show(goal.id);
      } else if (goal.kind === 'level' || goal.kind === 'district') selectTab('sales');
      else {
        openUpgrades();
        // M4-05: a step of the pickup point opens its section.
        if (upgrades.upgrades.find((u) => u.id === goal.id)?.group === 'point') shopTab.section('point');
      }
    },
  );
  /** Game second of the player's last touch (idle news) and the events of the last minute (event news). */
  let lastTouch = 0;
  const recentEvents: Array<{ id: string; at: number }> = [];
  document.addEventListener('pointerdown', () => (lastTouch = runtime.elapsed()), { capture: true });
  const homeFoot = document.createElement('div');
  homeFoot.className = 'home-foot';
  homeSheet.body.appendChild(homeFoot);
  renderCommunity(homeFoot, links, 'side', true);
  const newsTicker = createNewsTicker(
    homeSheet.root.querySelector('.sheet-top') as HTMLElement,
    news,
    () => {
      const st = store.state;
      const now = runtime.elapsed();
      while (recentEvents.length && now - (recentEvents[0]?.at ?? 0) > 60) recentEvents.shift();
      return {
        deals: st.stats.deals,
        coins: st.coins,
        species: [...new Set(st.creatures.map((c) => c.species))],
        upgrades: Object.keys(st.upgrades).filter((id) => (st.upgrades[id] ?? 0) > 0),
        districts: play.districts(),
        hour: new Date().getHours(),
        idleSec: now - lastTouch,
        events: recentEvents.map((e) => e.id),
      };
    },
    () => i18n.lang(),
  );
  // M4-23: the mood of the market follows the device's day; the ticker announces it once a day.
  let moodDay = '';
  const syncDay = (): void => {
    const day = today();
    play.setDay(day);
    if (day === moodDay) return;
    moodDay = day;
    newsTicker.announce(() => {
      const m = play.mood();
      if (!m) return '';
      const name = (id: string) => speciesById(id)?.name[i18n.lang()] ?? id;
      const fmt = new Intl.NumberFormat(i18n.lang(), { maximumFractionDigits: 2 });
      return i18n.t('news.mood', { hot: name(m.hot), cold: name(m.cold), x: fmt.format(m.hotMult), y: fmt.format(m.coldMult) });
    });
  };
  syncDay();
  window.setInterval(syncDay, 60_000);
  const toasts = createToasts(uiRoot);
  const merchantWindow = createMerchantWindow(uiRoot, play, {
    t: i18n.t,
    lang: i18n.lang,
    eggName: (id) => eggs.eggs.find((e) => e.id === id)?.name[i18n.lang()] ?? id,
    eggColor: (id) => styleData.eggs[id]?.shell ?? styleData.colors.egg,
  });
  const renderUi = (): void => {
    renderTabs();
    nextCard.render();
    rebirthWindow.render();
    merchantWindow.render();
    reputationChip.render();
  };
  showTab('eggs');
  renderUi();
  store.onCommit(renderUi);
  const awayWindow = createAwayWindow(uiRoot, { t: i18n.t, lang: i18n.lang });
  catchUp = (awaySec) => {
    if (!(awaySec >= AWAY_MIN_SEC)) return;
    const report = play.offline(awaySec);
    hud.update(store.state.coins, { snap: true });
    if (awayWindow.show(report)) track('offline_claim', { hours: Math.round(report.awaySec / 360) / 10, x2: 0 });
  };
  catchUp((platform.now() - lastSeen) / 1000);
  const sfx = createSfx(audio, () => store.state.settings.sound && platform.audioAllowed());
  document.addEventListener('pointerdown', () => sfx.unlock(), { capture: true });
  runtime.pause.onChange((paused) => sfx.setSuspended(paused));
  const chatter = createChatter({ lines, lang: () => i18n.lang(), speak: (who, text) => shop.speak(who, text), view: () => play.view() });
  play.events.on((e) => {
    shop.onEvent(e);
    // M3-18: «Lv N!» flies in the scene — the toasts wait for it.
    if (e.type === 'fed' && e.levelUp) toasts.hold(1200);
    chatter.onEvent(e);
    if (e.type === 'change') renderUi();
    else if (e.type === 'denied') {
      toasts.show(i18n.t(`deny.${e.reason}`), 'warn');
      sfx.play('fail');
    } else if (e.type === 'eggTap') sfx.play('eggTap');
    else if (e.type === 'fed' && (e.by === 'tap' || e.levelUp)) sfx.play(e.levelUp ? 'levelUp' : 'tap');
    else if (e.type === 'sold') {
      sfx.play('coin');
      const p = shop.customerPoint(e.customerId) ?? shop.anchors()?.queue[0];
      const rect = canvas.getBoundingClientRect();
      if (p) {
        const delay = flight.fly({ x: rect.left + p.x, y: rect.top + p.y }, hud.coinIcon, feel.coinsPerSale, feel.coinFlySec, () => hud.pulse());
        hud.update(store.state.coins, { delaySec: Math.max(0, delay - feel.hudRollSec * 0.5) });
      }
    }
    else if (e.type === 'chatReply' && (e.ctx === 'accept' || e.ctx === 'last')) sfx.play(e.ctx === 'accept' ? 'buy' : 'fail');
    else if (e.type === 'ftueDone') toasts.show(i18n.t('ftue.rich'), 'good', 3200);
    else if (e.type === 'rescueEgg') {
      toasts.show(i18n.t('toast.rescueEgg'), 'good', 2400);
      sfx.play('buy');
    }
    else if (e.type === 'firstCrystal') toasts.show(i18n.t('toast.crystal'), 'rare', 2800);
    else if (e.type === 'rebirth') {
      toasts.show(i18n.t('toast.rebirth', { n: e.city, x: new Intl.NumberFormat(i18n.lang(), { maximumFractionDigits: 2 }).format(play.rebirthView().mult) }), 'rare', 3200);
      sfx.play('levelUp');
      selectTab('eggs');
    }
    else if (e.type === 'guestUnpaid') toasts.show(i18n.t('toast.guestUnpaid'), 'warn', 2600);
    else if (e.type === 'guestBought') {
      toasts.show(i18n.t('toast.guestBought', { name: decorData.items.find((x) => x.id === e.id)?.name[i18n.lang()] ?? e.id }), 'good', 2000);
      sfx.play('buy');
    }
    else if (e.type === 'rowDone') {
      toasts.show(i18n.t('toast.rowDone', { row: i18n.t(`collection.row.${e.rarity}`), p: Math.round(e.bonus * 100), c: e.crystals }), 'rare', 3200);
      sfx.play('rare');
    }
    else if (e.type === 'upgradeUnlocked') {
      const name = upgrades.upgrades.find((u) => u.id === e.id)?.name[i18n.lang()] ?? e.id;
      toasts.show(i18n.t('toast.upgradeUnlocked', { name }), 'good', 2400);
    }
    else if (e.type === 'cuckoo') sfx.play('levelUp');
    else if (e.type === 'repUp') {
      // UB-08: the seller level grows — the chip flashes, a toast says what opened.
      const opened = reputationChip.up(e.level);
      toasts.show(opened.length ? i18n.t('rep.upOpened', { n: e.level, what: opened.slice(0, 3).join(', ') }) : i18n.t('rep.up', { n: e.level }), 'rare', 3200);
      sfx.play('levelUp');
    }
    else if (e.type === 'eventStarted') {
      recentEvents.push({ id: e.id, at: runtime.elapsed() });
      toasts.show(i18n.t(`event.${e.kind}`), 'rare', 2600);
      sfx.play('rare');
    }
    else if (e.type === 'eventEnded' && e.kind === 'merchant') merchantWindow.close();
    else if (e.type === 'merchantOpen') merchantWindow.open();
    else if (e.type === 'eventCoin') sfx.play('coin');
    else if (e.type === 'thingTapped') sfx.play('tap');
    else if (e.type === 'orderNew') toasts.show(i18n.t('order.new', { name: speciesById(e.species)?.name[i18n.lang()] ?? e.species, n: e.level, reward: e.reward }), 'good', 3000);
    else if (e.type === 'orderDone') {
      toasts.show(i18n.t('order.done', { n: e.reward }), 'rare', 2600);
      sfx.play('rare');
    }
    else if (e.type === 'secret') {
      toasts.show(i18n.t(`secret.${e.id}.${e.show}`), 'rare', 2400);
      sfx.play('rare');
    }
    else if (e.type === 'eventGift') {
      toasts.show(i18n.t('toast.gift', { n: e.coins }), 'good', 2200);
      sfx.play('coin');
    }
    else if (e.type === 'districtOpened') {
      const d = customers.districts.find((x) => x.id === e.district);
      if (d) toasts.show(i18n.t('toast.district', { name: d.name[i18n.lang()], who: d.customer.name[i18n.lang()] }), 'rare', 3000);
      sfx.play('rare');
    }
    else if (e.type === 'eggUnlocked') {
      const name = eggs.eggs.find((x) => x.id === e.egg)?.name[i18n.lang()] ?? e.egg;
      toasts.show(i18n.t('toast.eggUnlocked', { name }), 'rare', 2600);
      sfx.play('rare');
    }
    else if (e.type === 'upgradeBought') {
      // M3-17, M3-18: the shop itself says «Upgrade: level N» (the scene); no second text in a toast.
      sfx.play('levelUp');
    }
    else if (e.type === 'eggBought') sfx.play('buy');
    else if (e.type === 'eggsStored') toasts.show(i18n.t('eggs.stored', { n: e.count }), 'good', 1800);
    else if (e.type === 'freeEgg') {
      toasts.show(i18n.t('eggs.freeTaken'), 'good', 2000);
      sfx.play('buy');
    } else if (e.type === 'eggFed') sfx.play('buy');
    else if (e.type === 'hatched') {
      // UB-03: a tapped egg says nothing about its rarity until the case show reveals it.
      if (e.by !== 'tap') sfx.play(e.rarity === 'common' ? 'hatch' : 'rare');
      else sfx.play('eggTap');
      // The player opened it: the hatch show (M3-05); by itself (helpers, time away) — a toast for the rare ones.
      if (e.by === 'tap') hatchShow.play(e);
      else if (e.rarity !== 'common') toasts.show(`${i18n.t(`rarity.${e.rarity}`)}: ${speciesById(e.species)?.name[i18n.lang()] ?? e.species}`, 'rare', 2200);
    } else if (e.type === 'chatNew') sfx.play('tap');
    else if (e.type === 'lotBought') sfx.play('buy');
    else if (e.type === 'work') sfx.play('coin');
    else if (e.type === 'workUp') sfx.play('levelUp');
    else if (e.type === 'gift') {
      toasts.show(i18n.t('gifts.toast', { what: rewardText(e.reward) }), 'good', 2400);
      sfx.play('rare');
    }

  });
  const pauseWindow = createPauseWindow(uiRoot, runtime.pause, links, () => settingsWindow.open());
  const settingsWindow = createSettingsWindow(uiRoot, store, i18n, links, () => pauseWindow.overlay.root.classList.remove('under'), (code) => play.redeemCode(code));
  hud.pauseButton.addEventListener('click', () => pauseWindow.open());
  document.addEventListener('keydown', (e) => {
    if (e.code !== 'Escape' || !controllable) return;
    // The window on top closes its own way (settings back to the pause); with none open Escape pauses.
    if (settingsWindow.overlay.isOpen()) settingsWindow.close();
    else if (!dismissTop()) pauseWindow.toggle();
  });
  /** Hint targets inside the shop scene (the rest point at buttons and panels). */
  const SCENE_TARGETS = new Set(['incubator', 'slot', 'queue']);
  let sceneHintOn = false;
  const hints = createHints(uiRoot, {
    t: i18n.t,
    anchors: () => shop.anchors(),
    canvas,
    panel: uiRoot,
    topInset: () => hud.root.getBoundingClientRect().bottom,
    window: () => topWindow()?.card ?? null,
  });
  // UB-07: the milestone label is a dev trace — only with ?debug=1 (the producer link keeps it there).
  if (new URLSearchParams(location.search).has('debug')) renderBuildLabel(uiRoot, __BUILD_LABEL__);
  i18n.apply(uiRoot);
  i18n.onChange((next) => {
    document.documentElement.lang = next;
    hud.setLanguage(next);
    hud.update(store.state.coins, { snap: true });
    i18n.apply(uiRoot);
    shop.relabel();
    newsTicker.refresh();
    store.state.settings.lang = next;
    store.commit({ flush: true });
  });
  document.addEventListener('contextmenu', (e) => e.preventDefault());
  watchLayout(appRoot, (layout) => {
    canvas.style.width = `${layout.width}px`;
    canvas.style.height = `${layout.height}px`;
    scene.resize(layout.width, layout.height);
    shop.layout(layout.stage, layout.hudHeight);
  });

  if (__DEBUG_TOOLS__ && new URLSearchParams(location.search).has('debug')) {
    const { installDebugPanel } = await import('./debug/panel.ts');
    installDebugPanel({ store, runtime, feel, fps: () => scene.app.ticker.FPS, fresh: () => newSave(platform.now()) });
  }
  if (__TEST_API__) {
    const { installTestApi } = await import('./test-api/index.ts');
    installTestApi({ runtime, platform, i18n, fps: () => scene.app.ticker.FPS, isControllable: () => controllable, snapshot: () => ({
        coins: store.state.coins,
        creatures: store.state.creatures,
        incubators: store.state.incubators,
        stats: store.state.stats,
        upgrades: store.state.upgrades,
        queue: play.view().queue.length,
        chats: play.chats().filter((c) => c.state === 'open').map((c) => ({ id: c.id, uid: c.uid, offer: c.offer })),
        hint: hints.text(),
        ftue: ftueHint(store.state, play.view())?.step ?? null,
        rarities: store.state.creatures.map((c) => speciesById(c.species)?.rarity ?? ''),
        event: play.view().event?.kind ?? null,
        tab: nav.active(),
        shelf: play.view().creatures.map((c) => c.uid),
        windows: [...uiRoot.querySelectorAll<HTMLElement>('.overlay:not([hidden]):not(.under)')].map((el) => el.dataset.overlay ?? ''),
        upgradeFx: shop.lastUpgradeText(),
        city: play.rebirthView().city,
        captions: [...shop.captions(), ...(sceneHintOn ? [hints.text()] : []), ...(toasts.showing() ? [toasts.showing()] : [])],
        hatchTiming: hatchShow.timing(),
        newest: (() => {
          // The newest creature wherever it is (UB-05: a tapped egg's creature waits in the inventory).
          const v = play.view();
          const uid = store.state.creatures.at(-1)?.uid;
          const c = [...v.creatures, ...v.inventory, ...v.talking].find((x) => x.uid === uid);
          return c ? { uid: c.uid, species: c.species, low: c.low, high: c.high, name: speciesById(c.species)?.name[i18n.lang()] ?? c.species } : null;
        })(),
      }),
      anchors: () => shop.anchors(),
      grant: (coins) => {
        store.state.coins += coins;
        store.commit();
      },
      toast: (text) => toasts.show(text, 'info'),
    });
  }

  scene.app.ticker.add((ticker) => {
    runtime.frame(ticker.deltaMS / 1000);
    const view = play.view();
    shop.signGestures(Boolean(store.state.flags.ftue_done));
    shop.frame(runtime.pause.isPaused() ? 0 : (ticker.deltaMS / 1000) * runtime.timeScale, view);
    // UB-01, UB-02: a hint at the shop shows on the home screen only, and never over a window.
    const hint = controllable ? ftueHint(store.state, view) : null;
    const sceneHint = hint !== null && hint.target.kind !== 'button' && hint.target.kind !== 'el';
    const tabIntro = controllable && intro && intro.tab === nav.active() ? tabHint(intro.tab) : null;
    // M4-00: one caption over the shop at a time — a toast (the answer to a tap) > a hint at the shop > the shop's own signs and lines.
    const toastNow = toasts.showing();
    const wanted = tabIntro ?? (hint && !(sceneHint && nav.active() !== 'eggs') ? hint : null);
    const shownHint = wanted && toastNow && SCENE_TARGETS.has(wanted.target.kind) ? null : wanted;
    hints.update(shownHint);
    sceneHintOn = Boolean(shownHint && SCENE_TARGETS.has(shownHint.target.kind) && hints.text());
    shop.quiet(sceneHintOn || Boolean(toastNow));
    newsTicker.tick(runtime.pause.isPaused() ? 0 : ticker.deltaMS / 1000, controllable && Boolean(store.state.flags.ftue_done));
    if (!runtime.pause.isPaused() && store.state.flags.ftue_done) chatter.tick(ticker.deltaMS / 1000);
    funnel.tick(runtime.elapsed());
  });
  scene.app.ticker.addOnce(() => {
    platform.firstFrame();
    document.getElementById('preloader')?.classList.add('hidden');
    controllable = true;
    platform.ready();
    if (!runtime.pause.isPaused()) platform.gameplayStart();
    track('gameReady');
  });
}

void boot();
