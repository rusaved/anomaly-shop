// What: PixiJS 8 application on the #scene canvas: WebGL first, resolution min(dpr, 2), explicit resize.
// Called by: src/main.ts (create once), src/ui/layout.ts (resize on every viewport change).
// Keep: one Application per page; no DOM queries here, the canvas is passed in; background color from style.json.

import { Application } from 'pixi.js';

export interface SceneApp {
  app: Application;
  resize(width: number, height: number): void;
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
  return {
    app,
    resize(width, height) {
      app.renderer.resize(Math.max(1, Math.floor(width)), Math.max(1, Math.floor(height)));
    },
  };
}
