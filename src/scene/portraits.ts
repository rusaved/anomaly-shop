// What: creature and egg pictures for the HTML screens (eggs, inventory, chats, market; M3): the scene art drawn once into an image.
// Called by: src/main.ts (create once after the scene app), the ui modules through url(...) lookups.
// Keep: same art as the shop (src/scene/art.ts), so a creature looks the same everywhere; cached per id and size, data: URLs only (no files, no links).

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
}

const SIZE = 96;
/** The share of its square a thing's longest side takes. */
const THING_FILL = 0.84;

export function createPortraits(app: Application, style: StyleData): Portraits {
  const cache = new Map<string, string>();
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
      return render(`c:${species}`, (g) => drawCreature(g, look, rarity, SIZE * 0.34, c, outline));
    },
    egg(id, tint) {
      const look = style.eggs[id];
      return render(`e:${id}:${tint ?? ''}`, (g) => drawEgg(g, SIZE * 0.5, c, outline, 0, tint ? { shell: tint, spots: look?.spots ?? c.eggSpots } : look));
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
  };
}
