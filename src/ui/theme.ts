// What: turns content/style.json colors into CSS variables (--c-sky, --c-uiPanel, ...) on <html>.
// Called by: src/main.ts, once before the UI is built.
// Keep: colors live in content/style.json only; CSS files reference var(--c-*), never literals.

export type StyleColors = Record<string, string>;

export function applyTheme(colors: StyleColors, target: HTMLElement = document.documentElement): void {
  for (const [name, value] of Object.entries(colors)) target.style.setProperty(`--c-${name}`, value);
}
