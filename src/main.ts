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
import { createSceneApp } from './scene/app.ts';
import { loadPlatform } from './platform/index.ts';
import { watchLifecycle } from './platform/lifecycle.ts';
import { createRuntime } from './core/runtime.ts';
import { track } from './analytics/track.ts';

async function boot(): Promise<void> {
  applyTheme(style.colors);
  const platform = await loadPlatform(track);
  const runtime = createRuntime(() => {
    /* the sim arrives with M0-04 and M1 */
  });
  let controllable = false;

  // Pause wiring (docs/02-tech.md, section 4.2): sdk from the platform, hidden/blur from the browser.
  platform.onPause(() => {
    if (!controllable) track('startup_ad_start');
    runtime.pause.pause('sdk');
  });
  platform.onResume(() => {
    if (!controllable) track('startup_ad_end');
    runtime.pause.resume('sdk');
  });
  watchLifecycle({
    hidden: () => runtime.pause.pause('hidden'),
    visible: () => runtime.pause.resume('hidden'),
    blur: () => runtime.pause.pause('blur'),
    focus: () => runtime.pause.resume('blur'),
    pagehide: () => undefined,
  });
  runtime.pause.onChange((paused) => {
    if (!controllable) return;
    if (paused) platform.gameplayStop();
    else platform.gameplayStart();
  });

  await platform.init();
  document.documentElement.lang = platform.language();

  const canvas = document.getElementById('scene') as HTMLCanvasElement;
  const appRoot = document.getElementById('app') as HTMLElement;
  const scene = await createSceneApp(canvas, style.colors.sky, window.devicePixelRatio);
  const fit = (): void => {
    canvas.style.width = `${appRoot.clientWidth}px`;
    canvas.style.height = `${appRoot.clientHeight}px`;
    scene.resize(appRoot.clientWidth, appRoot.clientHeight);
  };
  fit();
  window.addEventListener('resize', fit);

  if (__TEST_API__) {
    const { installTestApi } = await import('./test-api/index.ts');
    installTestApi({ runtime, platform, isControllable: () => controllable, snapshot: () => ({ coins: 0, creatures: [] }) });
  }

  scene.app.ticker.add((ticker) => runtime.frame(ticker.deltaMS / 1000));
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
