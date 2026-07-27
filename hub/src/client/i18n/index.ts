import { useSyncExternalStore } from 'react'

import en, { Translations } from './en'
import ko from './ko'

export type { Translations }
export type Lang = 'en' | 'ko'

const TABLES: Record<Lang, Translations> = { en, ko }

/** Written by the language switcher; read by the app at boot. `cypress/support/e2e.ts`
 *  writes the same key to pin the suite to English — the tests use the product's
 *  own mechanism rather than a test-only code path (docs/design/i18n-plan.md §1.3). */
export const STORAGE_KEY = 'vtally.lang'

const isLang = (value: unknown): value is Lang => value === 'en' || value === 'ko'

/**
 * Korean is the default: English is chosen only when the browser explicitly
 * asks for it. A stored preference always wins.
 *
 * Guarded for `typeof window === 'undefined'` because vitest.config.ts runs
 * most suites in the `node` environment — the module is imported there (via
 * setupTests.ts) long before any DOM exists.
 */
export function detectLang(): Lang {
  if (typeof window === 'undefined') { return 'ko' }
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (isLang(stored)) { return stored }
  } catch {
    // Safari in private mode throws on localStorage access. Fall through to
    // browser detection rather than taking the whole app down over a preference.
  }
  return window.navigator?.language?.startsWith('en') ? 'en' : 'ko'
}

let current: Lang = detectLang()
const listeners = new Set<() => void>()

const subscribe = (onChange: () => void) => {
  listeners.add(onChange)
  return () => { listeners.delete(onChange) }
}

export const getLanguage = (): Lang => current

/**
 * Also the boot path: `main.tsx` calls `setLanguage(detectLang())` so that
 * `<html lang>` is correct from the first paint. index.html ships `lang="ko"`
 * as the static default; this corrects it for an English browser.
 */
export function setLanguage(lang: Lang) {
  current = lang
  if (typeof window !== 'undefined') {
    try { window.localStorage.setItem(STORAGE_KEY, lang) } catch { /* see detectLang */ }
    // Screen readers pick pronunciation from this attribute, so it has to
    // track the actual language and not just index.html's static guess. It is
    // also what the `:lang(ko)` rules in index.css and `latinCaps` match on.
    document.documentElement.lang = lang
    // Set here rather than per-page so every route gets it. IndexPage re-applies
    // it with its ⚠ prefix when the hub is disconnected.
    document.title = TABLES[lang].meta.title
  }
  listeners.forEach(fn => fn())
}

/** `useSyncExternalStore` rather than a context + provider: the language is one
 *  module-level value, and this way nothing has to wrap <App/> and
 *  `setLanguage()` works before React has mounted (which is what lets
 *  setupTests.ts pin the locale). */
export function useLang(): Lang {
  return useSyncExternalStore(subscribe, getLanguage, getLanguage)
}

export function useT(): Translations {
  return TABLES[useLang()]
}
