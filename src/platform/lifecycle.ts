// What: browser lifecycle glue: visibility, window focus and pagehide → callbacks (pause reasons hidden/blur, save flush).
// Called by: src/main.ts once at boot.
// Keep: only subscriptions here; what to do on each event is decided by the caller.

export interface LifecycleHandlers {
  hidden(): void;
  visible(): void;
  blur(): void;
  focus(): void;
  pagehide(): void;
}

export function watchLifecycle(h: LifecycleHandlers): () => void {
  const onVisibility = (): void => (document.visibilityState === 'hidden' ? h.hidden() : h.visible());
  const onBlur = (): void => h.blur();
  const onFocus = (): void => h.focus();
  const onPageHide = (): void => h.pagehide();
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('blur', onBlur);
  window.addEventListener('focus', onFocus);
  window.addEventListener('pagehide', onPageHide);
  if (document.visibilityState === 'hidden') h.hidden();
  return () => {
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('blur', onBlur);
    window.removeEventListener('focus', onFocus);
    window.removeEventListener('pagehide', onPageHide);
  };
}
