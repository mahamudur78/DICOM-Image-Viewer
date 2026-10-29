import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { HangingRule } from '../dicom/hangingProtocol'
import type { LengthUnit } from '../measurements/geometry'
import { safeStorage } from './safeStorage'

/** Viewport linking options toggled from the toolbar. */
export interface LinkSettings {
  referenceLines: boolean
  /** Reference lines of every other viewport, not only the active one. */
  referenceLinesAll: boolean
  /** The first and last slice of the active series as dashed lines. */
  referenceLinesEnds: boolean
  sliceSync: boolean
  voiSync: boolean
  zoomPanSync: boolean
  /** Other cine loops follow the frame of the one being played or scrolled. */
  cineSync: boolean
}

/** What is drawn on top of the images. */
export interface DisplaySettings {
  /** Corner text (patient, study, window, zoom, slice). */
  overlayText: boolean
  /** Hides patient name and ID (screen sharing, teaching). */
  privacy: boolean
  /** Graphics stored in the DICOM file (60xx overlay planes). */
  dicomOverlays: boolean
  scaleBar: boolean
  /** Coordinates and value of the pixel under the mouse. */
  pixelValue: boolean
  // What the corner text shows (when overlayText is on).
  cornerPatient: boolean
  cornerStudy: boolean
  cornerImageSize: boolean
  cornerZoom: boolean
  cornerWindow: boolean
  cornerSlice: boolean
  orientationMarkers: boolean
}

/** A window the user saved, offered for images of one modality. */
export interface UserPreset {
  id: string
  label: string
  width: number
  center: number
  modality: string
}

/** User preferences that survive a reload. Session data (studies, layout) lives in the viewer store. */
export interface Settings {
  language: string
  links: LinkSettings
  display: DisplaySettings
  presets: UserPreset[]
  /** Screen resolution for "actual size" zoom; 96 is the CSS reference pixel. */
  screenDpi: number
  /** Unit of measured lengths, areas and volumes. */
  measureUnit: LengthUnit
  /** The user's hanging protocols, tried before the built-in ones. */
  hangingRules: HangingRule[]
}

export const SETTINGS_KEY = 'dicomlens-settings'
export const SETTINGS_VERSION = 3

export const DEFAULT_SETTINGS: Settings = {
  language: 'en',
  links: {
    referenceLines: true,
    referenceLinesAll: false,
    referenceLinesEnds: false,
    sliceSync: false,
    voiSync: false,
    zoomPanSync: false,
    cineSync: false,
  },
  display: {
    overlayText: true,
    privacy: false,
    dicomOverlays: true,
    scaleBar: false,
    pixelValue: true,
    cornerPatient: true,
    cornerStudy: true,
    cornerImageSize: true,
    cornerZoom: true,
    cornerWindow: true,
    cornerSlice: true,
    orientationMarkers: true,
  },
  presets: [],
  screenDpi: 96,
  measureUnit: 'mm',
  hangingRules: [],
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

function pickBooleans(source: unknown) {
  return isObject(source) ? Object.fromEntries(Object.entries(source).filter(([, v]) => typeof v === 'boolean')) : {}
}

function validRule(value: unknown): value is HangingRule {
  return (
    isObject(value) &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.modality === 'string' &&
    isObject(value.layout) &&
    Number.isInteger(value.layout.rows) &&
    Number.isInteger(value.layout.cols) &&
    Array.isArray(value.cells) &&
    value.cells.every(isObject)
  )
}

function validPreset(value: unknown): value is UserPreset {
  return (
    isObject(value) &&
    typeof value.id === 'string' &&
    typeof value.label === 'string' &&
    typeof value.modality === 'string' &&
    Number.isFinite(value.width) &&
    (value.width as number) > 0 &&
    Number.isFinite(value.center)
  )
}

/**
 * Fills in anything missing or malformed in stored settings with defaults.
 * Version 1 had only language and links; later fields simply get defaults.
 */
export function migrateSettings(stored: unknown): Settings {
  const value = isObject(stored) ? stored : {}
  const dpi = Number(value.screenDpi)
  return {
    language: typeof value.language === 'string' ? value.language : DEFAULT_SETTINGS.language,
    links: { ...DEFAULT_SETTINGS.links, ...pickBooleans(value.links) },
    display: { ...DEFAULT_SETTINGS.display, ...pickBooleans(value.display) },
    presets: Array.isArray(value.presets) ? value.presets.filter(validPreset) : [],
    screenDpi: dpi >= 50 && dpi <= 600 ? dpi : DEFAULT_SETTINGS.screenDpi,
    measureUnit: value.measureUnit === 'cm' ? 'cm' : 'mm',
    hangingRules: Array.isArray(value.hangingRules) ? value.hangingRules.filter(validRule) : [],
  }
}

interface SettingsState extends Settings {
  setLanguage: (language: string) => void
  toggleLink: (key: keyof LinkSettings) => void
  toggleDisplay: (key: keyof DisplaySettings) => void
  addPreset: (preset: Omit<UserPreset, 'id'>) => void
  updatePreset: (id: string, change: Partial<Omit<UserPreset, 'id'>>) => void
  removePreset: (id: string) => void
  /** Moves a preset up (-1) or down (+1) among those of its modality. */
  movePreset: (id: string, direction: -1 | 1) => void
  setScreenDpi: (dpi: number) => void
  setMeasureUnit: (unit: LengthUnit) => void
  addHangingRule: (rule: HangingRule) => void
  removeHangingRule: (id: string) => void
}

let presetCounter = 0
const presetId = () => `preset-${Date.now().toString(36)}-${presetCounter++}`

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,
      setLanguage: (language) => set({ language }),
      toggleLink: (key) => set((state) => ({ links: { ...state.links, [key]: !state.links[key] } })),
      toggleDisplay: (key) => set((state) => ({ display: { ...state.display, [key]: !state.display[key] } })),
      addPreset: (preset) => set((state) => ({ presets: [...state.presets, { ...preset, id: presetId() }] })),
      updatePreset: (id, change) =>
        set((state) => ({ presets: state.presets.map((p) => (p.id === id ? { ...p, ...change } : p)) })),
      removePreset: (id) => set((state) => ({ presets: state.presets.filter((p) => p.id !== id) })),
      movePreset: (id, direction) =>
        set((state) => {
          const preset = state.presets.find((p) => p.id === id)
          if (!preset) return state
          const same = state.presets.filter((p) => p.modality === preset.modality)
          const target = same[same.indexOf(preset) + direction]
          if (!target) return state
          const presets = [...state.presets]
          const a = presets.indexOf(preset)
          const b = presets.indexOf(target)
          ;[presets[a], presets[b]] = [presets[b], presets[a]]
          return { presets }
        }),
      setScreenDpi: (screenDpi) => set({ screenDpi }),
      setMeasureUnit: (measureUnit) => set({ measureUnit }),
      addHangingRule: (rule) => set((state) => ({ hangingRules: [rule, ...state.hangingRules] })),
      removeHangingRule: (id) => set((state) => ({ hangingRules: state.hangingRules.filter((r) => r.id !== id) })),
    }),
    {
      name: SETTINGS_KEY,
      version: SETTINGS_VERSION,
      storage: createJSONStorage(safeStorage),
      partialize: ({ language, links, display, presets, screenDpi, measureUnit, hangingRules }): Settings => ({
        language,
        links,
        display,
        presets,
        screenDpi,
        measureUnit,
        hangingRules,
      }),
      migrate: (stored) => migrateSettings(stored),
      merge: (stored, current) => ({ ...current, ...migrateSettings(stored) }),
    },
  ),
)
