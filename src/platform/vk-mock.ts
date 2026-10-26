// What: the stand-in of VK Bridge for ?mock=vk and the e2e of the vk build (V-02): init, Storage in localStorage, native ads as a 3 s screen with ✕ (reward only after the end), the «join» window with yes / no; hide and restore from the tab.
// Called by: src/platform/index.ts (vk profile, ?mock=vk in a plain browser tab — never when VK or OK launched the game).
// Keep: no network; a loaded chunk of its own, so the real bridge path never runs it; ?mock_ads=none — no video ever loads.

import type { VkBridgeLike } from './vk.ts';
import { vkText } from '../content/vk.ts';

type Listener = (e: { detail: { type: string; data?: unknown } }) => void;

const AD_SEC = 3;
const STORE = 'vkmock:';

function screen(text: string, buttons: Array<{ label: string; value: boolean }>, sec = 0): Promise<boolean> {
  return new Promise((resolve) => {
    const root = document.createElement('div');
    root.dataset.vkMock = 'window';
    root.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.82);color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;font:600 18px/1.4 system-ui,sans-serif;text-align:center;padding:16px;';
    const p = document.createElement('p');
    p.textContent = text;
    root.appendChild(p);
    const done = (v: boolean): void => {
      root.remove();
      resolve(v);
    };
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:12px;';
    for (const b of buttons) {
      const el = document.createElement('button');
      el.type = 'button';
      el.textContent = b.label;
      el.dataset.vkMock = b.value ? 'yes' : 'no';
      el.style.cssText = 'min-width:96px;min-height:44px;border-radius:12px;border:0;font:700 16px system-ui,sans-serif;';
      el.addEventListener('click', () => done(b.value));
      row.appendChild(el);
    }
    root.appendChild(row);
    if (sec > 0) {
      let left = sec;
      const tick = (): void => {
        p.textContent = `${text} · ${left}`;
        if (left <= 0) done(true);
        left -= 1;
      };
      tick();
      const timer = window.setInterval(() => {
        if (!root.isConnected) window.clearInterval(timer);
        else tick();
      }, 1000);
    }
    document.body.appendChild(root);
  });
}

export function createVkMock(): VkBridgeLike {
  const listeners: Listener[] = [];
  const emit = (type: string): void => listeners.forEach((cb) => cb({ detail: { type } }));
  document.addEventListener('visibilitychange', () => emit(document.visibilityState === 'hidden' ? 'VKWebAppViewHide' : 'VKWebAppViewRestore'));
  const noAds = new URLSearchParams(location.search).get('mock_ads') === 'none';
  const get = (k: string): string => {
    try {
      return localStorage.getItem(STORE + k) ?? '';
    } catch {
      return '';
    }
  };
  const set = (k: string, v: string): void => {
    try {
      localStorage.setItem(STORE + k, v);
    } catch {
      /* private mode: the mock forgets */
    }
  };
  const w = window as unknown as { __VK_MOCK__?: { calls: Array<{ method: string; params?: Record<string, unknown> }> } };
  w.__VK_MOCK__ = { calls: [] };
  return {
    subscribe(cb) {
      listeners.push(cb as Listener);
    },
    async send(method, params) {
      w.__VK_MOCK__!.calls.push({ method, ...(params ? { params } : {}) });
      switch (method) {
        case 'VKWebAppInit':
          return { result: true };
        case 'VKWebAppStorageGet':
          return { keys: ((params?.keys as string[]) ?? []).map((key) => ({ key, value: get(key) })) };
        case 'VKWebAppStorageSet':
          set(String(params?.key), String(params?.value ?? ''));
          return { result: true };
        case 'VKWebAppCheckNativeAds':
          return { result: !noAds };
        case 'VKWebAppShowNativeAds': {
          if (noAds) throw new Error('no ads');
          const reward = params?.ad_format === 'reward';
          const ok = await screen(vkText('vk', reward ? 'mock.reward' : 'mock.ad'), [{ label: '✕', value: false }], AD_SEC);
          return { result: reward ? ok : true };
        }
        case 'VKWebAppJoinGroup': {
          const ok = await screen(vkText('vk', 'mock.join'), [
            { label: vkText('vk', 'mock.yes'), value: true },
            { label: vkText('vk', 'mock.no'), value: false },
          ]);
          if (!ok) throw new Error('User denied');
          return { result: true };
        }
        default:
          throw new Error(`${method}: not in the mock`);
      }
    },
  };
}
