import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { useSettings } from '../store/settingsStore'
import { bn } from './locales/bn'
import { en } from './locales/en'

export const LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'bn', name: 'বাংলা' },
] as const

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, bn: { translation: bn } },
  lng: useSettings.getState().language,
  fallbackLng: 'en',
  // React already escapes rendered text.
  interpolation: { escapeValue: false },
})

const applyLanguage = (language: string) => {
  if (i18n.language !== language) void i18n.changeLanguage(language)
  document.documentElement.lang = language
}
applyLanguage(useSettings.getState().language)
useSettings.subscribe((state) => applyLanguage(state.language))

/** Translation outside React components (actions, Cornerstone callbacks). */
export const t = i18n.t.bind(i18n)

export default i18n
