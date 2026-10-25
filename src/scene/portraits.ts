// What: creature and egg pictures for the HTML screens (eggs, inventory, chats, market; M3): the scene art drawn once into an image.
// Called by: src/main.ts (create once after the scene app), the ui modules through url(...) lookups.
// Keep: same art as the shop (src/scene/art.ts), so a creature looks the same everywhere; cached per id and size, data: URLs only (no files, no links); creatures and eggs asked before the first frame are drawn after it (release, M7-00).

import { Container, Graphics, Rectangle, type Application } from 'pixi.js';
import type { RarityName, StyleData } from '../content/schemas.ts';
import { drawCreature, drawEgg } from './art.ts';
import { drawUpgradeIcon } from './icons.ts';

export interface Portraits {
  /** A creature portrait (square, transparent). */
  creature(species: string, rarity: RarityName): string;
  /** An egg picture; tint is a care shell color (M3-02) or none. */
  egg(id: string, tint?: string): string;
  /** A thing to buy (an upgrade's decor or id, content/upgrades.json); size — the picture's side in px. */
  thing(name: string, size?: number): string;
  /** M7-00: after the first frame — draws the creatures and eggs held back and swaps their placeholders in the page. */
  release(root: ParentNode): void;
}

/** A 1×1 transparent picture; the fragment names the held-back picture (the browser ignores it when drawing). */
const BLANK = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7#';

const SIZE = 96;
/** The share of its square a thing's longest side takes. */
const THING_FILL = 0.84;

export function createPortraits(app: Application, style: StyleData): Portraits {
  const cache = new Map<string, string>();
  // M7-00 (Q-053): the first screen waits for no picture of a hidden screen — they are drawn once the shop is on screen.
  const held = new Map<string, () => string>();
  let holding = true;
  const later = (key: string, draw: () => string): string => {
    if (!holding || cache.has(key)) return draw();
    held.set(key, draw);
    return BLANK + encodeURIComponent(key);
  };
  const render = (key: string, draw: (g: Graphics, box: Container) => void, size = SIZE): string => {
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
    const box = new Container();
    const g = new Graphics();
    box.addChild(g);
    draw(g, box);
    // Every piece is drawn around 0,0: the box centres them all.
    for (const child of box.children) child.position.set(child.position.x + size / 2, child.position.y + size / 2);
    let url = '';
    try {
      const canvas = app.renderer.extract.canvas({ target: box, resolution: 1, frame: new Rectangle(0, 0, size, size) });
      url = (canvas as HTMLCanvasElement).toDataURL?.('image/png') ?? '';
    } catch {
      url = '';
    }
    box.destroy({ children: true });
    cache.set(key, url);
    return url;
  };
  const c = style.colors;
  const outline = Math.max(2, style.scene.outlineWidth * 0.8);
  return {
    creature(species, rarity) {
      const look = style.creatures[species];
      if (!look) return '';
      const key = `c:${species}`;
      return later(key, () => render(key, (g) => drawCreature(g, look, rarity, SIZE * 0.34, c, outline)));
    },
    egg(id, tint) {
      const look = style.eggs[id];
      const key = `e:${id}:${tint ?? ''}`;
      return later(key, () => render(key, (g) => drawEgg(g, SIZE * 0.5, c, outline, 0, tint ? { shell: tint, spots: look?.spots ?? c.eggSpots } : look)));
    },
    thing(name, size = SIZE) {
      // Круг правок FB-2 п. 5: every thing fills the same share of its square (its drawn outline, not its frame) — one icon size in a list.
      return render(
        `t:${name}:${size}`,
        (_g, box) => {
          const inner = new Container();
          box.addChild(inner);
          drawUpgradeIcon(inner, name, size * 0.44, c, outline * (size / SIZE));
          const b = inner.getLocalBounds();
          const side = Math.max(b.width, b.height);
          if (side <= 0) return;
          const k = (size * THING_FILL) / side;
          inner.scale.set(k);
          inner.position.set(-(b.x + b.width / 2) * k, -(b.y + b.height / 2) * k);
        },
        size,
      );
    },
    release(root) {
      holding = false;
      const urls = new Map<string, string>();
      for (const [key, draw] of held) urls.set(BLANK + encodeURIComponent(key), draw());
      held.clear();
      for (const img of root.querySelectorAll<HTMLImageElement>('img')) {
        const url = urls.get(img.getAttribute('src') ?? '');
        if (url !== undefined) img.src = url;
      }
    },
  };
}
