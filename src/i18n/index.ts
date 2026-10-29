import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { useSettings } from '../store/settingsStore'
import { setFormatLanguage } from './format'
import { en } from './locales/en'

/** Languages offered; `complete` ones translate every text (the others fall back to English). */
export const LANGUAGES = [
  { code: 'en', name: 'English', dir: 'ltr', complete: true },
  { code: 'bn', name: 'বাংলা', dir: 'ltr', complete: true },
  { code: 'hi', name: 'हिन्दी', dir: 'ltr', complete: false },
  { code: 'ar', name: 'العربية', dir: 'rtl', complete: false },
] as const

// English is built in; other languages download when chosen (they are large).
const LOADERS: Record<string, () => Promise<object>> = {
  bn: () => import('./locales/bn').then((m) => m.bn),
  hi: () => import('./locales/hi').then((m) => m.hi),
  ar: () => import('./locales/ar').then((m) => m.ar),
}

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en } },
  lng: 'en',
  fallbackLng: 'en',
  // React already escapes rendered text.
  interpolation: { escapeValue: false },
})

async function loadLanguage(code: string) {
  const load = LOADERS[code]
  if (!load || i18n.hasResourceBundle(code, 'translation')) return
  i18n.addResourceBundle(code, 'translation', await load())
}

async function applyLanguage(language: string) {
  try {
    await loadLanguage(language)
  } catch {
    // Offline before the language was ever downloaded: stay in English.
    return
  }
  if (useSettings.getState().language !== language) return
  if (i18n.language !== language) await i18n.changeLanguage(language)
  document.documentElement.lang = language
  document.documentElement.dir = LANGUAGES.find((l) => l.code === language)?.dir ?? 'ltr'
  setFormatLanguage(language)
}

/** Resolves once the saved language is loaded, so the first render is already in it. */
export const languageReady = applyLanguage(useSettings.getState().language)
useSettings.subscribe((state, previous) => state.language !== previous.language && void applyLanguage(state.language))

/** Translation outside React components (actions, Cornerstone callbacks). */
export const t = i18n.t.bind(i18n)

export default i18n
