// What: screen layout (docs/02, 4.4; docs/07; MU-02): the top bar, a full-width tab bar at the bottom; between them «Лавка» (the shop room + the shelf or eggs) or a tab screen.
// Called by: src/main.ts (watchLayout once), src/scene (stage rect), tests/layout.test.ts (computeLayout is pure).
// Keep: computeLayout has no DOM; every size and ratio sits in PANEL; both orientations work at any proportion, never locked.

export type Orientation = 'portrait' | 'landscape';
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}
export interface Layout {
  orientation: Orientation;
  width: number;
  height: number;
  /** Where the PixiJS shop is drawn: portrait — everything above the tab bar (the top bar lies over it); landscape — left of the side panel. */
  stage: Rect;
  /** MU-03: the «Витрина» strip of a portrait phone (its places, under the room); null in landscape (the shelf stays on the wall). */
  shelf: Rect | null;
  /** The part of «Лавка» next to the room: portrait — the floor under the room (shelf strip, buttons); landscape — the eggs list (l1). */
  panel: Rect;
  /** The tab bar: the whole width at the bottom in every orientation (UB-01). */
  nav: Rect;
  /** MU-02: a tab is a screen — everything between the top bar and the tab bar. */
  screen: Rect;
  hudHeight: number;
  safe: Insets;
}

/** MU-02, MU-03 (docs/07 «Токены», s1-shop-scene, l1-home-landscape): the bars and the share of the shop room. */
export const PANEL = {
  /** Portrait: the room (wall and counter) takes this share of the height above the tab bar (s1: 256 of 595). */
  roomShare: 0.43,
  roomMin: 200,
  roomMax: 340,
  /** Portrait: the «Витрина» label row under the room, then the places (s1: 27 + 40 px). */
  shelfTop: 66,
  /** Landscape: the shop room takes this share of the width (l1: 45 %), the eggs list the rest. */
  landscapeShare: 0.45,
  landscapeStageMin: 260,
  landscapePanelMin: 300,
  /** 07: the top bar 48 px, the tab bar 56 px (landscape 48). */
  hudHeight: 48,
  navHeight: 56,
  navHeightShort: 48,
  /** The shelf strip keeps the screen margins (07 rule 1: 16 px). */
  pad: 16,
  /** A phone sideways (the stage lower than this): the scene buttons get a band of floor under the room (44 + 12 + 12 px). */
  landscapeShort: 400,
  landscapeBand: 68,
};

const NO_INSETS: Insets = { top: 0, right: 0, bottom: 0, left: 0 };
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

export function computeLayout(width: number, height: number, safe: Insets = NO_INSETS): Layout {
  const w = Math.max(1, Math.floor(width));
  const h = Math.max(1, Math.floor(height));
  const portrait = h >= w;
  const hudHeight = Math.min(PANEL.hudHeight + safe.top, Math.max(1, Math.floor(h / 3)));
  const navH = Math.min((portrait ? PANEL.navHeight : PANEL.navHeightShort) + safe.bottom, Math.max(1, Math.floor(h / 3)));
  const nav = { x: 0, y: h - navH, w, h: navH };
  const screen = { x: 0, y: hudHeight, w, h: Math.max(1, h - navH - hudHeight) };
  const above = Math.max(1, h - navH);
  if (portrait) {
    const roomH = Math.max(1, Math.min(above - 1, clamp(Math.round(above * PANEL.roomShare), PANEL.roomMin, PANEL.roomMax)));
    const shelfY = roomH + PANEL.shelfTop;
    return {
      orientation: 'portrait',
      width: w,
      height: h,
      stage: { x: 0, y: 0, w, h: above },
      shelf: { x: PANEL.pad + safe.left, y: Math.min(shelfY, above - 1), w: Math.max(1, w - PANEL.pad * 2 - safe.left - safe.right), h: Math.max(1, above - shelfY) },
      panel: { x: 0, y: roomH, w, h: Math.max(1, above - roomH) },
      nav,
      screen,
      hudHeight,
      safe,
    };
  }
  const stageW = Math.max(1, Math.min(w - PANEL.landscapePanelMin, Math.max(PANEL.landscapeStageMin, Math.round(w * PANEL.landscapeShare))));
  const bodyH = Math.max(1, above - hudHeight);
  return {
    orientation: 'landscape',
    width: w,
    height: h,
    stage: { x: 0, y: hudHeight, w: stageW, h: bodyH },
    shelf: null,
    panel: { x: stageW, y: hudHeight, w: Math.max(1, w - stageW), h: bodyH },
    nav,
    screen,
    hudHeight,
    safe,
  };
}

/** Sideways on a phone: the height of the room over the band of the scene buttons (0 — the room takes the whole stage). */
export function roomHeight(layout: Layout): number {
  if (layout.shelf || layout.stage.h >= PANEL.landscapeShort) return 0;
  return Math.max(1, layout.stage.h - PANEL.landscapeBand);
}

/** The top inset the shop room keeps for the top bar: portrait — the bar lies over the room; landscape — the room is under the bar already. */
export function sceneTop(layout: Layout): number {
  return layout.shelf ? layout.hudHeight : 8;
}

/** env(safe-area-inset-*) through a probe element (iPhone notch and home bar). */
export function readSafeInsets(doc: Document): Insets {
  const probe = doc.createElement('div');
  probe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;padding-top:env(safe-area-inset-top);padding-right:env(safe-area-inset-right);padding-bottom:env(safe-area-inset-bottom);padding-left:env(safe-area-inset-left)';
  doc.body.appendChild(probe);
  const cs = getComputedStyle(probe);
  const px = (s: string): number => Number.parseFloat(s) || 0;
  const out = { top: px(cs.paddingTop), right: px(cs.paddingRight), bottom: px(cs.paddingBottom), left: px(cs.paddingLeft) };
  probe.remove();
  return out;
}

export function applyLayout(appRoot: HTMLElement, layout: Layout): void {
  appRoot.classList.toggle('portrait', layout.orientation === 'portrait');
  appRoot.classList.toggle('landscape', layout.orientation === 'landscape');
  const set = (name: string, px: number): void => appRoot.style.setProperty(name, `${px}px`);
  set('--hud-height', layout.hudHeight);
  set('--nav-size', layout.nav.h);
  set('--panel-x', layout.panel.x);
  set('--panel-y', layout.panel.y);
  set('--panel-w', layout.panel.w);
  set('--panel-h', layout.panel.h);
  set('--stage-w', layout.stage.w);
  set('--stage-h', layout.stage.h);
}

/** Recomputes on every size change (resize, rotation, address bar); calls cb at once and after each change. */
export function watchLayout(appRoot: HTMLElement, cb: (layout: Layout) => void): () => void {
  let last = '';
  const run = (): void => {
    const safe = readSafeInsets(appRoot.ownerDocument);
    const layout = computeLayout(appRoot.clientWidth, appRoot.clientHeight, safe);
    const key = `${layout.width}x${layout.height}:${layout.orientation}:${safe.top},${safe.right},${safe.bottom},${safe.left}`;
    if (key === last) return;
    last = key;
    applyLayout(appRoot, layout);
    cb(layout);
  };
  run();
  const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(run) : null;
  observer?.observe(appRoot);
  window.addEventListener('resize', run);
  window.addEventListener('orientationchange', run);
  return () => {
    observer?.disconnect();
    window.removeEventListener('resize', run);
    window.removeEventListener('orientationchange', run);
  };
}
