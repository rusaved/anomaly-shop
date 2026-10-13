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
import { createToasts } from './ui/toast.ts';
import { audio, customers, dictionaries, eggs, feel, ftue, species, speciesById, style as styleData, upgrades } from './content/index.ts';
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
      flushSave();
    },
    visible: () => runtime.pause.resume('hidden'),
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
  const persistence = bindPersistence(store, platform);
  flushSave = () => persistence.flush();
  const play = createGame(store, { eggs, species, customers, upgrades, ftue }, createRng(platform.now()));
  game = play;

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
    invalidate: scene.invalidate,
    handlers: { tapIncubator: (i) => play.tapIncubator(i), tapCreature: (uid) => play.tapCreature(uid) },
  });
  const hud = createHud(uiRoot, lang, () => feel.hudRollSec);
  hud.update(store.state.coins, { snap: true });
  // Sale coins roll the counter only as they land (M1-07, the sold handler below); everything else rolls at once.
  store.onCommit((s) => hud.update(s.coins));
  const flight = createCoinFlight(uiRoot);
  const panel = createPanel(uiRoot, __GAME__.title[lang]);
  const links = platform.caps.community ? communityLinks() : null;
  renderCommunity(panel.side, links, 'side', true);
  const dealCard = createDealCard(panel.body, play, {
    t: i18n.t,
    lang: i18n.lang,
    customerName: (id) => customers.districts.find((d) => d.customer.id === id)?.customer.name[i18n.lang()] ?? id,
    customerColor: (id) => styleData.customers[id]?.body ?? styleData.colors.queueSpot,
    speciesName: (id) => speciesById(id)?.name[i18n.lang()] ?? id,
  });
  const actions = createActions(panel.body, play, lang);
  const toasts = createToasts(uiRoot);
  const renderUi = (): void => {
    dealCard.render();
    actions.render();
  };
  renderUi();
  store.onCommit(renderUi);
  const sfx = createSfx(audio, () => store.state.settings.sound && platform.audioAllowed());
  document.addEventListener('pointerdown', () => sfx.unlock(), { capture: true });
  runtime.pause.onChange((paused) => sfx.setSuspended(paused));
  play.events.on((e) => {
    shop.onEvent(e);
    if (e.type === 'change') renderUi();
    else if (e.type === 'denied') {
      toasts.show(i18n.t(`deny.${e.reason}`), 'warn');
      sfx.play('fail');
    } else if (e.type === 'eggTap') sfx.play('eggTap');
    else if (e.type === 'fed') sfx.play(e.levelUp ? 'levelUp' : 'tap');
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
    else if (e.type === 'eggBought') sfx.play('buy');
    else if (e.type === 'hatched') {
      sfx.play(e.rarity === 'common' ? 'hatch' : 'rare');
      const name = speciesById(e.species)?.name[i18n.lang()] ?? e.species;
      if (e.rarity !== 'common') toasts.show(`${i18n.t(`rarity.${e.rarity}`)}: ${name}`, 'rare', 2200);
    }
  });
  const pauseWindow = createPauseWindow(uiRoot, runtime.pause, links, () => settingsWindow.open());
  const settingsWindow = createSettingsWindow(uiRoot, store, i18n, links, () => pauseWindow.overlay.show());
  hud.pauseButton.addEventListener('click', () => pauseWindow.open());
  document.addEventListener('keydown', (e) => {
    if (e.code !== 'Escape' || !controllable) return;
    if (settingsWindow.overlay.isOpen()) settingsWindow.close();
    else pauseWindow.toggle();
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
    installTestApi({ runtime, platform, i18n, fps: () => scene.app.ticker.FPS, isControllable: () => controllable, snapshot: () => ({ coins: store.state.coins, creatures: store.state.creatures, incubators: store.state.incubators, stats: store.state.stats }),
      anchors: () => shop.anchors(),
      grant: (coins) => {
        store.state.coins += coins;
        store.commit();
      },
    });
  }

  scene.app.ticker.add((ticker) => {
    runtime.frame(ticker.deltaMS / 1000);
    shop.frame(runtime.pause.isPaused() ? 0 : (ticker.deltaMS / 1000) * runtime.timeScale, play.view());
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
