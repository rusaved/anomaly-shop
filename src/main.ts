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
import { createPanel } from './ui/panel.ts';
import { watchLayout } from './ui/layout.ts';
import { createI18n } from './ui/i18n.ts';
import { createPauseWindow } from './ui/pause.ts';
import { createSettingsWindow } from './ui/settings.ts';
import { communityLinks, renderCommunity } from './ui/community.ts';
import { renderBuildLabel } from './ui/label.ts';
import { createActions } from './ui/actions.ts';
import { createDealCard } from './ui/deal.ts';
import { createCoinFlight } from './ui/coin-flight.ts';
import { createUpgradesWindow } from './ui/upgrades.ts';
import { createHints } from './ui/hints.ts';
import { createNextCard } from './ui/next.ts';
import { createNewsTicker } from './ui/news.ts';
import { createMerchantWindow } from './ui/merchant.ts';
import { createChatter } from './ui/chatter.ts';
import { AWAY_MIN_SEC, createAwayWindow } from './ui/away.ts';
import { bindFunnel } from './analytics/funnel.ts';
import { ftueHint } from './sim/ftue.ts';
import { createToasts } from './ui/toast.ts';
import { createNav, type TabId } from './ui/nav.ts';
import { createSheet, type Sheet } from './ui/sheet.ts';
import { createInventoryTab } from './ui/inventory.ts';
import { createEggsTab } from './ui/eggs.ts';
import { createSalesTab } from './ui/sales.ts';
import { createChatsTab } from './ui/chats.ts';
import { createMarketTab } from './ui/market.ts';
import { renderLot } from './ui/seller.ts';
import { createGiftsWindow } from './ui/gifts.ts';
import { RARITIES } from './content/schemas.ts';
import { createHatchShow } from './ui/hatch.ts';
import { eggOdds } from './sim/rules.ts';
import { createPortraits } from './scene/portraits.ts';
import { rarityColor } from './scene/art.ts';
import { audio, customers, dictionaries, eggs, events as randomEvents, feel, ftue, gifts, lines, market, news, secrets, species, speciesById, style as styleData, upgrades } from './content/index.ts';
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
  const play = createGame(store, { eggs, species, customers, upgrades, ftue, events: randomEvents, secrets, market, gifts }, createRng(platform.now()));
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
  const panel = createPanel(uiRoot, __GAME__.title[lang]);
  const links = platform.caps.community ? communityLinks() : null;
  renderCommunity(panel.side, links, 'side', true);
  const dealCard = createDealCard(panel.body, play, {
    t: i18n.t,
    lang: i18n.lang,
    customerName: (id, person) => {
      const lang = i18n.lang();
      const type = customers.districts.find((d) => d.customer.id === id)?.customer;
      const who = customers.people.names[person];
      if (!type) return i18n.t(`customer.${id}`);
      const typeName = (who?.f && type.nameF ? type.nameF : type.name)[lang];
      return who ? `${who[lang]} · ${typeName}` : typeName;
    },
    customerColor: (id) => styleData.customers[id]?.body ?? styleData.colors.queueSpot,
    speciesName: (id) => speciesById(id)?.name[i18n.lang()] ?? id,
  });
  const upgradesWindow = createUpgradesWindow(uiRoot, play, { t: i18n.t, lang: i18n.lang, upgrade: (id) => upgrades.upgrades.find((u) => u.id === id) });
  const actions = createActions(panel.body, play, lang, { t: i18n.t, eggColor: (id) => styleData.eggs[id]?.shell ?? styleData.colors.egg });
  // The genre-standard frame (docs/01 §6; M3-03): the tab bar, one sheet per tab over the panel; the shop stays in view.
  const portraits = createPortraits(scene.app, styleData);
  const sheets = new Map<TabId, Sheet>();
  const showTab = (tab: TabId | null): void => {
    if (tab === 'shop') {
      // Q-021 B: until M5 the Shop tab is the shop upgrades.
      nav.mark(null);
      upgradesWindow.open();
      tab = null;
    }
    for (const [id, s] of sheets) {
      if (id === tab) s.show();
      else s.hide();
    }
    renderTabs();
  };
  const closeTab = (): void => {
    nav.mark(null);
    showTab(null);
  };
  for (const id of ['market', 'inventory', 'sales', 'eggs', 'chats', 'season'] as const) sheets.set(id, createSheet(uiRoot, id, closeTab));
  const nav = createNav(uiRoot, showTab);
  hud.balance.addEventListener('click', () => showTab('shop'));
  for (const [id, key] of [['season', 'season.later']] as const) {
    const s = sheets.get(id)!;
    s.body.innerHTML = `<p class="empty" data-i18n="${key}"></p>`;
    s.setTitle(i18n.t(`nav.${id}`));
  }
  const inventoryTab = createInventoryTab(sheets.get('inventory')!, play, () => store.state, {
    t: i18n.t,
    lang: i18n.lang,
    speciesName: (id) => speciesById(id)?.name[i18n.lang()] ?? id,
    species: () => species.species.map((s) => ({ id: s.id, rarity: s.rarity })),
    portrait: (id, r) => portraits.creature(id, r),
    rarityColor: (r) => rarityColor(styleData.rarity, r),
    pick: (uid) => play.tapCreature(uid),
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
    eggPicture: (id) => portraits.egg(id),
    review: () => platform.requestReview(),
  });
  hud.side.insertAdjacentHTML(
    'beforeend',
    '<button type="button" class="hud-btn" data-action="gifts" data-i18n="gifts.title" data-i18n-attr="aria-label"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 11h16v9H4z"/><path d="M3 7h18v4H3z"/><path d="M12 7v13"/><path d="M12 7c-2-4-6-3-5 0M12 7c2-4 6-3 5 0"/></svg><span class="nav-badge nav-dot" data-gifts-dot hidden></span></button>',
  );
  (hud.side.querySelector('[data-action="gifts"]') as HTMLElement).addEventListener('click', () => giftsWindow.open());
  function renderTabs(): void {
    (hud.side.querySelector('[data-gifts-dot]') as HTMLElement).hidden = !giftsWindow.hasNew();
    const tab = nav.active();
    if (tab === 'market') marketTab.render();
    if (tab === 'chats') chatsTab.render();
    if (tab === 'inventory') inventoryTab.render();
    if (tab === 'eggs') eggsTab.render();
    if (tab === 'sales') salesTab.render();
    sheets.get('season')?.setTitle(i18n.t('nav.season'));
    nav.badge('chats', play.chats().filter((c) => c.unread).length);
    nav.badge('shop', play.upgradeList().some((u) => u.affordable || u.fresh));
    const shopEggs = play.eggShop();
    nav.badge('eggs', shopEggs.eggs.some((e) => e.fresh || (e.freeIn === 0 && e.open)));
  }
  const nextCard = createNextCard(
    actions.more,
    play,
    {
      t: i18n.t,
      lang: i18n.lang,
      name: (g) => {
        const lang = i18n.lang();
        if (g.kind === 'upgrade') return upgrades.upgrades.find((u) => u.id === g.id)?.name[lang] ?? g.id;
        if (g.kind === 'egg') return eggs.eggs.find((e) => e.id === g.id)?.name[lang] ?? g.id;
        if (g.kind === 'district') return i18n.t('next.district', { name: customers.districts.find((d) => d.id === g.id)?.name[lang] ?? g.id });
        return i18n.t('next.rebirth');
      },
    },
    () => {
      // An egg goal opens the Eggs tab, everything else the shop upgrades.
      const goal = play.nextGoal();
      if (goal.kind === 'egg') {
        nav.mark('eggs');
        showTab('eggs');
        eggsTab.show(goal.id);
      } else upgradesWindow.open();
    },
  );
  /** Game second of the player's last touch (idle news) and the events of the last minute (event news). */
  let lastTouch = 0;
  const recentEvents: Array<{ id: string; at: number }> = [];
  document.addEventListener('pointerdown', () => (lastTouch = runtime.elapsed()), { capture: true });
  const newsTicker = createNewsTicker(
    panel.root.querySelector('[data-panel="title"]') as HTMLElement,
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
  const toasts = createToasts(uiRoot);
  const merchantWindow = createMerchantWindow(uiRoot, play, {
    t: i18n.t,
    lang: i18n.lang,
    eggName: (id) => eggs.eggs.find((e) => e.id === id)?.name[i18n.lang()] ?? id,
    eggColor: (id) => styleData.eggs[id]?.shell ?? styleData.colors.egg,
  });
  const renderUi = (): void => {
    dealCard.render();
    actions.render();
    renderTabs();
    nextCard.render();
    upgradesWindow.render();
    merchantWindow.render();
  };
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
    else if (e.type === 'haggled') sfx.play(e.result === 'up' ? 'buy' : 'fail');
    else if (e.type === 'ftueDone') toasts.show(i18n.t('ftue.rich'), 'good', 3200);
    else if (e.type === 'rescueEgg') {
      toasts.show(i18n.t('toast.rescueEgg'), 'good', 2400);
      sfx.play('buy');
    }
    else if (e.type === 'firstCrystal') toasts.show(i18n.t('toast.crystal'), 'rare', 2800);
    else if (e.type === 'upgradeUnlocked') {
      const name = upgrades.upgrades.find((u) => u.id === e.id)?.name[i18n.lang()] ?? e.id;
      toasts.show(i18n.t('toast.upgradeUnlocked', { name }), 'good', 2400);
    }
    else if (e.type === 'cuckoo') sfx.play('levelUp');
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
      sfx.play('levelUp');
      const name = upgrades.upgrades.find((u) => u.id === e.id)?.name[i18n.lang()] ?? e.id;
      toasts.show(i18n.t('toast.upgrade', { name, n: e.level }), 'good');
    }
    else if (e.type === 'eggBought') sfx.play('buy');
    else if (e.type === 'eggsStored') toasts.show(i18n.t('eggs.stored', { n: e.count }), 'good', 1800);
    else if (e.type === 'freeEgg') {
      toasts.show(i18n.t('eggs.freeTaken'), 'good', 2000);
      sfx.play('buy');
    } else if (e.type === 'eggFed') sfx.play('buy');
    else if (e.type === 'hatched') {
      sfx.play(e.rarity === 'common' ? 'hatch' : 'rare');
      // The player opened it: the hatch show (M3-05); by itself (helpers, time away) — a toast for the rare ones.
      if (e.by === 'tap') hatchShow.play(e);
      else if (e.rarity !== 'common') toasts.show(`${i18n.t(`rarity.${e.rarity}`)}: ${speciesById(e.species)?.name[i18n.lang()] ?? e.species}`, 'rare', 2200);
    } else if (e.type === 'chatNew') sfx.play('tap');
    else if (e.type === 'lotBought') sfx.play('buy');
    else if (e.type === 'gift') {
      toasts.show(i18n.t('gifts.toast', { what: rewardText(e.reward) }), 'good', 2400);
      sfx.play('rare');
    }
    else if (e.type === 'chatSold') {
      sfx.play('coin');
      hud.pulse();
    } else if (e.type === 'soldNow') {
      sfx.play('coin');
      hud.pulse();
    }
  });
  const pauseWindow = createPauseWindow(uiRoot, runtime.pause, links, () => settingsWindow.open());
  const settingsWindow = createSettingsWindow(uiRoot, store, i18n, links, () => pauseWindow.overlay.show());
  hud.pauseButton.addEventListener('click', () => pauseWindow.open());
  document.addEventListener('keydown', (e) => {
    if (e.code !== 'Escape' || !controllable) return;
    if (awayWindow.overlay.isOpen()) awayWindow.close();
    else if (merchantWindow.overlay.isOpen()) merchantWindow.close();
    else if (upgradesWindow.overlay.isOpen()) upgradesWindow.close();
    else if (settingsWindow.overlay.isOpen()) settingsWindow.close();
    else pauseWindow.toggle();
  });
  const hints = createHints(uiRoot, {
    t: i18n.t,
    anchors: () => shop.anchors(),
    canvas,
    panel: panel.root,
    topInset: () => hud.root.getBoundingClientRect().bottom,
  });
  renderBuildLabel(uiRoot, __BUILD_LABEL__);
  i18n.apply(uiRoot);
  i18n.onChange((next) => {
    document.documentElement.lang = next;
    hud.setLanguage(next);
    hud.update(store.state.coins, { snap: true });
    actions.setLanguage(next);
    dealCard.render();
    panel.setTitle(__GAME__.title[next]);
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
        deal: play.deal(),
        hint: hints.text(),
        ftue: ftueHint(store.state, play.view())?.step ?? null,
        rarities: store.state.creatures.map((c) => speciesById(c.species)?.rarity ?? ''),
        event: play.view().event?.kind ?? null,
        tab: nav.active(),
        hatchTiming: hatchShow.timing(),
        newest: (() => {
          const c = play.view().creatures.at(-1);
          return c ? { uid: c.uid, species: c.species, low: c.low, high: c.high, name: speciesById(c.species)?.name[i18n.lang()] ?? c.species } : null;
        })(),
      }),
      anchors: () => shop.anchors(),
      grant: (coins) => {
        store.state.coins += coins;
        store.commit();
      },
    });
  }

  scene.app.ticker.add((ticker) => {
    runtime.frame(ticker.deltaMS / 1000);
    const view = play.view();
    shop.frame(runtime.pause.isPaused() ? 0 : (ticker.deltaMS / 1000) * runtime.timeScale, view);
    hints.update(controllable ? ftueHint(store.state, view) : null);
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
