// What: creature and egg pictures for the HTML screens (eggs, inventory, chats, market; M3): the scene art drawn once into an image.
// Called by: src/main.ts (create once after the scene app), the ui modules through url(...) lookups.
// Keep: same art as the shop (src/scene/art.ts), so a creature looks the same everywhere; cached per id and size, data: URLs only (no files, no links).

import { Container, Graphics, Rectangle, type Application } from 'pixi.js';
import type { RarityName, StyleData } from '../content/schemas.ts';
import { drawCreature, drawEgg } from './art.ts';

export interface Portraits {
  /** A creature portrait (square, transparent). */
  creature(species: string, rarity: RarityName): string;
  /** An egg picture; tint is a care shell color (M3-02) or none. */
  egg(id: string, tint?: string): string;
}

const SIZE = 96;

export function createPortraits(app: Application, style: StyleData): Portraits {
  const cache = new Map<string, string>();
  const render = (key: string, draw: (g: Graphics) => void): string => {
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
    const box = new Container();
    const g = new Graphics();
    box.addChild(g);
    draw(g);
    g.position.set(SIZE / 2, SIZE / 2);
    let url = '';
    try {
      const canvas = app.renderer.extract.canvas({ target: box, resolution: 1, frame: new Rectangle(0, 0, SIZE, SIZE) });
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
  };
}
