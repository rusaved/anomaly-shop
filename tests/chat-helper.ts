import { STEP_SEC } from '../src/core/runtime.ts';
import type { Game } from '../src/sim/game.ts';
import type { Chat } from '../src/sim/state.ts';

/** UB-05: buyers only write — the oldest open chat, ticking the game up to maxSec seconds until one is open. */
export function waitChat(game: Game, maxSec = 60): Chat | undefined {
  const oldest = (): Chat | undefined => game.chats().filter((c) => c.state === 'open').at(-1);
  for (let t = 0; t < maxSec && !oldest(); t += STEP_SEC) game.tick(STEP_SEC);
  return oldest();
}

/** Sells through the oldest open chat (waits for one first): true when a buyer paid. */
export function sellViaChat(game: Game, maxSec = 60): boolean {
  const chat = waitChat(game, maxSec);
  return chat ? game.chatSell(chat.id) : false;
}
