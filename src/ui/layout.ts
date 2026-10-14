// What: screen layout (docs/02, 4.4; docs/01 §6; UB-01): top bar, a full-width tab bar at the bottom; between them home «Eggs» (shop + panel) or a tab screen.
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
  /** Where the PixiJS shop is drawn: above the home panel in portrait, left of it in landscape (the top bar lies over it). */
  stage: Rect;
  /** The home panel (the eggs of the «Eggs» screen) and the side panel over it (UB-04: upgrades, details — the shop stays in view). */
  panel: Rect;
  /** The tab bar: the whole width at the bottom in every orientation (UB-01). */
  nav: Rect;
  /** The screen of a tab other than «Eggs»: everything between the top bar and the tab bar. */
  screen: Rect;
  hudHeight: number;
  safe: Insets;
}

export const PANEL = {
  /** Portrait: the home panel takes this share of the height above the tab bar, within min and max. */
  portraitShare: 0.46,
  portraitMin: 200,
  portraitMax: 440,
  /** Portrait: the shop keeps at least this much (the top bar included): 44 px tap zones on a 320×568 phone. */
  portraitStageMin: 290,
  landscapeShare: 0.42,
  landscapeMin: 300,
  landscapeMax: 460,
  /** Landscape: the shop keeps at least this width. */
  landscapeStageMin: 260,
  /** The top bar height (plus the top safe inset); lower on a landscape phone. */
  hudHeight: 56,
  hudHeightShort: 50,
  /** The tab bar height (plus the bottom safe inset): a 24 px icon and a 12 px label; lower on a landscape phone. */
  navHeight: 62,
  navHeightShort: 56,
  /** Screens lower than this use the short bars. */
  shortHeight: 480,
};

const NO_INSETS: Insets = { top: 0, right: 0, bottom: 0, left: 0 };
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

export function computeLayout(width: number, height: number, safe: Insets = NO_INSETS): Layout {
  const w = Math.max(1, Math.floor(width));
  const h = Math.max(1, Math.floor(height));
  const short = h < PANEL.shortHeight;
  const hudHeight = Math.min((short ? PANEL.hudHeightShort : PANEL.hudHeight) + safe.top, Math.max(1, Math.floor(h / 3)));
  const navH = Math.min((short ? PANEL.navHeightShort : PANEL.navHeight) + safe.bottom, Math.max(1, Math.floor(h / 3)));
  const nav = { x: 0, y: h - navH, w, h: navH };
  const screen = { x: 0, y: hudHeight, w, h: Math.max(1, h - navH - hudHeight) };
  const above = h - navH;
  if (h >= w) {
    const panelH = Math.max(1, Math.min(above - PANEL.portraitStageMin, clamp(Math.round(above * PANEL.portraitShare), PANEL.portraitMin, PANEL.portraitMax)));
    const stageH = Math.max(1, above - panelH);
    return {
      orientation: 'portrait',
      width: w,
      height: h,
      stage: { x: 0, y: 0, w, h: stageH },
      panel: { x: 0, y: stageH, w, h: panelH },
      nav,
      screen,
      hudHeight,
      safe,
    };
  }
  const panelW = Math.max(1, Math.min(w - PANEL.landscapeStageMin, clamp(Math.round(w * PANEL.landscapeShare), PANEL.landscapeMin, PANEL.landscapeMax) + safe.right));
  return {
    orientation: 'landscape',
    width: w,
    height: h,
    stage: { x: 0, y: 0, w: Math.max(1, w - panelW), h: Math.max(1, above) },
    panel: { x: w - panelW, y: hudHeight, w: panelW, h: Math.max(1, above - hudHeight) },
    nav,
    screen,
    hudHeight,
    safe,
  };
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
