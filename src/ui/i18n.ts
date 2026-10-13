// What: translations (docs/02-tech.md, section 11): t(key, vars) over the flat ru/en dictionaries, language switch, data-i18n re-render.
// Called by: src/ui/* (every player-facing string), src/main.ts (language from the platform or the saved choice).
// Keep: no key → fallback language, then a visible marker in dev and the key itself in release; the test checks every key used in src.

import type { LangName } from '../content/schemas.ts';

export type Vars = Record<string, string | number>;
export type Dictionaries = Record<LangName, Record<string, string>>;

export interface I18n {
  lang(): LangName;
  setLanguage(lang: LangName): void;
  t(key: string, vars?: Vars): string;
  has(key: string): boolean;
  onChange(cb: (lang: LangName) => void): () => void;
  /** Fills textContent of every [data-i18n] element under root (and placeholders/aria-labels via data-i18n-attr). */
  apply(root: ParentNode): void;
}

export const MISSING_OPEN = '⟦';
export const MISSING_CLOSE = '⟧';

export function format(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m));
}

export function createI18n(dicts: Dictionaries, initial: LangName, fallback: LangName, strict: boolean): I18n {
  let current = initial;
  const listeners = new Set<(lang: LangName) => void>();
  const lookup = (key: string): string | undefined => dicts[current][key] ?? dicts[fallback][key];
  const i18n: I18n = {
    lang: () => current,
    setLanguage(lang) {
      if (lang === current) return;
      current = lang;
      listeners.forEach((cb) => cb(lang));
    },
    t(key, vars) {
      const text = lookup(key);
      if (text === undefined) {
        if (strict) console.warn(`i18n: no key "${key}" for ${current}`);
        return strict ? `${MISSING_OPEN}${key}${MISSING_CLOSE}` : key;
      }
      return format(text, vars);
    },
    has: (key) => lookup(key) !== undefined,
    onChange(cb) {
      listeners.add(cb);
      return () => void listeners.delete(cb);
    },
    apply(root) {
      root.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
        const key = el.dataset.i18n ?? '';
        const attr = el.dataset.i18nAttr;
        const text = i18n.t(key);
        if (attr) el.setAttribute(attr, text);
        else el.textContent = text;
      });
    },
  };
  return i18n;
}
