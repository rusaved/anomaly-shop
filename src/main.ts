// What: entry point; boots the shop in the order platform → language → data → save → scene → ready (docs/02, section 3).
// Called by: index.html (<script type="module">).
// Keep: the boot order and the single ready() call; layers do their own work, this file only wires them.

// MU-01: Rubik 400–800 (docs/07 «Токены»: text 400–500, buttons 600, titles 700–800).
import '@fontsource/rubik/cyrillic-400.css';
import '@fontsource/rubik/latin-400.css';
import '@fontsource/rubik/cyrillic-500.css';
import '@fontsource/rubik/latin-500.css';
import '@fontsource/rubik/cyrillic-600.css';
import '@fontsource/rubik/latin-600.css';
import '@fontsource/rubik/cyrillic-700.css';
import '@fontsource/rubik/latin-700.css';
import '@fontsource/rubik/cyrillic-800.css';
import '@fontsource/rubik/latin-800.css';
import './ui/styles.css';
import './ui/mu.css';
import style from '@content/style.json';
import { applyTheme } from './ui/theme.ts';
import { createHud } from './ui/hud.ts';
import { roomHeight, sceneTop, watchLayout } from './ui/layout.ts';
import { createI18n } from './ui/i18n.ts';
import { createPauseWindow } from './ui/pause.ts';
import { createSettingsWindow } from './ui/settings.ts';
import { communityLinks } from './ui/community.ts';
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
import { ftueHint, shelfHint, tabHint, tabUnlocked } from './sim/ftue.ts';
import { createToasts } from './ui/toast.ts';
import { createNav, TABS, type TabId } from './ui/nav.ts';
import { dismissAll, dismissTop, topWindow } from './ui/overlay.ts';
import { createSheet, type Sheet } from './ui/sheet.ts';
import { createInventoryTab } from './ui/inventory.ts';
import { createEggsTab, type EggsLookups } from './ui/eggs.ts';
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
import { achievements, audio, calendar, codes, collection, decor as decorData, reputation, customers, dictionaries, eggs, events as randomEvents, feel, ftue, gifts, lines, market, nav as navData, news, work, secrets, species, speciesById, style as styleData, upgrades } from './content/index.ts';
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
  // MU-01: one rarity scale everywhere (docs/07 «Редкость»): frames, badges and rings read --r-<rarity>.
  applyTheme(style.rarity, document.documentElement, 'r');
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
  const play = createGame(store, { eggs, species, customers, upgrades, ftue, events: randomEvents, secrets, market, gifts, work, codes, reputation, collection, decor: decorData, achievements, calendar }, createRng(platform.now()));
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
  for (const id of TABS) sheets.set(id, createSheet(uiRoot, id, id === 'home'));
  let shown: TabId = 'home';
  const showTab = (tab: TabId, again = false): void => {
    // UB-02: a tab works from any window — whatever is open closes its own way first.
    dismissAll();
    // MU-02 (07 rule 12): a second tap on the active tab brings back its main screen (an inner page closes).
    if (again) {
      sheets.get(tab)?.back();
      if (tab === 'chats') chatsTab.show(null);
      if (tab === 'eggs') eggsTab.show(null);
    }
    for (const [id, sh] of sheets) {
      if (id === tab) sh.show();
      else sh.hide();
    }
    if (shown === 'shop' && tab !== 'shop') {
      play.seenShop();
      shopTab.leave();
    }
    shown = tab;
    // MU-02 (07 rule 11): a tab is a screen; the scene shows on «Лавка» only.
    uiRoot.dataset.screen = tab;
    homeUi.hidden = tab !== 'home';
    // UB-10: the Chats tab opens on its list (new buyers on top), never on an old closed chat.
    if (tab === 'chats' && !again) chatsTab.show(null);
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
  // MU-03 (s1-shop-scene): «Лавка» — the «Витрина» row under the room (title, «N из M мест», «+» on free places),
  // «Улучшения» and «Подработка» at the bottom of the scene.
  const homeUi = document.createElement('div');
  homeUi.className = 'home-ui';
  homeUi.innerHTML =
    '<div class="shelf-head" data-shelf-head><h3 data-i18n="shop.showcase.title"></h3><span data-shelf-count></span></div>' +
    '<div class="shelf-plus" data-shelf-plus></div>' +
    '<div class="stage-actions">' +
    '<button type="button" class="mu-btn stage-btn" data-action="open-upgrades"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4l6 6-3 3-6-6z"/><path d="M11 7L4 14l3 3 7-7"/><path d="M6 19l-2 1 1-2"/></svg><span data-i18n="upgrades.open"></span><span class="nav-badge nav-dot" data-upgrades-dot hidden></span></button>' +
    '<button type="button" class="mu-btn stage-btn" data-action="work"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 11h18a9 6 0 0 1-18 0z"/><path d="M8 8c0-2 2-2 2-4M13 8c0-2 2-2 2-4"/></svg><span data-i18n="work.title"></span></button>' +
    '</div>';
  uiRoot.appendChild(homeUi);
  const stageButton = homeUi.querySelector('[data-action="open-upgrades"]') as HTMLElement;
  const openUpgrades = (): void => {
    selectTab('shop');
    shopTab.section('upgrades');
  };
  stageButton.addEventListener('click', openUpgrades);
  const nav = createNav(uiRoot, showTab);
  // 07 rule 8: the «+» of the balance opens the Store (its deals from the ads milestone; the upgrades till then).
  hud.wallet.addEventListener('click', openUpgrades);
  const shopTab = createShopTab(sheets.get('shop')!, play, {
    t: i18n.t,
    lang: i18n.lang,
    upgrade: (id) => upgrades.upgrades.find((u) => u.id === id),
    tierColors: Object.values(styleData.rarity),
    sections: navData.shop.sections,
    guestName: (id) => decorData.items.find((x) => x.id === id)?.name[i18n.lang()] ?? id,
    themeName: (theme) => decorData.sets.find((x) => x.theme === theme)?.name[i18n.lang()] ?? theme,
    pointLevel: (() => {
      const u = upgrades.upgrades.find((x) => x.id === 'point_rent')?.unlock;
      return u?.type === 'level' ? u.n : 1;
    })(),
    icon: (thing) => portraits.thing(thing),
  });
  shopTab.section('upgrades');
  const inventoryTab = createInventoryTab(sheets.get('inventory')!, play, {
    t: i18n.t,
    lang: i18n.lang,
    speciesName: (id) => speciesById(id)?.name[i18n.lang()] ?? id,
    portrait: (id, r) => portraits.creature(id, r),
    rarityColor: (r) => rarityColor(styleData.rarity, r),
    pick: (uid) => play.tapCreature(uid),
    eggPicture: (id) => portraits.egg(id),
    openEggs: () => selectTab('eggs'),
    mood: moodOf,
    find: (id) => {
      const f = achievements.items.find((x) => x.id === id);
      const lang = i18n.lang();
      return { name: f?.name[lang] ?? id, desc: f?.desc[lang] ?? '', coins: f?.reward.coins ?? 0, crystals: f?.reward.crystals ?? 0 };
    },
    // MU-06: «На продажу» opens the pet's «Цена» page; «Выставить на продажу» there puts it on the shelf.
    list: (uid) => {
      selectTab('sales');
      salesTab.show(uid);
    },
  });
  const eggsLook: EggsLookups = {
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
  };
  const eggsTab = createEggsTab(sheets.get('eggs')!, play, eggsLook);
  // MU-02 (l1-home-landscape): sideways «Лавка» keeps the eggs in rows right of the room.
  const homeEggs = createEggsTab(sheets.get('home')!, play, eggsLook, 'egg-card-home');
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
    if (nav.active() === 'inventory') inventoryTab.render();
    if (nav.active() === 'home' && appRoot.classList.contains('landscape')) homeEggs.render();
  }, 1000);
  const salesTab = createSalesTab(sheets.get('sales')!, play, {
    t: i18n.t,
    lang: i18n.lang,
    speciesName: (id) => speciesById(id)?.name[i18n.lang()] ?? id,
    portrait: (id, r) => portraits.creature(id, r),
    rarityColor: (r) => rarityColor(styleData.rarity, r),
    slider: market.slider,
    zoneColors: styleData.priceZones,
    baseWaitSec: (market.replySec.min + market.replySec.max) / 2,
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
    wide: () => appRoot.classList.contains('landscape'),
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
    rewardShort: (r) => (r.egg ? i18n.t(`egg.short.${r.egg}`) : `${r.crystals ? '◆' : '◉'} ${new Intl.NumberFormat(i18n.lang()).format(r.coins ?? r.crystals ?? 0)}`),
    eggPicture: (id) => portraits.egg(id),
    thing: (name) => portraits.thing(name),
    speciesName: (id) => speciesById(id)?.name[i18n.lang()] ?? id,
    portrait: (sp, r) => portraits.creature(sp, r),
    goalName: (id) => calendar.tasks.pool.find((g) => g.id === id)?.name[i18n.lang()] ?? id,
    review: () => platform.requestReview(),
  });
  hud.side.insertAdjacentHTML(
    'beforeend',
    '<button type="button" class="hud-btn" data-action="gifts" data-i18n="gifts.title" data-i18n-attr="aria-label"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 11h16v9H4z"/><path d="M3 7h18v4H3z"/><path d="M12 7v13"/><path d="M12 7c-2-4-6-3-5 0M12 7c2-4 6-3 5 0"/></svg><span class="nav-badge nav-dot" data-gifts-dot hidden></span></button>',
  );
  (hud.side.querySelector('[data-action="gifts"]') as HTMLElement).addEventListener('click', () => giftsWindow.open());
  const workWindow = createWorkWindow(uiRoot, play, { t: i18n.t, lang: i18n.lang, bowl: () => portraits.thing('bowl', 192) });
  // M4-06: the move to a new city — asked in a popup (the Next card when ready, the city line of the seller level panel).
  const rebirthWindow = createRebirthWindow(uiRoot, play, { t: i18n.t, lang: i18n.lang, eggName: (id) => eggs.eggs.find((g) => g.id === id)?.name[i18n.lang()] ?? id });
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
  (homeUi.querySelector('[data-action="work"]') as HTMLElement).addEventListener('click', () => workWindow.open());
  // M4-04: «Leaders» in the top bar (docs/01 §6): the platform board of coins earned; the score goes on open and every 2 minutes.
  const leadersWindow = createLeadersWindow(uiRoot, platform.leaders, { t: i18n.t, lang: i18n.lang, score: () => store.state.stats.coinsEarned });
  hud.side.insertAdjacentHTML(
    'beforeend',
    '<button type="button" class="hud-btn" data-action="leaders" data-i18n="leaders.title" data-i18n-attr="aria-label"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4a3 3 0 0 0 3 4"/><path d="M17 6h3a3 3 0 0 1-3 4"/><path d="M12 14v4M8 20h8"/></svg></button>',
  );
  (hud.side.querySelector('[data-action="leaders"]') as HTMLElement).addEventListener('click', () => leadersWindow.open());
  // MU-02: «Сезон» is a mark of the top bar after the release (content/nav.json tabs.season; hidden until then).
  hud.side.insertAdjacentHTML(
    'beforeend',
    '<button type="button" class="hud-btn" data-action="season" data-i18n="nav.season" data-i18n-attr="aria-label" hidden><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z"/></svg></button>',
  );
  const seasonButton = hud.side.querySelector('[data-action="season"]') as HTMLElement;
  seasonButton.hidden = navData.tabs.season.type === 'hidden';
  seasonButton.addEventListener('click', () => toasts.show(i18n.t('season.later'), 'info', 2600));
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
  /** MU-03: the «Витрина» row — «N из M мест» and a «+» on every free place (it opens «Мои продажи» on the pick). */
  let shelfKey = '';
  function renderShelf(): void {
    const v = play.view();
    const anchors = shop.anchors();
    const portrait = appRoot.classList.contains('portrait');
    const slots = portrait && anchors ? anchors.slots : [];
    const key = `${i18n.lang()}:${v.creatures.length}:${v.slots}:${slots.map((r) => `${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.w)}`).join(';')}`;
    if (key === shelfKey) return;
    shelfKey = key;
    (homeUi.querySelector('[data-shelf-count]') as HTMLElement).textContent = i18n.t('shop.showcase.places', { n: v.creatures.length, all: v.slots });
    const plus = homeUi.querySelector('[data-shelf-plus]') as HTMLElement;
    plus.replaceChildren(
      ...slots.slice(v.creatures.length).map((r) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'shelf-free';
        b.dataset.action = 'shelf-add';
        b.setAttribute('aria-label', i18n.t('sales.add'));
        b.style.cssText = `left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px`;
        b.textContent = '+';
        b.addEventListener('click', () => {
          selectTab('sales');
          salesTab.show('#pick');
        });
        return b;
      }),
    );
  }
  function renderTabs(): void {
    openTabs();
    (hud.side.querySelector('[data-gifts-dot]') as HTMLElement).hidden = !giftsWindow.hasNew();
    workWindow.render();
    const tab = nav.active();
    if (tab === 'home') renderShelf();
    // MU-02: the eggs of sideways «Лавка» (l1) exist only there; the «Яйца» tab drops its cards when out of sight.
    if (tab === 'home' && appRoot.classList.contains('landscape')) homeEggs.render();
    else homeEggs.clear();
    if (tab === 'market') marketTab.render();
    if (tab === 'chats') chatsTab.render();
    if (tab === 'inventory') inventoryTab.render();
    if (tab === 'eggs') eggsTab.render();
    if (tab === 'sales') salesTab.render();
    if (tab === 'shop') shopTab.render();
    nav.badge('chats', play.chats().filter((c) => c.unread).length);
    // MU-12 (s1-shop-scene, the game design recheck): one green dot on the bar — the main step only:
    // a free or new egg, then a find with its reward waiting (M4-20), then an upgrade to buy.
    // (Every list is read each time, as before: the order of these reads is part of the frame.)
    const findWaits = play.finds().some((f) => f.got && !f.claimed);
    const upgradeWaits = play.upgradeList().some((u) => u.affordable || u.fresh);
    const eggReady = play.eggShop().eggs.some((e) => e.fresh || (e.freeIn === 0 && e.open));
    const findReady = !eggReady && findWaits;
    const upgradeReady = !eggReady && !findReady && upgradeWaits;
    nav.badge('eggs', eggReady);
    nav.badge('inventory', findReady);
    nav.badge('shop', upgradeReady);
    (stageButton.querySelector('[data-upgrades-dot]') as HTMLElement).hidden = !upgradeReady;
  }
  // MU-12 (the game design review, «Цели» 2): the nearest goal on «Лавка» — one dark card on the free floor
  // between the «Витрина» row and the scene buttons (Q-035 B); a tap leads to the action.
  const nextBox = document.createElement('div');
  nextBox.className = 'home-next';
  homeUi.insertBefore(nextBox, homeUi.querySelector('.stage-actions'));
  const nextCard = createNextCard(
    nextBox,
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
  // MU-03: the news line has no place on the screens of 07 (s1-shop-scene) — it stays in the code, unmounted (docs/допущения.md).
  const newsTicker = createNewsTicker(
    document.createElement('div'),
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
  showTab('home');
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
  const foundNow: string[] = [];
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
      const x = new Intl.NumberFormat(i18n.lang(), { maximumFractionDigits: 2 }).format(play.rebirthView().mult);
      toasts.show(e.gift ? i18n.t('toast.rebirthGift', { n: e.city, x, egg: eggs.eggs.find((g) => g.id === e.gift)?.name[i18n.lang()] ?? '' }) : i18n.t('toast.rebirth', { n: e.city, x }), 'rare', 3600);
      sfx.play('levelUp');
      selectTab('home');
    }
    else if (e.type === 'find') {
      // Several finds at once (an old save, a lucky deal): one toast for all of them.
      foundNow.push(e.id);
      if (foundNow.length === 1)
        window.setTimeout(() => {
          const f = achievements.items.find((x) => x.id === foundNow[0]);
          toasts.show(foundNow.length > 1 ? i18n.t('toast.finds', { n: foundNow.length }) : i18n.t('toast.find', { name: f?.name[i18n.lang()] ?? '' }), 'rare', 2600);
          foundNow.length = 0;
          sfx.play('rare');
        }, 60);
    } else if (e.type === 'findClaimed') sfx.play('coin');
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
      // M4-21: the kettle whistles itself.
      if (e.kind === 'kettle' && e.uid) shop.speak({ uid: e.uid }, i18n.t('event.kettleLine'));
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
      toasts.show(e.crystals ? i18n.t('toast.giftCrystal', { n: e.crystals }) : i18n.t('toast.gift', { n: e.coins }), 'good', 2200);
      sfx.play('coin');
    }
    else if (e.type === 'twins') {
      toasts.show(i18n.t('toast.twins'), 'rare', 2600);
      sfx.play('rare');
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
    // MU-03: portrait — the room under the top bar and the «Витрина» strip under it; landscape — the room left of the eggs (l1).
    if (layout.shelf) shop.layout(layout.stage, sceneTop(layout), layout.shelf, layout.panel.y);
    else shop.layout(layout.stage, sceneTop(layout), null, roomHeight(layout));
    shelfKey = '';
    renderShelf();
    renderTabs();
  });

  if (__DEBUG_TOOLS__ && new URLSearchParams(location.search).has('debug')) {
    const { installDebugPanel } = await import('./debug/panel.ts');
    installDebugPanel({
      store,
      runtime,
      feel,
      fps: () => scene.app.ticker.FPS,
      fresh: () => newSave(platform.now()),
      cityReady: () => {
        const r = play.rebirthView();
        store.state.stats.coinsEarned += Math.max(0, r.need - r.have);
        store.commit({ flush: true });
      },
    });
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
      event: (id) => play.startEventNow(id),
      hatch: (uid, egg) => {
        const v = play.view();
        const cr = [...v.inventory, ...v.creatures].find((c) => c.uid === uid);
        if (!cr) return false;
        hatchShow.play({ uid, species: cr.species, rarity: cr.rarity, egg });
        return true;
      },
    });
  }

  // M4-09: the time of the player's last touch (the empty-shelf hint waits for a pause).
  let lastInputAt = performance.now();
  window.addEventListener('pointerdown', () => (lastInputAt = performance.now()), { capture: true, passive: true });
  scene.app.ticker.add((ticker) => {
    runtime.frame(ticker.deltaMS / 1000);
    const view = play.view();
    shop.signGestures(Boolean(store.state.flags.ftue_done));
    shop.frame(runtime.pause.isPaused() ? 0 : (ticker.deltaMS / 1000) * runtime.timeScale, view);
    // MU-12: the «+» places follow the scene's own layout (it relayouts on its frame when the shelf grows).
    if (nav.active() === 'home') renderShelf();
    // UB-01, UB-02: a hint at the shop shows on the home screen only, and never over a window.
    const hint = controllable ? (ftueHint(store.state, view) ?? shelfHint(store.state, view, (performance.now() - lastInputAt) / 1000, ftue.shelfHintSec)) : null;
    const sceneHint = hint !== null && hint.target.kind !== 'button' && hint.target.kind !== 'el';
    const tabIntro = controllable && intro && intro.tab === nav.active() ? tabHint(intro.tab) : null;
    // M4-00: one caption over the shop at a time — a toast (the answer to a tap) > a hint at the shop > the shop's own signs and lines.
    const toastNow = toasts.showing();
    const wanted = tabIntro ?? (hint && !(sceneHint && nav.active() !== 'home') ? hint : null);
    const shownHint = wanted && toastNow && SCENE_TARGETS.has(wanted.target.kind) ? null : wanted;
    hints.update(shownHint, Boolean(toastNow));
    sceneHintOn = Boolean(shownHint && (SCENE_TARGETS.has(shownHint.target.kind) || hints.outside()) && hints.text());
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
