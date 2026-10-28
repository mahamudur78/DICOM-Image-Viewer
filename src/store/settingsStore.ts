import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { safeStorage } from './safeStorage'

/** Viewport linking options toggled from the toolbar. */
export interface LinkSettings {
  referenceLines: boolean
  sliceSync: boolean
  voiSync: boolean
}

/** User preferences that survive a reload. Session data (studies, layout) lives in the viewer store. */
export interface Settings {
  language: string
  links: LinkSettings
}

export const SETTINGS_KEY = 'dicomlens-settings'
export const SETTINGS_VERSION = 1

export const DEFAULT_SETTINGS: Settings = {
  language: 'en',
  links: { referenceLines: true, sliceSync: false, voiSync: false },
}

/**
 * Fills in anything missing or malformed in stored settings with defaults.
 * New versions add their upgrade steps here, keyed on `version`.
 */
export function migrateSettings(stored: unknown): Settings {
  const value = typeof stored === 'object' && stored !== null ? (stored as Partial<Settings>) : {}
  const links = typeof value.links === 'object' && value.links !== null ? value.links : {}
  return {
    language: typeof value.language === 'string' ? value.language : DEFAULT_SETTINGS.language,
    links: { ...DEFAULT_SETTINGS.links, ...pickBooleans(links) },
  }
}

function pickBooleans(source: object) {
  return Object.fromEntries(Object.entries(source).filter(([, v]) => typeof v === 'boolean'))
}

interface SettingsState extends Settings {
  setLanguage: (language: string) => void
  toggleLink: (key: keyof LinkSettings) => void
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,
      setLanguage: (language) => set({ language }),
      toggleLink: (key) => set((state) => ({ links: { ...state.links, [key]: !state.links[key] } })),
    }),
    {
      name: SETTINGS_KEY,
      version: SETTINGS_VERSION,
      storage: createJSONStorage(safeStorage),
      partialize: ({ language, links }): Settings => ({ language, links }),
      migrate: (stored) => migrateSettings(stored),
      merge: (stored, current) => ({ ...current, ...migrateSettings(stored) }),
    },
  ),
)
