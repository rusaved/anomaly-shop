// What: the HUD strip over the scene: coin counter (more rows arrive with M1).
// Called by: src/main.ts (create once, update on every store commit).
// Keep: numbers through Intl.NumberFormat of the current language; the HUD only reads state.

export interface Hud {
  root: HTMLElement;
  update(coins: number): void;
  setLanguage(lang: string): void;
}

export function createHud(parent: HTMLElement, lang: string): Hud {
  const root = document.createElement('div');
  root.className = 'hud';
  root.innerHTML = '<div class="hud-coins" data-hud="coins" role="status" data-i18n="hud.coins" data-i18n-attr="aria-label"><span class="coin" aria-hidden="true"></span><span class="hud-coins-value">0</span></div>';
  parent.appendChild(root);
  const value = root.querySelector('.hud-coins-value') as HTMLElement;
  let format = new Intl.NumberFormat(lang);
  let last = -1;
  return {
    root,
    update(coins) {
      if (coins === last) return;
      last = coins;
      value.textContent = format.format(Math.floor(coins));
    },
    setLanguage(next) {
      format = new Intl.NumberFormat(next);
      last = -1;
    },
  };
}
