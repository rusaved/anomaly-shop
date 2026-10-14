// What: screen layout (docs/02-tech.md, 4.4; docs/01 §6): portrait = shop, panel, tab bar top to bottom; landscape = shop left, panel and tab bar right; a tab's sheet covers the panel.
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
  /** Where the PixiJS shop is drawn (full canvas minus the panel). */
  stage: Rect;
  /** Where the HTML panel sits. */
  panel: Rect;
  /** The bottom tab bar (M3-03). */
  nav: Rect;
  /** Where an open tab (a sheet) sits: over the panel, taller in portrait; the shop stays visible above or to the left. */
  sheet: Rect;
  hudHeight: number;
  safe: Insets;
}

export const PANEL = {
  portraitShare: 0.36,
  portraitMin: 200,
  portraitMax: 320,
  landscapeShare: 0.4,
  landscapeMin: 260,
  landscapeMax: 420,
  /** A landscape panel narrower than this stacks the deal buttons in two rows. */
  narrowPanel: 300,
  /** A portrait panel lower than this hides its title and side community buttons (they stay in pause). */
  shortPanel: 280,
  hudHeight: 60,
  /** The tab bar height (plus the bottom safe inset). */
  navHeight: 58,
  /** A portrait sheet rises to this share of the screen; the rest above shows the shop. */
  sheetPortraitShare: 0.66,
};

const NO_INSETS: Insets = { top: 0, right: 0, bottom: 0, left: 0 };
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

export function computeLayout(width: number, height: number, safe: Insets = NO_INSETS): Layout {
  const w = Math.max(1, Math.floor(width));
  const h = Math.max(1, Math.floor(height));
  const hudHeight = PANEL.hudHeight + safe.top;
  if (h >= w) {
    const navH = Math.min(PANEL.navHeight + safe.bottom, Math.max(1, h - 160));
    const panelH = Math.max(1, Math.min(h - navH - 120, clamp(h * PANEL.portraitShare, PANEL.portraitMin, PANEL.portraitMax)));
    const stageH = Math.max(1, h - panelH - navH);
    const sheetY = Math.min(stageH, Math.max(hudHeight, Math.round(h - navH - h * PANEL.sheetPortraitShare)));
    return {
      orientation: 'portrait',
      width: w,
      height: h,
      stage: { x: 0, y: 0, w, h: stageH },
      panel: { x: 0, y: stageH, w, h: panelH },
      nav: { x: 0, y: h - navH, w, h: navH },
      sheet: { x: 0, y: sheetY, w, h: Math.max(1, h - navH - sheetY) },
      hudHeight,
      safe,
    };
  }
  const panelW = Math.max(1, Math.min(w - 160, clamp(w * PANEL.landscapeShare, PANEL.landscapeMin, PANEL.landscapeMax) + safe.right));
  const navH = Math.min(PANEL.navHeight + safe.bottom, Math.max(1, h - 120));
  const panel = { x: w - panelW, y: 0, w: panelW, h: Math.max(1, h - navH) };
  return {
    orientation: 'landscape',
    width: w,
    height: h,
    stage: { x: 0, y: 0, w: Math.max(1, w - panelW), h },
    panel,
    nav: { x: w - panelW, y: h - navH, w: panelW, h: navH },
    sheet: { ...panel },
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
  appRoot.classList.toggle('panel-narrow', layout.orientation === 'landscape' && layout.panel.w < PANEL.narrowPanel);
  // A short portrait panel (iPhone SE) keeps the deal and the actions; the title and the side community buttons step aside (pause has them).
  appRoot.classList.toggle('panel-short', layout.orientation === 'portrait' && layout.panel.h < PANEL.shortPanel);
  const size = layout.orientation === 'portrait' ? layout.panel.h : layout.panel.w;
  appRoot.style.setProperty('--panel-size', `${size}px`);
  appRoot.style.setProperty('--hud-height', `${layout.hudHeight}px`);
  appRoot.style.setProperty('--nav-size', `${layout.nav.h}px`);
  appRoot.style.setProperty('--sheet-top', `${layout.sheet.y}px`);
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
