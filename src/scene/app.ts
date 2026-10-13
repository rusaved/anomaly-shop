// What: PixiJS 8 application on the #scene canvas: WebGL first, resolution min(dpr, 2), explicit resize.
// Called by: src/main.ts (create once), src/ui/layout.ts (resize on every viewport change).
// Keep: one Application per page; no DOM queries here, the canvas is passed in; background color from style.json.

import { Application, UPDATE_PRIORITY } from 'pixi.js';

export interface SceneApp {
  app: Application;
  resize(width: number, height: number): void;
  /** Asks for one render on the next tick; a static shop is not redrawn every frame (battery, weak GPUs). */
  invalidate(): void;
  /** Renders done so far (test API). */
  frames(): number;
}

export const MAX_RESOLUTION = 2;

export async function createSceneApp(canvas: HTMLCanvasElement, background: string, dpr: number): Promise<SceneApp> {
  const app = new Application();
  await app.init({
    canvas,
    preference: 'webgl',
    background,
    resolution: Math.min(dpr || 1, MAX_RESOLUTION),
    autoDensity: true,
    antialias: true,
    width: canvas.clientWidth || 1,
    height: canvas.clientHeight || 1,
  });
  let dirty = true;
  let frames = 0;
  app.ticker.remove(app.render, app);
  app.ticker.add(
    () => {
      if (!dirty) return;
      dirty = false;
      app.render();
      frames += 1;
    },
    undefined,
    UPDATE_PRIORITY.LOW,
  );
  return {
    app,
    resize(width, height) {
      app.renderer.resize(Math.max(1, Math.floor(width)), Math.max(1, Math.floor(height)));
      dirty = true;
    },
    invalidate() {
      dirty = true;
    },
    frames: () => frames,
  };
}
