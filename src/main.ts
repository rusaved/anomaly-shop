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
import { track } from './analytics/track.ts';

async function boot(): Promise<void> {
  applyTheme(style.colors);
  const platform = await loadPlatform(track);
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
  scene.app.ticker.addOnce(() => {
    platform.firstFrame();
    document.getElementById('preloader')?.classList.add('hidden');
    platform.ready();
    platform.gameplayStart();
    track('gameReady');
  });
}

void boot();
