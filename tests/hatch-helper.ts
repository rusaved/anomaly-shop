import type { Game } from '../src/sim/game.ts';

/** M3-02: a ready egg waits for a tap (it ripens meanwhile); tests of hatch timing and odds tap it at once, like a player. */
export function tickTapping(game: Game, dt: number): void {
  game.tick(dt);
  game.view().incubators.forEach((inc, i) => {
    if (inc.ready) game.tapIncubator(i);
  });
}
