// What: primitive art in the A style (flat cute vector, thick outline; Q-001): eggs now, creatures and customers as they arrive.
// Called by: src/scene/shop.ts (each piece drawn into its own Graphics, centred at 0,0, then moved by its container).
// Keep: shapes only, no state; every color from content/style.json; sizes scale from the radius r.

import type { Graphics } from 'pixi.js';
import type { CreatureLookData, RarityName, StyleData } from '../content/schemas.ts';

type Colors = StyleData['colors'];

/** The rarity color (Q-022: grey to red) from style.json → rarity. */
export function rarityColor(palette: StyleData['rarity'], rarity: RarityName): string {
  return palette[rarity];
}

type PathFn = (g: Graphics) => Graphics;

/** Fills several overlapping shapes as one body with one outline (outline pass first, fill pass on top). */
function union(g: Graphics, shapes: PathFn[], fill: string, outline: string, w: number): void {
  for (const sh of shapes) sh(g).fill(outline).stroke({ width: w * 2, color: outline, join: 'round' });
  for (const sh of shapes) sh(g).fill(fill);
}

function dotEyes(g: Graphics, x: number, y: number, sep: number, size: number, c: Colors): void {
  for (const dx of [-sep, sep]) {
    g.circle(x + dx, y, size).fill(c.outline);
    g.circle(x + dx + size * 0.35, y - size * 0.35, size * 0.38).fill(c.eyeWhite);
  }
}

function blush(g: Graphics, x: number, y: number, sep: number, size: number, c: Colors): void {
  for (const dx of [-sep, sep]) g.ellipse(x + dx, y, size * 1.3, size * 0.75).fill({ color: c.blush, alpha: 0.8 });
}

function smile(g: Graphics, x: number, y: number, w: number, h: number, c: Colors, width: number): void {
  g.moveTo(x - w, y).quadraticCurveTo(x, y + h, x + w, y).stroke({ width, color: c.outline, cap: 'round' });
}

function face(g: Graphics, y: number, r: number, c: Colors, w: number, x = 0): void {
  dotEyes(g, x, y, r * 0.22, r * 0.08, c);
  blush(g, x, y + r * 0.13, r * 0.36, r * 0.07, c);
  smile(g, x, y + r * 0.12, r * 0.1, r * 0.08, c, w * 0.7);
}

function sparkle(g: Graphics, x: number, y: number, size: number, color: string): void {
  const pts: number[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (Math.PI * i) / 4;
    const d = i % 2 === 0 ? size : size * 0.32;
    pts.push(x + Math.cos(a) * d, y + Math.sin(a) * d);
  }
  g.poly(pts).fill(color);
}

function sockBody(g: Graphics, r: number, look: CreatureLookData, c: Colors, w: number, gold: boolean): void {
  union(
    g,
    [
      (q) => q.roundRect(-r * 0.5, -r * 0.8, r * 0.62, r * 1.15, r * 0.2),
      (q) => q.roundRect(-r * 0.5, r * 0.05, r * 1.3, r * 0.62, r * 0.31),
      (q) => (gold ? q.poly([-r * 0.5, -r * 0.62, -r * 0.5, -r * 0.62]) : q.poly([-r * 0.48, -r * 0.42, -r * 0.88, -r * 0.62, -r * 0.48, -r * 0.08])),
    ],
    look.body,
    c.outline,
    w,
  );
  g.roundRect(-r * 0.56, -r * 0.86, r * 0.74, r * 0.24, r * 0.08).fill(gold ? look.accent : c.eyeWhite).stroke({ width: w, color: c.outline });
  g.rect(-r * 0.5, -r * 0.78, r * 0.62, r * 0.05).fill({ color: gold ? look.body : look.accent, alpha: 0.9 });
  // Mouth with teeth at the toe; eyes on the instep.
  g.ellipse(r * 0.55, r * 0.42, r * 0.2, r * 0.13).fill(c.outline);
  for (const tx of [0.44, 0.55, 0.66]) g.poly([r * (tx - 0.04), r * 0.32, r * (tx + 0.04), r * 0.32, r * tx, r * 0.4]).fill(c.eyeWhite);
  dotEyes(g, r * 0.25, r * 0.2, r * 0.14, r * 0.07, c);
  blush(g, r * 0.25, r * 0.31, r * 0.26, r * 0.06, c);
}

/** A creature portrait centred at 0,0 inside radius r: the shape and colors come from style.json (creatures). */
export function drawCreature(g: Graphics, look: CreatureLookData, rarity: RarityName, r: number, c: Colors, outline: number): void {
  const w = outline;
  g.clear();
  // Color discipline (M3-17): the rarity is a dash under the creature (the scene), not a halo around it.
  void rarity;
  switch (look.shape) {
    case 'kettle': {
      g.moveTo(-r * 0.6, -r * 0.25).bezierCurveTo(-r * 1.02, -r * 0.3, -r * 1.02, r * 0.5, -r * 0.58, r * 0.42).stroke({ width: w * 3, color: c.outline, cap: 'round' });
      g.moveTo(-r * 0.6, -r * 0.25).bezierCurveTo(-r * 1.02, -r * 0.3, -r * 1.02, r * 0.5, -r * 0.58, r * 0.42).stroke({ width: w * 1.2, color: look.body, cap: 'round' });
      union(g, [(q) => q.ellipse(0, r * 0.12, r * 0.7, r * 0.58), (q) => q.poly([r * 0.45, r * 0.05, r * 0.98, -r * 0.38, r * 1.04, -r * 0.24, r * 0.6, r * 0.38])], look.body, c.outline, w);
      g.ellipse(0, -r * 0.42, r * 0.44, r * 0.15).fill(look.accent).stroke({ width: w, color: c.outline });
      g.circle(0, -r * 0.6, r * 0.1).fill(look.accent).stroke({ width: w, color: c.outline });
      g.circle(r * 1.0, -r * 0.55, r * 0.08).fill({ color: look.accent, alpha: 0.9 });
      g.circle(r * 0.88, -r * 0.72, r * 0.06).fill({ color: look.accent, alpha: 0.8 });
      face(g, r * 0.05, r, c, w);
      break;
    }
    case 'sock':
      sockBody(g, r, look, c, w, false);
      break;
    case 'goldsock':
      sockBody(g, r, look, c, w, true);
      g.poly([-r * 0.48, -r * 0.86, -r * 0.48, -r * 1.12, -r * 0.33, -r * 0.98, -r * 0.19, -r * 1.16, -r * 0.05, -r * 0.98, r * 0.1, -r * 1.12, r * 0.1, -r * 0.86])
        .fill(look.body)
        .stroke({ width: w, color: c.outline, join: 'round' });
      g.circle(-r * 0.19, -r * 0.94, r * 0.05).fill(c.rarityRare);
      sparkle(g, r * 0.62, -r * 0.55, r * 0.17, look.accent);
      sparkle(g, -r * 0.78, r * 0.25, r * 0.12, look.accent);
      sparkle(g, r * 0.95, r * 0.0, r * 0.09, c.eyeWhite);
      break;
    case 'cloudcat': {
      union(
        g,
        [
          (q) => q.circle(-r * 0.4, r * 0.1, r * 0.38),
          (q) => q.circle(0, -r * 0.08, r * 0.48),
          (q) => q.circle(r * 0.42, r * 0.1, r * 0.38),
          (q) => q.roundRect(-r * 0.76, r * 0.05, r * 1.52, r * 0.45, r * 0.22),
          (q) => q.poly([-r * 0.4, -r * 0.34, -r * 0.32, -r * 0.8, -r * 0.06, -r * 0.5]),
          (q) => q.poly([r * 0.06, -r * 0.5, r * 0.32, -r * 0.8, r * 0.4, -r * 0.34]),
        ],
        look.body,
        c.outline,
        w,
      );
      g.poly([-r * 0.33, -r * 0.42, -r * 0.29, -r * 0.66, -r * 0.14, -r * 0.5]).fill(c.blush);
      g.poly([r * 0.14, -r * 0.5, r * 0.29, -r * 0.66, r * 0.33, -r * 0.42]).fill(c.blush);
      dotEyes(g, 0, r * 0.02, r * 0.2, r * 0.075, c);
      blush(g, 0, r * 0.15, r * 0.34, r * 0.065, c);
      g.moveTo(-r * 0.1, r * 0.14).quadraticCurveTo(-r * 0.05, r * 0.22, 0, r * 0.14).quadraticCurveTo(r * 0.05, r * 0.22, r * 0.1, r * 0.14).stroke({ width: w * 0.7, color: c.outline, cap: 'round' });
      for (const sx of [-1, 1]) {
        g.moveTo(sx * r * 0.42, r * 0.1).lineTo(sx * r * 0.7, r * 0.04).stroke({ width: w * 0.5, color: c.outline, cap: 'round' });
        g.moveTo(sx * r * 0.42, r * 0.18).lineTo(sx * r * 0.7, r * 0.2).stroke({ width: w * 0.5, color: c.outline, cap: 'round' });
      }
      for (const [dx, dy] of [[-0.35, 0.72], [0.05, 0.8], [0.42, 0.7]] as const) g.ellipse(r * dx, r * dy, r * 0.06, r * 0.1).fill(look.accent);
      break;
    }
    case 'lampbug': {
      g.ellipse(-r * 0.58, -r * 0.1, r * 0.34, r * 0.2).fill({ color: c.eyeWhite, alpha: 0.75 }).stroke({ width: w * 0.8, color: c.outline });
      g.ellipse(r * 0.58, -r * 0.1, r * 0.34, r * 0.2).fill({ color: c.eyeWhite, alpha: 0.75 }).stroke({ width: w * 0.8, color: c.outline });
      g.circle(0, -r * 0.12, r * 0.74).fill({ color: look.body, alpha: 0.28 });
      g.moveTo(-r * 0.14, -r * 0.62).lineTo(-r * 0.3, -r * 0.92).stroke({ width: w * 0.8, color: c.outline, cap: 'round' });
      g.moveTo(r * 0.14, -r * 0.62).lineTo(r * 0.3, -r * 0.92).stroke({ width: w * 0.8, color: c.outline, cap: 'round' });
      g.circle(-r * 0.3, -r * 0.92, r * 0.07).fill(look.body).stroke({ width: w * 0.6, color: c.outline });
      g.circle(r * 0.3, -r * 0.92, r * 0.07).fill(look.body).stroke({ width: w * 0.6, color: c.outline });
      g.roundRect(-r * 0.28, r * 0.36, r * 0.56, r * 0.42, r * 0.08).fill(look.accent).stroke({ width: w, color: c.outline });
      g.rect(-r * 0.28, r * 0.5, r * 0.56, w * 0.6).fill(c.outline);
      g.rect(-r * 0.28, r * 0.63, r * 0.56, w * 0.6).fill(c.outline);
      g.circle(0, -r * 0.12, r * 0.55).fill(look.body).stroke({ width: w, color: c.outline });
      g.ellipse(-r * 0.25, -r * 0.38, r * 0.1, r * 0.06).fill({ color: c.eyeWhite, alpha: 0.9 });
      face(g, -r * 0.1, r, c, w);
      break;
    }
    case 'toast': {
      union(
        g,
        [(q) => q.circle(-r * 0.3, -r * 0.42, r * 0.32), (q) => q.circle(r * 0.3, -r * 0.42, r * 0.32), (q) => q.roundRect(-r * 0.62, -r * 0.5, r * 1.24, r * 1.18, r * 0.18)],
        look.body,
        c.outline,
        w,
      );
      g.circle(-r * 0.3, -r * 0.4, r * 0.23).fill(c.egg);
      g.circle(r * 0.3, -r * 0.4, r * 0.23).fill(c.egg);
      g.roundRect(-r * 0.51, -r * 0.42, r * 1.02, r * 0.98, r * 0.14).fill(c.egg);
      g.ellipse(0, -r * 0.33, r * 0.42, r * 0.2).fill(look.accent).stroke({ width: w * 0.8, color: c.outline });
      g.circle(-r * 0.22, -r * 0.16, r * 0.08).fill(look.accent).stroke({ width: w * 0.6, color: c.outline });
      g.circle(r * 0.18, -r * 0.12, r * 0.1).fill(look.accent).stroke({ width: w * 0.6, color: c.outline });
      g.ellipse(-r * 0.15, -r * 0.4, r * 0.1, r * 0.05).fill({ color: c.eyeWhite, alpha: 0.85 });
      face(g, r * 0.18, r, c, w);
      break;
    }
    case 'frog': {
      union(g, [(q) => q.ellipse(0, r * 0.15, r * 0.82, r * 0.56), (q) => q.circle(-r * 0.38, -r * 0.34, r * 0.27), (q) => q.circle(r * 0.38, -r * 0.34, r * 0.27)], look.body, c.outline, w);
      g.ellipse(0, r * 0.38, r * 0.46, r * 0.22).fill({ color: look.accent, alpha: 0.75 });
      g.poly([-r * 0.62, r * 0.05, -r * 0.5, r * 0.05, -r * 0.7, r * 0.45, -r * 0.8, r * 0.45]).fill({ color: look.accent, alpha: 0.85 });
      g.poly([r * 0.5, -r * 0.02, r * 0.58, -r * 0.02, r * 0.42, r * 0.3, r * 0.34, r * 0.3]).fill({ color: look.accent, alpha: 0.85 });
      for (const sx of [-1, 1]) {
        g.circle(sx * r * 0.38, -r * 0.36, r * 0.17).fill(c.eyeWhite).stroke({ width: w * 0.6, color: c.outline });
        g.circle(sx * r * 0.36, -r * 0.33, r * 0.09).fill(c.outline);
        g.circle(sx * r * 0.33, -r * 0.37, r * 0.035).fill(c.eyeWhite);
      }
      blush(g, 0, r * 0.12, r * 0.42, r * 0.07, c);
      smile(g, 0, r * 0.08, r * 0.32, r * 0.16, c, w * 0.8);
      break;
    }
    case 'teacup': {
      g.poly([-r * 0.62, r * 0.0, -r * 0.98, -r * 0.3, -r * 0.82, r * 0.12]).fill(look.accent).stroke({ width: w * 0.8, color: c.outline, join: 'round' });
      g.poly([r * 0.62, r * 0.0, r * 0.98, -r * 0.3, r * 0.82, r * 0.12]).fill(look.accent).stroke({ width: w * 0.8, color: c.outline, join: 'round' });
      g.ellipse(0, r * 0.64, r * 0.86, r * 0.18).fill(look.body).stroke({ width: w, color: c.outline });
      g.circle(r * 0.76, r * 0.2, r * 0.19).stroke({ width: w * 3, color: c.outline });
      g.circle(r * 0.76, r * 0.2, r * 0.19).stroke({ width: w * 1.2, color: look.body });
      g.moveTo(-r * 0.7, -r * 0.02).lineTo(r * 0.7, -r * 0.02).quadraticCurveTo(r * 0.66, r * 0.6, 0, r * 0.6).quadraticCurveTo(-r * 0.66, r * 0.6, -r * 0.7, -r * 0.02).closePath().fill(look.body).stroke({ width: w, color: c.outline, join: 'round' });
      for (const dx of [-0.35, 0, 0.35]) g.circle(r * dx, r * 0.3, r * 0.06).fill(look.accent);
      // Dragon head rising from the tea.
      g.poly([-r * 0.2, -r * 0.62, -r * 0.3, -r * 0.88, -r * 0.08, -r * 0.7]).fill(c.counterTop).stroke({ width: w * 0.7, color: c.outline, join: 'round' });
      g.poly([r * 0.08, -r * 0.7, r * 0.3, -r * 0.88, r * 0.2, -r * 0.62]).fill(c.counterTop).stroke({ width: w * 0.7, color: c.outline, join: 'round' });
      g.circle(0, -r * 0.38, r * 0.33).fill(look.accent).stroke({ width: w, color: c.outline });
      g.ellipse(0, -r * 0.02, r * 0.7, r * 0.16).fill(c.floor).stroke({ width: w, color: c.outline });
      g.moveTo(-r * 0.3, -r * 0.08).quadraticCurveTo(0, -r * 0.16, r * 0.3, -r * 0.08).lineTo(r * 0.3, -r * 0.04).quadraticCurveTo(0, -r * 0.1, -r * 0.3, -r * 0.04).closePath().fill(look.accent);
      dotEyes(g, 0, -r * 0.42, r * 0.14, r * 0.065, c);
      g.circle(-r * 0.05, -r * 0.27, r * 0.025).fill(c.outline);
      g.circle(r * 0.05, -r * 0.27, r * 0.025).fill(c.outline);
      break;
    }
    case 'pillow': {
      // A puffy pillow with corner tassels and sleepy eyes.
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
        g.circle(sx * r * 0.74, sy * r * 0.5, r * 0.11).fill(look.accent).stroke({ width: w * 0.6, color: c.outline });
      }
      union(g, [(q) => q.roundRect(-r * 0.78, -r * 0.55, r * 1.56, r * 1.1, r * 0.42), (q) => q.ellipse(0, 0, r * 0.84, r * 0.48)], look.body, c.outline, w);
      g.moveTo(-r * 0.5, -r * 0.3).quadraticCurveTo(0, -r * 0.42, r * 0.5, -r * 0.3).stroke({ width: w * 0.5, color: c.outline, alpha: 0.35, cap: 'round' });
      for (const sx of [-1, 1]) g.moveTo(sx * r * 0.3, -r * 0.02).quadraticCurveTo(sx * r * 0.2, r * 0.07, sx * r * 0.1, -r * 0.02).stroke({ width: w * 0.8, color: c.outline, cap: 'round' });
      blush(g, 0, r * 0.12, r * 0.34, r * 0.07, c);
      g.ellipse(0, r * 0.2, r * 0.06, r * 0.05).fill(c.outline);
      g.moveTo(r * 0.5, -r * 0.82).lineTo(r * 0.68, -r * 0.82).lineTo(r * 0.5, -r * 0.64).lineTo(r * 0.68, -r * 0.64).stroke({ width: w * 0.7, color: c.outline, cap: 'round', join: 'round' });
      break;
    }
    case 'cactus': {
      // A hugging cactus in a little pot, a flower on top.
      g.roundRect(-r * 0.42, r * 0.42, r * 0.84, r * 0.46, r * 0.1).fill(c.counter).stroke({ width: w, color: c.outline });
      g.rect(-r * 0.48, r * 0.38, r * 0.96, r * 0.14).fill(c.counterTop).stroke({ width: w * 0.8, color: c.outline });
      union(
        g,
        [
          (q) => q.roundRect(-r * 0.36, -r * 0.7, r * 0.72, r * 1.12, r * 0.36),
          (q) => q.roundRect(-r * 0.78, -r * 0.25, r * 0.3, r * 0.5, r * 0.15),
          (q) => q.roundRect(-r * 0.7, r * 0.05, r * 0.42, r * 0.2, r * 0.1),
          (q) => q.roundRect(r * 0.48, -r * 0.45, r * 0.3, r * 0.5, r * 0.15),
          (q) => q.roundRect(r * 0.28, -r * 0.15, r * 0.42, r * 0.2, r * 0.1),
        ],
        look.body,
        c.outline,
        w,
      );
      for (const [dx, dy] of [[-0.18, -0.48], [0.2, -0.36], [-0.22, 0.25], [0.22, 0.2], [-0.62, -0.1], [0.62, -0.3]] as const) {
        g.moveTo(r * dx - r * 0.04, r * dy).lineTo(r * dx + r * 0.04, r * dy).stroke({ width: w * 0.5, color: c.outline, cap: 'round' });
      }
      for (let i = 0; i < 5; i++) {
        const a = (Math.PI * 2 * i) / 5 - Math.PI / 2;
        g.circle(Math.cos(a) * r * 0.13, -r * 0.78 + Math.sin(a) * r * 0.13, r * 0.1).fill(look.accent).stroke({ width: w * 0.5, color: c.outline });
      }
      g.circle(0, -r * 0.78, r * 0.07).fill(c.counterTop);
      face(g, -r * 0.12, r, c, w);
      break;
    }
    case 'shroom': {
      // An umbrella mushroom: spotted cap, a stem with a face, a little handle curl.
      g.moveTo(r * 0.12, r * 0.72).quadraticCurveTo(r * 0.12, r * 0.95, r * 0.32, r * 0.9).stroke({ width: w * 2.2, color: c.outline, cap: 'round' });
      g.moveTo(r * 0.12, r * 0.72).quadraticCurveTo(r * 0.12, r * 0.95, r * 0.32, r * 0.9).stroke({ width: w * 0.9, color: look.accent, cap: 'round' });
      g.roundRect(-r * 0.32, -r * 0.12, r * 0.64, r * 0.86, r * 0.28).fill(look.accent).stroke({ width: w, color: c.outline });
      g.moveTo(-r * 0.92, -r * 0.05).quadraticCurveTo(-r * 0.86, -r * 0.92, 0, -r * 0.92).quadraticCurveTo(r * 0.86, -r * 0.92, r * 0.92, -r * 0.05);
      // Scalloped rim, right to left.
      for (const [cx, x] of [[0.69, 0.46], [0.23, 0], [-0.23, -0.46], [-0.69, -0.92]] as const) g.quadraticCurveTo(r * cx, r * 0.1, r * x, -r * 0.05);
      g.closePath().fill(look.body).stroke({ width: w, color: c.outline, join: 'round' });
      for (const [dx, dy, s] of [[-0.48, -0.42, 0.13], [0.05, -0.62, 0.15], [0.5, -0.35, 0.11], [-0.12, -0.28, 0.08]] as const) g.circle(r * dx, r * dy, r * s).fill(c.eyeWhite);
      face(g, r * 0.3, r * 0.85, c, w);
      break;
    }
    case 'donut': {
      // A moon donut: a ring with icing and sprinkles, a crescent glow behind.
      g.circle(r * 0.18, -r * 0.08, r * 0.95).fill({ color: look.accent, alpha: 0.18 });
      g.circle(0, 0, r * 0.82).fill(c.counterTop).stroke({ width: w, color: c.outline });
      g.moveTo(-r * 0.8, r * 0.02)
        .bezierCurveTo(-r * 0.86, -r * 0.62, -r * 0.4, -r * 0.84, 0, -r * 0.84)
        .bezierCurveTo(r * 0.4, -r * 0.84, r * 0.86, -r * 0.62, r * 0.8, r * 0.02)
        .quadraticCurveTo(r * 0.62, r * 0.24, r * 0.45, r * 0.05)
        .quadraticCurveTo(r * 0.28, r * 0.3, 0, r * 0.12)
        .quadraticCurveTo(-r * 0.28, r * 0.3, -r * 0.45, r * 0.05)
        .quadraticCurveTo(-r * 0.62, r * 0.24, -r * 0.8, r * 0.02)
        .closePath()
        .fill(look.body)
        .stroke({ width: w, color: c.outline, join: 'round' });
      g.circle(0, -r * 0.18, r * 0.22).fill(c.wall).stroke({ width: w, color: c.outline });
      const sprinkles = [[-0.5, -0.45, 0.6], [-0.25, -0.62, -0.4], [0.3, -0.6, 0.3], [0.55, -0.35, -0.7], [-0.6, -0.12, 1.2], [0.5, -0.05, 0.9]] as const;
      for (const [dx, dy, a] of sprinkles) {
        g.moveTo(r * dx - Math.cos(a) * r * 0.06, r * dy - Math.sin(a) * r * 0.06)
          .lineTo(r * dx + Math.cos(a) * r * 0.06, r * dy + Math.sin(a) * r * 0.06)
          .stroke({ width: w * 0.8, color: dx > 0 ? look.accent : c.rarityRare, cap: 'round' });
      }
      face(g, r * 0.45, r * 0.9, c, w);
      sparkle(g, r * 0.82, -r * 0.72, r * 0.14, look.accent);
      break;
    }
    // ---- M6-02: eighteen more species (docs/01a §3: 30 by M5), the same flat style: a body, a face, one thing that tells it.
    case 'mitten': {
      // A mitten seal: the thumb is a flipper, a knitted cuff, whiskers.
      union(g, [(q) => q.roundRect(-r * 0.5, -r * 0.72, r * 1.0, r * 1.2, r * 0.48), (q) => q.ellipse(-r * 0.62, -r * 0.05, r * 0.24, r * 0.34)], look.body, c.outline, w);
      g.roundRect(-r * 0.56, r * 0.38, r * 1.12, r * 0.36, r * 0.12).fill(look.accent).stroke({ width: w, color: c.outline });
      for (const dx of [-0.36, -0.12, 0.12, 0.36]) g.moveTo(r * dx, r * 0.44).lineTo(r * dx, r * 0.68).stroke({ width: w * 0.5, color: c.outline, alpha: 0.4, cap: 'round' });
      face(g, -r * 0.2, r, c, w);
      for (const sx of [-1, 1]) g.moveTo(sx * r * 0.18, -r * 0.06).lineTo(sx * r * 0.42, -r * 0.1).stroke({ width: w * 0.45, color: c.outline, cap: 'round' });
      break;
    }
    case 'button': {
      // A button bug: the button is its back (four holes), six tiny legs, two feelers.
      for (const sx of [-1, 1]) {
        g.moveTo(sx * r * 0.18, -r * 0.6).lineTo(sx * r * 0.34, -r * 0.92).stroke({ width: w * 0.8, color: c.outline, cap: 'round' });
        g.circle(sx * r * 0.34, -r * 0.92, r * 0.07).fill(look.accent).stroke({ width: w * 0.6, color: c.outline });
        for (const dy of [0.1, 0.3, 0.5]) g.moveTo(sx * r * 0.6, r * dy).lineTo(sx * r * 0.82, r * (dy + 0.12)).stroke({ width: w * 0.8, color: c.outline, cap: 'round' });
      }
      g.circle(0, r * 0.05, r * 0.7).fill(look.body).stroke({ width: w, color: c.outline });
      g.circle(0, r * 0.05, r * 0.56).stroke({ width: w * 0.6, color: c.outline, alpha: 0.35 });
      for (const [dx, dy] of [[-0.14, -0.3], [0.14, -0.3], [-0.14, -0.08], [0.14, -0.08]] as const) g.circle(r * dx, r * dy, r * 0.06).fill(c.outline);
      face(g, r * 0.3, r * 0.8, c, w);
      break;
    }
    case 'clip': {
      // A paperclip snake: two loops of wire, the head at the end.
      const wire = (q: Graphics, width: number, color: string): void => {
        q.moveTo(r * 0.3, r * 0.62).lineTo(-r * 0.5, r * 0.62).quadraticCurveTo(-r * 0.78, r * 0.62, -r * 0.78, r * 0.34).lineTo(-r * 0.78, -r * 0.34)
          .quadraticCurveTo(-r * 0.78, -r * 0.62, -r * 0.5, -r * 0.62).lineTo(r * 0.36, -r * 0.62).quadraticCurveTo(r * 0.62, -r * 0.62, r * 0.62, -r * 0.36)
          .lineTo(r * 0.62, r * 0.12).quadraticCurveTo(r * 0.62, r * 0.36, r * 0.38, r * 0.36).lineTo(-r * 0.3, r * 0.36).quadraticCurveTo(-r * 0.5, r * 0.36, -r * 0.5, r * 0.16)
          .lineTo(-r * 0.5, -r * 0.2)
          .stroke({ width, color, cap: 'round', join: 'round' });
      };
      wire(g, w * 4.2, c.outline);
      wire(g, w * 2.2, look.body);
      g.ellipse(-r * 0.5, -r * 0.3, r * 0.3, r * 0.26).fill(look.body).stroke({ width: w, color: c.outline });
      g.moveTo(-r * 0.5, -r * 0.04).lineTo(-r * 0.5, r * 0.08).stroke({ width: w * 0.6, color: look.accent, cap: 'round' });
      dotEyes(g, -r * 0.5, -r * 0.36, r * 0.12, r * 0.06, c);
      blush(g, -r * 0.5, -r * 0.24, r * 0.2, r * 0.05, c);
      break;
    }
    case 'slipper': {
      // A slipper pup: the sole, a fluffy top, two floppy ears, the nose at the toe.
      g.ellipse(0, r * 0.52, r * 0.9, r * 0.22).fill(look.accent).stroke({ width: w, color: c.outline });
      union(g, [(q) => q.ellipse(r * 0.1, r * 0.2, r * 0.78, r * 0.38), (q) => q.circle(r * 0.32, -r * 0.18, r * 0.38)], look.body, c.outline, w);
      for (const sx of [-1, 1]) g.ellipse(r * 0.32 + sx * r * 0.42, -r * 0.1, r * 0.13, r * 0.28).fill(look.accent).stroke({ width: w * 0.8, color: c.outline });
      g.ellipse(-r * 0.42, r * 0.16, r * 0.26, r * 0.16).fill({ color: c.outline, alpha: 0.18 });
      face(g, -r * 0.2, r * 0.8, c, w, r * 0.32);
      g.ellipse(r * 0.32, -r * 0.06, r * 0.07, r * 0.05).fill(c.outline);
      break;
    }
    case 'yarn': {
      // A yarn lamb: a ball of wool with curls, little horns, a loose thread.
      g.moveTo(r * 0.55, r * 0.5).bezierCurveTo(r * 0.9, r * 0.6, r * 0.7, r * 0.9, r * 0.98, r * 0.86).stroke({ width: w * 1.2, color: look.body, cap: 'round' });
      const curls = [[-0.55, -0.35], [0, -0.62], [0.55, -0.35], [-0.66, 0.15], [0.66, 0.15], [-0.36, 0.55], [0.36, 0.55]] as const;
      union(g, [(q) => q.circle(0, 0, r * 0.66), ...curls.map(([dx, dy]) => (q: Graphics) => q.circle(r * dx, r * dy, r * 0.2))], look.body, c.outline, w);
      for (const a of [-0.6, 0, 0.6]) g.moveTo(-r * 0.5, r * (a - 0.1)).quadraticCurveTo(0, r * (a + 0.3), r * 0.5, r * (a - 0.1)).stroke({ width: w * 0.5, color: c.outline, alpha: 0.3, cap: 'round' });
      for (const sx of [-1, 1]) g.circle(sx * r * 0.42, -r * 0.42, r * 0.12).stroke({ width: w * 1.6, color: look.accent });
      g.ellipse(0, r * 0.02, r * 0.4, r * 0.3).fill(c.counterTop).stroke({ width: w * 0.8, color: c.outline });
      face(g, -r * 0.02, r * 0.8, c, w);
      break;
    }
    case 'eraser': {
      // An eraser hamster: a two-color block with round ears and big cheeks.
      for (const sx of [-1, 1]) g.circle(sx * r * 0.42, -r * 0.6, r * 0.18).fill(look.body).stroke({ width: w, color: c.outline });
      g.roundRect(-r * 0.66, -r * 0.6, r * 1.32, r * 1.2, r * 0.26).fill(look.body).stroke({ width: w, color: c.outline });
      g.roundRect(-r * 0.66, r * 0.16, r * 1.32, r * 0.44, r * 0.2).fill(look.accent).stroke({ width: w, color: c.outline });
      g.rect(-r * 0.6, r * 0.16, r * 1.2, r * 0.12).fill(look.accent);
      g.ellipse(-r * 0.36, -r * 0.62 + r * 0.03, r * 0.08, r * 0.08).fill(c.blush);
      g.ellipse(r * 0.36, -r * 0.62 + r * 0.03, r * 0.08, r * 0.08).fill(c.blush);
      for (const sx of [-1, 1]) g.ellipse(sx * r * 0.4, -r * 0.08, r * 0.2, r * 0.16).fill({ color: c.blush, alpha: 0.9 });
      dotEyes(g, 0, -r * 0.26, r * 0.22, r * 0.075, c);
      g.poly([-r * 0.06, -r * 0.12, r * 0.06, -r * 0.12, 0, -r * 0.05]).fill(c.outline);
      g.rect(-r * 0.06, -r * 0.04, r * 0.05, r * 0.08).fill(c.eyeWhite).stroke({ width: w * 0.4, color: c.outline });
      g.rect(r * 0.01, -r * 0.04, r * 0.05, r * 0.08).fill(c.eyeWhite).stroke({ width: w * 0.4, color: c.outline });
      break;
    }
    case 'owl': {
      // An alarm-clock owl: two bells for ears, clock-face eyes, a beak, feet.
      for (const sx of [-1, 1]) {
        g.moveTo(sx * r * 0.3, -r * 0.62).lineTo(sx * r * 0.42, -r * 0.74).stroke({ width: w, color: c.outline });
        g.moveTo(sx * r * 0.16, -r * 0.78).quadraticCurveTo(sx * r * 0.5, -r * 1.1, sx * r * 0.72, -r * 0.62).closePath().fill(look.accent).stroke({ width: w, color: c.outline, join: 'round' });
        g.ellipse(sx * r * 0.25, r * 0.78, r * 0.14, r * 0.07).fill(look.accent).stroke({ width: w * 0.8, color: c.outline });
      }
      g.circle(0, 0, r * 0.74).fill(look.body).stroke({ width: w, color: c.outline });
      for (const sx of [-1, 1]) {
        g.circle(sx * r * 0.28, -r * 0.1, r * 0.22).fill(c.eyeWhite).stroke({ width: w * 0.8, color: c.outline });
        g.circle(sx * r * 0.28, -r * 0.1, r * 0.1).fill(c.outline);
        g.circle(sx * r * 0.28 + r * 0.04, -r * 0.14, r * 0.035).fill(c.eyeWhite);
      }
      g.poly([-r * 0.08, r * 0.12, r * 0.08, r * 0.12, 0, r * 0.26]).fill(look.accent).stroke({ width: w * 0.6, color: c.outline, join: 'round' });
      g.moveTo(0, r * 0.38).lineTo(0, r * 0.54).moveTo(0, r * 0.54).lineTo(r * 0.12, r * 0.6).stroke({ width: w * 0.7, color: c.outline, cap: 'round' });
      blush(g, 0, r * 0.2, r * 0.44, r * 0.06, c);
      break;
    }
    case 'bubblefish': {
      // A bubble fish: a see-through bubble with a little fish inside.
      g.circle(0, 0, r * 0.84).fill({ color: look.accent, alpha: 0.6 }).stroke({ width: w, color: c.outline });
      g.ellipse(-r * 0.38, -r * 0.42, r * 0.18, r * 0.1).fill({ color: c.eyeWhite, alpha: 0.9 });
      g.poly([r * 0.3, r * 0.08, r * 0.62, -r * 0.18, r * 0.62, r * 0.34]).fill(look.body).stroke({ width: w * 0.8, color: c.outline, join: 'round' });
      g.ellipse(-r * 0.05, r * 0.08, r * 0.42, r * 0.3).fill(look.body).stroke({ width: w, color: c.outline });
      g.poly([-r * 0.1, -r * 0.2, r * 0.14, -r * 0.36, r * 0.12, -r * 0.18]).fill(look.body).stroke({ width: w * 0.6, color: c.outline, join: 'round' });
      dotEyes(g, -r * 0.16, r * 0.0, r * 0.1, r * 0.055, c);
      blush(g, -r * 0.16, r * 0.1, r * 0.17, r * 0.045, c);
      g.circle(r * 0.5, -r * 0.6, r * 0.07).stroke({ width: w * 0.6, color: c.outline, alpha: 0.6 });
      g.circle(r * 0.66, -r * 0.8, r * 0.05).stroke({ width: w * 0.6, color: c.outline, alpha: 0.5 });
      break;
    }
    case 'mug': {
      // A mug cub: bear ears on the rim, a handle, steam over it.
      for (const dx of [-0.2, 0.15]) g.moveTo(r * dx, -r * 0.82).quadraticCurveTo(r * (dx + 0.12), -r * 0.96, r * dx, -r * 1.08).stroke({ width: w * 0.8, color: c.outline, alpha: 0.35, cap: 'round' });
      g.circle(r * 0.66, r * 0.08, r * 0.24).stroke({ width: w * 3.4, color: c.outline });
      g.circle(r * 0.66, r * 0.08, r * 0.24).stroke({ width: w * 1.4, color: look.body });
      for (const sx of [-1, 1]) {
        g.circle(sx * r * 0.42, -r * 0.6, r * 0.17).fill(look.body).stroke({ width: w, color: c.outline });
        g.circle(sx * r * 0.42, -r * 0.6, r * 0.08).fill(look.accent);
      }
      g.roundRect(-r * 0.6, -r * 0.62, r * 1.2, r * 1.36, r * 0.22).fill(look.body).stroke({ width: w, color: c.outline });
      g.ellipse(0, -r * 0.56, r * 0.5, r * 0.1).fill(look.accent).stroke({ width: w * 0.7, color: c.outline });
      g.ellipse(0, r * 0.1, r * 0.24, r * 0.18).fill(c.counterTop).stroke({ width: w * 0.6, color: c.outline });
      face(g, -r * 0.08, r * 0.9, c, w);
      g.ellipse(0, r * 0.04, r * 0.06, r * 0.04).fill(c.outline);
      break;
    }
    case 'snail': {
      // A rainbow snail: a soft body, eye stalks, a shell of colored arcs.
      g.moveTo(-r * 0.62, -r * 0.1).lineTo(-r * 0.74, -r * 0.5).moveTo(-r * 0.46, -r * 0.08).lineTo(-r * 0.46, -r * 0.5).stroke({ width: w * 0.8, color: c.outline, cap: 'round' });
      g.circle(-r * 0.74, -r * 0.54, r * 0.07).fill(c.outline);
      g.circle(-r * 0.46, -r * 0.54, r * 0.07).fill(c.outline);
      union(g, [(q) => q.roundRect(-r * 0.9, r * 0.36, r * 1.7, r * 0.34, r * 0.17), (q) => q.ellipse(-r * 0.56, r * 0.18, r * 0.24, r * 0.3)], look.accent, c.outline, w);
      const arcs = [look.body, c.rarityRare, c.uiGood, c.blush] as const;
      for (let i = 0; i < arcs.length; i++) g.circle(r * 0.18, -r * 0.04, r * (0.56 - i * 0.12)).fill(arcs[i]!).stroke({ width: w * (i ? 0.5 : 1), color: c.outline });
      dotEyes(g, -r * 0.56, r * 0.16, r * 0.08, r * 0.045, c);
      smile(g, -r * 0.56, r * 0.28, r * 0.06, r * 0.05, c, w * 0.6);
      break;
    }
    case 'piano': {
      // A piano dachshund: a long body with keys along it, a dog head, floppy ear, short legs.
      for (const dx of [-0.6, -0.3, 0.2, 0.5]) g.roundRect(r * dx, r * 0.36, r * 0.14, r * 0.3, r * 0.06).fill(look.body).stroke({ width: w * 0.8, color: c.outline });
      g.moveTo(-r * 0.86, -r * 0.08).quadraticCurveTo(-r * 1.04, -r * 0.3, -r * 0.94, -r * 0.42).stroke({ width: w * 1.4, color: c.outline, cap: 'round' });
      g.roundRect(-r * 0.92, -r * 0.18, r * 1.5, r * 0.6, r * 0.24).fill(look.body).stroke({ width: w, color: c.outline });
      g.rect(-r * 0.76, r * 0.02, r * 1.2, r * 0.26).fill(c.eyeWhite).stroke({ width: w * 0.6, color: c.outline });
      for (let i = 1; i < 8; i++) g.rect(-r * 0.76 + i * r * 0.15 - r * 0.025, r * 0.02, r * 0.05, i % 3 === 0 ? r * 0.26 : r * 0.16).fill(c.outline);
      g.circle(r * 0.58, -r * 0.3, r * 0.34).fill(look.body).stroke({ width: w, color: c.outline });
      g.ellipse(r * 0.86, -r * 0.2, r * 0.18, r * 0.12).fill(look.body).stroke({ width: w * 0.8, color: c.outline });
      g.circle(r * 1.0, -r * 0.22, r * 0.05).fill(c.outline);
      g.ellipse(r * 0.38, -r * 0.2, r * 0.12, r * 0.24).fill(look.accent).stroke({ width: w * 0.8, color: c.outline });
      dotEyes(g, r * 0.66, -r * 0.38, r * 0.08, r * 0.05, c);
      break;
    }
    case 'book': {
      // A book butterfly: the open pages are wings, a little body with feelers in the spine.
      for (const sx of [-1, 1]) {
        g.moveTo(0, -r * 0.5).quadraticCurveTo(sx * r * 0.5, -r * 0.82, sx * r * 0.92, -r * 0.56).lineTo(sx * r * 0.92, r * 0.46).quadraticCurveTo(sx * r * 0.5, r * 0.22, 0, r * 0.5).closePath()
          .fill(look.body).stroke({ width: w, color: c.outline, join: 'round' });
        g.moveTo(0, -r * 0.4).quadraticCurveTo(sx * r * 0.46, -r * 0.68, sx * r * 0.82, -r * 0.46).lineTo(sx * r * 0.82, r * 0.36).quadraticCurveTo(sx * r * 0.46, r * 0.12, 0, r * 0.4).closePath().fill(c.eyeWhite);
        for (const dy of [-0.3, -0.1, 0.1]) g.moveTo(sx * r * 0.2, r * dy - r * 0.08).quadraticCurveTo(sx * r * 0.45, r * dy - r * 0.2, sx * r * 0.7, r * dy - r * 0.08).stroke({ width: w * 0.45, color: c.outline, alpha: 0.4, cap: 'round' });
        g.moveTo(sx * r * 0.06, -r * 0.48).lineTo(sx * r * 0.22, -r * 0.88).stroke({ width: w * 0.7, color: c.outline, cap: 'round' });
        g.circle(sx * r * 0.22, -r * 0.88, r * 0.06).fill(look.accent).stroke({ width: w * 0.5, color: c.outline });
      }
      g.roundRect(-r * 0.14, -r * 0.5, r * 0.28, r * 1.0, r * 0.14).fill(look.accent).stroke({ width: w, color: c.outline });
      dotEyes(g, 0, -r * 0.3, r * 0.06, r * 0.04, c);
      smile(g, 0, -r * 0.2, r * 0.04, r * 0.035, c, w * 0.5);
      break;
    }
    case 'fox': {
      // A comet fox: a fox face, the tail streams back like a comet with sparkles.
      g.moveTo(-r * 0.2, r * 0.34).bezierCurveTo(-r * 0.7, r * 0.5, -r * 0.9, -r * 0.1, -r * 1.0, -r * 0.5).bezierCurveTo(-r * 0.62, -r * 0.2, -r * 0.4, r * 0.1, -r * 0.1, r * 0.1).closePath()
        .fill(look.accent).stroke({ width: w, color: c.outline, join: 'round' });
      sparkle(g, -r * 0.88, -r * 0.6, r * 0.14, c.eyeWhite);
      sparkle(g, -r * 0.62, -r * 0.2, r * 0.09, c.eyeWhite);
      union(
        g,
        [(q) => q.ellipse(r * 0.1, r * 0.36, r * 0.46, r * 0.34), (q) => q.circle(r * 0.18, -r * 0.18, r * 0.42), (q) => q.poly([-r * 0.18, -r * 0.3, -r * 0.1, -r * 0.82, r * 0.16, -r * 0.5]), (q) => q.poly([r * 0.2, -r * 0.5, r * 0.46, -r * 0.82, r * 0.54, -r * 0.3])],
        look.body,
        c.outline,
        w,
      );
      g.ellipse(r * 0.18, -r * 0.02, r * 0.26, r * 0.18).fill(c.eyeWhite);
      g.ellipse(r * 0.18, r * 0.4, r * 0.22, r * 0.2).fill({ color: c.eyeWhite, alpha: 0.8 });
      dotEyes(g, r * 0.18, -r * 0.2, r * 0.14, r * 0.065, c);
      g.ellipse(r * 0.18, -r * 0.04, r * 0.06, r * 0.045).fill(c.outline);
      blush(g, r * 0.18, -r * 0.08, r * 0.28, r * 0.05, c);
      break;
    }
    case 'jelly': {
      // A lantern jellyfish: a glowing dome, a little handle on top, wavy tentacles.
      g.circle(0, -r * 0.1, r * 0.9).fill({ color: look.accent, alpha: 0.18 });
      for (const dx of [-0.42, -0.14, 0.14, 0.42]) {
        g.moveTo(r * dx, r * 0.1).quadraticCurveTo(r * (dx - 0.1), r * 0.36, r * dx, r * 0.56).quadraticCurveTo(r * (dx + 0.1), r * 0.72, r * dx, r * 0.88)
          .stroke({ width: w * 1.6, color: c.outline, cap: 'round' });
        g.moveTo(r * dx, r * 0.1).quadraticCurveTo(r * (dx - 0.1), r * 0.36, r * dx, r * 0.56).quadraticCurveTo(r * (dx + 0.1), r * 0.72, r * dx, r * 0.88)
          .stroke({ width: w * 0.6, color: look.accent, cap: 'round' });
      }
      g.moveTo(-r * 0.12, -r * 0.7).quadraticCurveTo(0, -r * 0.98, r * 0.12, -r * 0.7).stroke({ width: w, color: c.outline, cap: 'round' });
      g.moveTo(-r * 0.66, r * 0.16).quadraticCurveTo(-r * 0.7, -r * 0.72, 0, -r * 0.72).quadraticCurveTo(r * 0.7, -r * 0.72, r * 0.66, r * 0.16).quadraticCurveTo(0, r * 0.3, -r * 0.66, r * 0.16).closePath()
        .fill(look.body).stroke({ width: w, color: c.outline, join: 'round' });
      g.ellipse(-r * 0.28, -r * 0.42, r * 0.12, r * 0.07).fill({ color: c.eyeWhite, alpha: 0.85 });
      face(g, -r * 0.12, r * 0.9, c, w);
      break;
    }
    case 'turtle': {
      // A globe turtle: the shell is a little globe with lands and lines, a head and feet.
      for (const [dx, dy] of [[-0.56, 0.5], [0.56, 0.5]] as const) g.ellipse(r * dx, r * dy, r * 0.18, r * 0.12).fill(look.accent).stroke({ width: w * 0.8, color: c.outline });
      g.circle(r * 0.78, r * 0.02, r * 0.24).fill(look.accent).stroke({ width: w, color: c.outline });
      dotEyes(g, r * 0.82, -r * 0.02, r * 0.08, r * 0.045, c);
      smile(g, r * 0.82, r * 0.08, r * 0.05, r * 0.04, c, w * 0.6);
      g.circle(-r * 0.04, r * 0.06, r * 0.62).fill(look.body).stroke({ width: w, color: c.outline });
      g.ellipse(-r * 0.04, r * 0.06, r * 0.26, r * 0.62).stroke({ width: w * 0.5, color: c.outline, alpha: 0.4 });
      g.moveTo(-r * 0.66, r * 0.06).lineTo(r * 0.58, r * 0.06).stroke({ width: w * 0.5, color: c.outline, alpha: 0.4 });
      for (const [dx, dy, sx, sy] of [[-0.3, -0.24, 0.2, 0.14], [0.2, 0.3, 0.22, 0.12], [-0.28, 0.34, 0.1, 0.08]] as const) g.ellipse(r * dx, r * dy, r * sx, r * sy).fill(c.uiGood);
      g.rect(-r * 0.66, r * 0.58, r * 1.24, r * 0.1).fill(look.accent).stroke({ width: w * 0.6, color: c.outline });
      break;
    }
    case 'bun': {
      // A sun bun: a round bun with rays, glaze and seeds.
      for (let i = 0; i < 10; i++) {
        const a = (Math.PI * 2 * i) / 10;
        const x0 = Math.cos(a) * r * 0.66;
        const y0 = Math.sin(a) * r * 0.66;
        g.poly([x0 + Math.cos(a + 1.6) * r * 0.12, y0 + Math.sin(a + 1.6) * r * 0.12, Math.cos(a) * r * 0.96, Math.sin(a) * r * 0.96, x0 + Math.cos(a - 1.6) * r * 0.12, y0 + Math.sin(a - 1.6) * r * 0.12])
          .fill(look.accent).stroke({ width: w * 0.6, color: c.outline, join: 'round' });
      }
      g.circle(0, 0, r * 0.68).fill(look.body).stroke({ width: w, color: c.outline });
      g.moveTo(-r * 0.56, -r * 0.18).quadraticCurveTo(0, -r * 0.62, r * 0.56, -r * 0.18).quadraticCurveTo(0, -r * 0.34, -r * 0.56, -r * 0.18).closePath().fill({ color: c.eyeWhite, alpha: 0.7 });
      for (const [dx, dy] of [[-0.24, -0.4], [0.06, -0.48], [0.3, -0.36]] as const) g.ellipse(r * dx, r * dy, r * 0.04, r * 0.025).fill(c.counterTop);
      face(g, r * 0.06, r, c, w);
      break;
    }
    case 'deer': {
      // A crystal deer: a soft deer face with crystal antlers and a sparkle.
      for (const sx of [-1, 1]) {
        g.poly([sx * r * 0.2, -r * 0.5, sx * r * 0.36, -r * 1.0, sx * r * 0.46, -r * 0.56]).fill(look.accent).stroke({ width: w * 0.8, color: c.outline, join: 'round' });
        g.poly([sx * r * 0.34, -r * 0.74, sx * r * 0.72, -r * 0.98, sx * r * 0.5, -r * 0.62]).fill(look.accent).stroke({ width: w * 0.8, color: c.outline, join: 'round' });
        g.ellipse(sx * r * 0.62, -r * 0.3, r * 0.22, r * 0.11).fill(look.body).stroke({ width: w * 0.8, color: c.outline });
      }
      union(g, [(q) => q.circle(0, -r * 0.18, r * 0.44), (q) => q.ellipse(0, r * 0.12, r * 0.3, r * 0.3), (q) => q.roundRect(-r * 0.4, r * 0.3, r * 0.8, r * 0.5, r * 0.25)], look.body, c.outline, w);
      g.ellipse(0, r * 0.14, r * 0.2, r * 0.14).fill(c.eyeWhite);
      g.ellipse(0, r * 0.08, r * 0.07, r * 0.05).fill(c.outline);
      for (const [dx, dy] of [[-0.24, 0.48], [0.22, 0.58], [0.0, 0.66]] as const) g.circle(r * dx, r * dy, r * 0.045).fill(c.eyeWhite);
      dotEyes(g, 0, -r * 0.18, r * 0.18, r * 0.07, c);
      blush(g, 0, -r * 0.04, r * 0.3, r * 0.05, c);
      sparkle(g, r * 0.7, -r * 0.82, r * 0.12, c.eyeWhite);
      break;
    }
    case 'phoenix': {
      // A clock phoenix: a round clock with hands for a body, flame wings and a crest.
      for (const sx of [-1, 1]) {
        g.moveTo(sx * r * 0.42, -r * 0.2).quadraticCurveTo(sx * r * 1.02, -r * 0.6, sx * r * 0.94, r * 0.0).quadraticCurveTo(sx * r * 0.84, -r * 0.08, sx * r * 0.84, r * 0.2)
          .quadraticCurveTo(sx * r * 0.7, r * 0.1, sx * r * 0.6, r * 0.34).closePath().fill(look.accent).stroke({ width: w * 0.8, color: c.outline, join: 'round' });
      }
      for (const [dx, h] of [[-0.14, 0.86], [0, 1.0], [0.14, 0.86]] as const) {
        g.moveTo(r * dx - r * 0.06, -r * 0.56).quadraticCurveTo(r * dx, -r * (h + 0.06), r * dx + r * 0.06, -r * 0.56).closePath().fill(look.accent).stroke({ width: w * 0.6, color: c.outline, join: 'round' });
      }
      g.circle(0, 0, r * 0.6).fill(look.body).stroke({ width: w, color: c.outline });
      g.circle(0, 0, r * 0.46).fill(c.eyeWhite).stroke({ width: w * 0.6, color: c.outline });
      for (let i = 0; i < 12; i++) {
        const a = (Math.PI * 2 * i) / 12;
        g.circle(Math.cos(a) * r * 0.38, Math.sin(a) * r * 0.38, r * (i % 3 === 0 ? 0.035 : 0.02)).fill(c.outline);
      }
      g.moveTo(0, r * 0.12).lineTo(0, -r * 0.26).moveTo(0, r * 0.12).lineTo(r * 0.18, r * 0.2).stroke({ width: w * 0.7, color: c.outline, cap: 'round' });
      dotEyes(g, 0, -r * 0.04, r * 0.2, r * 0.05, c);
      g.poly([-r * 0.05, r * 0.02, r * 0.05, r * 0.02, 0, r * 0.1]).fill(look.accent);
      g.moveTo(-r * 0.12, r * 0.66).lineTo(-r * 0.12, r * 0.82).moveTo(r * 0.12, r * 0.66).lineTo(r * 0.12, r * 0.82).stroke({ width: w * 0.9, color: c.outline, cap: 'round' });
      break;
    }
  }
}

/** A customer standing with the feet at 0,0 (height about 2.1 r); the hat tells the type (thrifty cap, collector beret, rich top hat); an accessory makes the person (M2-18). */
export function drawCustomer(g: Graphics, type: string, look: { body: string; accent: string }, r: number, c: Colors, outline: number, accessory = 'none'): void {
  const w = outline;
  g.clear();
  if (accessory === 'backpack') g.roundRect(-r * 0.86, -r * 1.25, r * 0.4, r * 0.8, r * 0.15).fill(look.accent).stroke({ width: w * 0.8, color: c.outline });
  if (accessory === 'umbrella') {
    g.moveTo(r * 0.78, -r * 0.2).lineTo(r * 0.78, -r * 1.55).stroke({ width: w * 0.8, color: c.outline, cap: 'round' });
    g.moveTo(r * 0.78, -r * 0.2).quadraticCurveTo(r * 0.78, -r * 0.02, r * 0.62, -r * 0.08).stroke({ width: w * 0.8, color: c.outline, cap: 'round' });
    g.moveTo(r * 0.38, -r * 1.5).quadraticCurveTo(r * 0.78, -r * 1.95, r * 1.18, -r * 1.5).closePath().fill(c.rarityRare).stroke({ width: w * 0.7, color: c.outline, join: 'round' });
  }
  g.ellipse(0, 0, r * 0.75, r * 0.2).fill({ color: c.outline, alpha: 0.18 });
  g.ellipse(-r * 0.28, -r * 0.08, r * 0.2, r * 0.12).fill(c.outline);
  g.ellipse(r * 0.28, -r * 0.08, r * 0.2, r * 0.12).fill(c.outline);
  g.roundRect(-r * 0.62, -r * 1.7, r * 1.24, r * 1.62, r * 0.6).fill(look.body).stroke({ width: w, color: c.outline });
  g.ellipse(0, -r * 0.55, r * 0.38, r * 0.3).fill({ color: c.eyeWhite, alpha: 0.35 });
  dotEyes(g, 0, -r * 1.22, r * 0.2, r * 0.08, c);
  blush(g, 0, -r * 1.08, r * 0.34, r * 0.07, c);
  smile(g, 0, -r * 1.06, r * 0.1, r * 0.07, c, w * 0.7);
  if (accessory === 'glasses') {
    for (const dx of [-0.2, 0.2]) g.circle(r * dx, -r * 1.22, r * 0.14).stroke({ width: w * 0.6, color: c.outline });
    g.moveTo(-r * 0.06, -r * 1.22).lineTo(r * 0.06, -r * 1.22).stroke({ width: w * 0.6, color: c.outline });
  } else if (accessory === 'scarf') {
    g.roundRect(-r * 0.6, -r * 0.92, r * 1.2, r * 0.22, r * 0.1).fill(c.blush).stroke({ width: w * 0.6, color: c.outline });
    g.roundRect(r * 0.18, -r * 0.8, r * 0.2, r * 0.42, r * 0.08).fill(c.blush).stroke({ width: w * 0.6, color: c.outline });
  } else if (accessory === 'flower') {
    for (let i = 0; i < 5; i++) {
      const a = (Math.PI * 2 * i) / 5;
      g.circle(-r * 0.36 + Math.cos(a) * r * 0.1, -r * 0.62 + Math.sin(a) * r * 0.1, r * 0.08).fill(c.eyeWhite);
    }
    g.circle(-r * 0.36, -r * 0.62, r * 0.06).fill(c.counterTop);
  }
  if (type === 'golden') {
    // The golden customer of an event: a crown and a big coin over the head.
    g.poly([-r * 0.45, -r * 1.62, -r * 0.45, -r * 1.98, -r * 0.22, -r * 1.8, 0, -r * 2.05, r * 0.22, -r * 1.8, r * 0.45, -r * 1.98, r * 0.45, -r * 1.62])
      .fill(look.accent)
      .stroke({ width: w * 0.8, color: c.outline, join: 'round' });
    g.circle(0, -r * 2.55, r * 0.32).fill(c.uiAccent).stroke({ width: w * 0.8, color: c.outline });
    g.circle(0, -r * 2.55, r * 0.18).stroke({ width: w * 0.6, color: c.counterTop });
    sparkle(g, r * 0.75, -r * 1.5, r * 0.16, look.accent);
    sparkle(g, -r * 0.8, -r * 0.9, r * 0.12, look.accent);
  } else if (type === 'rich') {
    g.roundRect(-r * 0.5, -r * 1.86, r * 1.0, r * 0.12, r * 0.05).fill(c.outline);
    g.roundRect(-r * 0.32, -r * 2.36, r * 0.64, r * 0.54, r * 0.08).fill(c.outline);
    g.rect(-r * 0.32, -r * 1.98, r * 0.64, r * 0.1).fill(look.accent);
  } else if (type === 'collector') {
    g.ellipse(r * 0.05, -r * 1.72, r * 0.58, r * 0.2).fill(look.accent).stroke({ width: w * 0.8, color: c.outline });
    g.circle(r * 0.05, -r * 1.92, r * 0.07).fill(look.accent);
    g.circle(r * 0.2, -r * 1.22, r * 0.17).stroke({ width: w * 0.6, color: c.counterTop });
  } else {
    g.moveTo(-r * 0.56, -r * 1.6).quadraticCurveTo(0, -r * 2.15, r * 0.56, -r * 1.6).closePath().fill(look.accent).stroke({ width: w * 0.8, color: c.outline, join: 'round' });
    g.roundRect(r * 0.1, -r * 1.68, r * 0.62, r * 0.14, r * 0.07).fill(look.accent).stroke({ width: w * 0.6, color: c.outline });
    // A small purse: the thrifty one counts every coin.
    g.circle(r * 0.62, -r * 0.62, r * 0.2).fill(c.uiAccent).stroke({ width: w * 0.6, color: c.outline });
  }
}

/** An egg centred at 0,0 (height 1.44 r); cracks grow with the hatch share. */
export function drawEgg(g: Graphics, r: number, c: Colors, outline: number, share: number, look?: { shell: string; spots: string }): void {
  const shell = look?.shell ?? c.egg;
  const spots = look?.spots ?? c.eggSpots;
  const rx = r * 0.56;
  const ry = r * 0.72;
  g.clear();
  g.ellipse(0, 0, rx, ry).fill(shell).stroke({ width: outline, color: c.outline });
  g.circle(-rx * 0.3, -ry * 0.25, r * 0.12).fill(spots);
  g.circle(rx * 0.4, ry * 0.25, r * 0.1).fill(spots);
  g.circle(-rx * 0.15, ry * 0.45, r * 0.07).fill(spots);
  // Shine.
  g.ellipse(-rx * 0.45, -ry * 0.5, rx * 0.16, ry * 0.12).fill({ color: c.incubatorGlass, alpha: 0.9 });
  if (share > 0.45) {
    const w = Math.max(1.5, outline * 0.6);
    g.moveTo(-rx * 0.6, -ry * 0.05).lineTo(-rx * 0.25, ry * 0.12).lineTo(0, -ry * 0.08).lineTo(rx * 0.2, ry * 0.1).stroke({ width: w, color: c.outline, cap: 'round', join: 'round' });
  }
  if (share > 0.75) {
    const w = Math.max(1.5, outline * 0.6);
    g.moveTo(rx * 0.2, ry * 0.1).lineTo(rx * 0.5, -ry * 0.12).lineTo(rx * 0.75, ry * 0.02).stroke({ width: w, color: c.outline, cap: 'round', join: 'round' });
    g.moveTo(-rx * 0.1, -ry * 0.5).lineTo(rx * 0.05, -ry * 0.3).lineTo(-rx * 0.05, -ry * 0.15).stroke({ width: w, color: c.outline, cap: 'round', join: 'round' });
  }
}

/** Progress ring around an incubator dome: a faint track and the done part from 12 o'clock clockwise. */
export function drawRing(g: Graphics, x: number, y: number, r: number, share: number, c: Colors, width: number): void {
  g.circle(x, y, r).stroke({ width, color: c.outline, alpha: 0.18 });
  if (share <= 0) return;
  const a0 = -Math.PI / 2;
  const a1 = a0 + Math.PI * 2 * Math.min(1, share);
  g.moveTo(x + Math.cos(a0) * r, y + Math.sin(a0) * r)
    .arc(x, y, r, a0, a1)
    .stroke({ width, color: c.uiGood, cap: 'round' });
}
