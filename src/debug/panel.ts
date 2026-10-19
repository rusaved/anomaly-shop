// What: the ?debug=1 panel (lil-gui): coins, a test creature, the next city ready, time scale, save reset; dev, playtest and the producer link only.
// Called by: src/main.ts behind __DEBUG_TOOLS__ (dynamic import, dropped from releases).
// Keep: the panel talks to the store and runtime like a player action would; labels are developer English, never shown to players.

import GUI from 'lil-gui';
import type { Runtime } from '../core/runtime.ts';
import type { GameStore } from '../sim/store.ts';
import type { SaveData } from '../sim/state.ts';
import species from '@content/species.json';

export interface DebugHooks {
  store: GameStore;
  runtime: Runtime;
  /** content/feel.json, tuned live by the sliders (CLAUDE.md, «Как работать» p. 5). */
  feel: Record<string, unknown>;
  fps(): number;
  fresh(): SaveData;
  /** M4-09: coins earned up to the next move, so the producer can check the move without a day of play. */
  cityReady(): void;
}

let counter = 0;

export function installDebugPanel(h: DebugHooks): GUI {
  const gui = new GUI({ title: 'debug', width: 230 });
  const el = gui.domElement;
  el.style.position = 'fixed';
  el.style.top = 'var(--hud-height, 60px)';
  el.style.left = '0';
  el.style.right = 'auto';
  el.style.zIndex = '40';
  const actions = {
    coins100: () => {
      h.store.state.coins += 100;
      h.store.commit();
    },
    creature: () => {
      // Cycles through every species, so all portraits can be checked on the showcase (M1-03).
      const next = species.species[counter % species.species.length];
      if (!next) return;
      counter += 1;
      const uid = `dbg-${Date.now().toString(36)}-${counter}`;
      h.store.state.creatures.push({ uid, species: next.id, level: 1, fed: 0, hatchedAt: Date.now(), age: 0 });
      h.store.commit({ flush: true });
    },
    reset: () => h.store.replace(h.fresh()),
    city: () => h.cityReady(),
  };
  gui.add(actions, 'coins100').name('+100 coins');
  gui.add(actions, 'creature').name('+ creature');
  gui.add(actions, 'city').name('city ready');
  gui.add(h.runtime, 'timeScale', 0.25, 8, 0.25).name('time scale');
  gui.add(actions, 'reset').name('reset save');
  // Feel sliders: the producer tunes them, presses «copy feel JSON» and sends the text; it goes to content/feel.json.
  const feelFolder = gui.addFolder('feel');
  // FB-09: only the numbers get sliders (the burst levels stay in the copied JSON as they are).
  for (const key of Object.keys(h.feel).filter((k) => typeof h.feel[k] === 'number')) {
    const v = (h.feel[key] as number) ?? 0;
    const max = v >= 4 ? v * 3 : v >= 1 ? 4 : 1;
    feelFolder.add(h.feel, key, 0, max, max > 4 ? 1 : 0.01).name(key);
  }
  const copy = { run: () => undefined as void };
  const copyCtl = feelFolder.add(copy, 'run').name('copy feel JSON');
  copy.run = () => {
    const text = JSON.stringify(h.feel, null, 2);
    void navigator.clipboard?.writeText(text).then(
      () => copyCtl.name('copied'),
      () => copyCtl.name('copy failed'),
    );
  };
  feelFolder.close();
  const meter = { fps: 0 };
  gui.add(meter, 'fps').name('fps').listen().disable();
  setInterval(() => {
    meter.fps = Math.round(h.fps());
  }, 500);
  gui.close();
  return gui;
}
