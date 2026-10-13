// What: sale coins flying from the buyer in the shop to the HUD coin chip (M1-07): a few coins on curved paths, staggered.
// Called by: src/main.ts on every sale (from the buyer's page point to the HUD coin icon).
// Keep: pure decoration over everything (pointer-events: none); Web Animations only; reduced motion or no animate() — no flight.

export interface CoinFlight {
  /** Starts the flight; onLand fires as each coin arrives. Returns the seconds until the last coin lands. */
  fly(from: { x: number; y: number }, to: HTMLElement, count: number, sec: number, onLand?: () => void): number;
}

const STAGGER = 0.06;

export function createCoinFlight(parent: HTMLElement): CoinFlight {
  const layer = document.createElement('div');
  layer.className = 'coin-flight';
  parent.appendChild(layer);
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  return {
    fly(from, to, count, sec, onLand) {
      const n = Math.max(0, Math.round(count));
      if (reduced || n === 0 || typeof layer.animate !== 'function') {
        onLand?.();
        return 0;
      }
      const base = layer.getBoundingClientRect();
      const r = to.getBoundingClientRect();
      const tx = r.left + r.width / 2 - base.left;
      const ty = r.top + r.height / 2 - base.top;
      const fx = from.x - base.left;
      const fy = from.y - base.top;
      for (let i = 0; i < n; i++) {
        const el = document.createElement('span');
        el.className = 'coin coin-fly';
        layer.appendChild(el);
        const spread = (i - (n - 1) / 2) * 14;
        const mx = (fx + tx) / 2 + spread * 2;
        const my = Math.max(12, (fy + ty) / 2 - 24 - (i % 3) * 12);
        const anim = el.animate(
          [
            { transform: `translate(${fx + spread}px, ${fy}px) scale(0.4)`, opacity: 0 },
            { transform: `translate(${fx + spread * 1.4}px, ${fy - 28}px) scale(1.1)`, opacity: 1, offset: 0.18 },
            { transform: `translate(${mx}px, ${my}px) scale(1)`, opacity: 1, offset: 0.55 },
            { transform: `translate(${tx}px, ${ty}px) scale(0.7)`, opacity: 1 },
          ],
          { duration: sec * 1000, delay: i * STAGGER * 1000, easing: 'cubic-bezier(.45,.05,.55,.95)', fill: 'backwards' },
        );
        anim.onfinish = () => {
          el.remove();
          onLand?.();
        };
        anim.oncancel = () => el.remove();
      }
      return sec + (n - 1) * STAGGER;
    },
  };
}
