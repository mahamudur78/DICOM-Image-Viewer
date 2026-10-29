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

export type Theme = 'system' | 'dark' | 'light' | 'contrast'

/** Tools the middle and right mouse buttons, the wheel and touch can be set to. */
export type MouseTool = 'pan' | 'zoom' | 'windowLevel' | 'scroll' | 'none'

export interface InputSettings {
  middle: MouseTool
  right: MouseTool
  wheel: 'scroll' | 'zoom'
  /** One finger: the selected tool (like the left button), or scrolling through images. */
  oneFinger: 'tool' | 'scroll'
}

/** User preferences that survive a reload. Session data (studies, layout) lives in the viewer store. */
export interface Settings {
  language: string
  theme: Theme
  input: InputSettings
  /** The user's shortcuts by command id; commands not listed keep their default keys. */
  keymap: Record<string, string[]>
  /** Largest size of the local archive (MB). */
  archiveLimitMb: number
  /** The first-visit guide was shown (or closed). */
  onboardingDone: boolean
  links: LinkSettings
  display: DisplaySettings
  presets: UserPreset[]
  /** Screen resolution for "actual size" zoom; 96 is the CSS reference pixel. */
  screenDpi: number
  /** Unit of measured lengths, areas and volumes. */
  measureUnit: LengthUnit
  /** The user's hanging protocols, tried before the built-in ones. */
  hangingRules: HangingRule[]
  /** Last choices of each export dialog (by dialog), so they open as left. */
  exportPrefs: Record<string, Record<string, string | number | boolean>>
  /** Tags shown at the top of the tag panel, as "(gggg,eeee)". */
  pinnedTags: string[]
  /** Saved anonymization settings. */
  anonymizeTemplates: { name: string; options: Record<string, string | boolean> }[]
  /** The user's own 3D transfer functions, in Cornerstone's preset string format. */
  vrPresets: { name: string; scalarOpacity: string; colorTransfer: string }[]
}

export const SETTINGS_KEY = 'dicomlens-settings'
export const SETTINGS_VERSION = 6

export const DEFAULT_SETTINGS: Settings = {
  language: 'en',
  theme: 'dark',
  input: { middle: 'pan', right: 'zoom', wheel: 'scroll', oneFinger: 'tool' },
  keymap: {},
  archiveLimitMb: 2000,
  onboardingDone: false,
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
  exportPrefs: {},
  pinnedTags: [],
  anonymizeTemplates: [],
  vrPresets: [],
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

function pickBooleans(source: unknown) {
  return isObject(source) ? Object.fromEntries(Object.entries(source).filter(([, v]) => typeof v === 'boolean')) : {}
}

function pickPrimitives(source: unknown): Record<string, string | number | boolean> {
  return isObject(source) ? Object.fromEntries(Object.entries(source).filter(([, v]) => ['string', 'number', 'boolean'].includes(typeof v))) as Record<string, string | number | boolean> : {}
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
  const input = isObject(value.input) ? value.input : {}
  const mouseTool = (v: unknown, fallback: MouseTool) => (['pan', 'zoom', 'windowLevel', 'scroll', 'none'].includes(v as string) ? (v as MouseTool) : fallback)
  const limit = Number(value.archiveLimitMb)
  return {
    language: typeof value.language === 'string' ? value.language : DEFAULT_SETTINGS.language,
    theme: ['system', 'dark', 'light', 'contrast'].includes(value.theme as string) ? (value.theme as Theme) : DEFAULT_SETTINGS.theme,
    input: {
      middle: mouseTool(input.middle, 'pan'),
      right: mouseTool(input.right, 'zoom'),
      wheel: input.wheel === 'zoom' ? 'zoom' : 'scroll',
      oneFinger: input.oneFinger === 'scroll' ? 'scroll' : 'tool',
    },
    keymap: isObject(value.keymap)
      ? Object.fromEntries(Object.entries(value.keymap).filter(([, keys]) => Array.isArray(keys) && keys.every((k) => typeof k === 'string')) as [string, string[]][])
      : {},
    archiveLimitMb: limit >= 50 && limit <= 1_000_000 ? limit : DEFAULT_SETTINGS.archiveLimitMb,
    onboardingDone: value.onboardingDone === true,
    links: { ...DEFAULT_SETTINGS.links, ...pickBooleans(value.links) },
    display: { ...DEFAULT_SETTINGS.display, ...pickBooleans(value.display) },
    presets: Array.isArray(value.presets) ? value.presets.filter(validPreset) : [],
    screenDpi: dpi >= 50 && dpi <= 600 ? dpi : DEFAULT_SETTINGS.screenDpi,
    measureUnit: value.measureUnit === 'cm' ? 'cm' : 'mm',
    hangingRules: Array.isArray(value.hangingRules) ? value.hangingRules.filter(validRule) : [],
    exportPrefs: isObject(value.exportPrefs)
      ? Object.fromEntries(Object.entries(value.exportPrefs).filter(([, v]) => isObject(v)).map(([k, v]) => [k, pickPrimitives(v)]))
      : {},
    pinnedTags: Array.isArray(value.pinnedTags) ? value.pinnedTags.filter((t): t is string => typeof t === 'string') : [],
    vrPresets: Array.isArray(value.vrPresets)
      ? value.vrPresets.filter((p): p is Settings['vrPresets'][number] => isObject(p) && typeof p.name === 'string' && typeof p.scalarOpacity === 'string' && typeof p.colorTransfer === 'string')
      : [],
    anonymizeTemplates: Array.isArray(value.anonymizeTemplates)
      ? value.anonymizeTemplates.filter((t): t is Settings['anonymizeTemplates'][number] => isObject(t) && typeof t.name === 'string' && isObject(t.options)).map((t) => ({ name: t.name, options: pickPrimitives(t.options) as Record<string, string | boolean> }))
      : [],
  }
}

interface SettingsState extends Settings {
  setLanguage: (language: string) => void
  setTheme: (theme: Theme) => void
  setInput: (change: Partial<InputSettings>) => void
  /** Keys of one command; null brings back its defaults. */
  setShortcut: (commandId: string, keys: string[] | null) => void
  resetShortcuts: () => void
  setArchiveLimit: (mb: number) => void
  setOnboardingDone: (done: boolean) => void
  /** Replaces every preference (settings import). */
  replaceAll: (settings: Settings) => void
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
  setExportPrefs: (dialog: string, prefs: Record<string, string | number | boolean>) => void
  togglePinnedTag: (tag: string) => void
  saveAnonymizeTemplate: (name: string, options: Record<string, string | boolean>) => void
  removeAnonymizeTemplate: (name: string) => void
  saveVrPreset: (preset: Settings['vrPresets'][number]) => void
  removeVrPreset: (name: string) => void
}

let presetCounter = 0
const presetId = () => `preset-${Date.now().toString(36)}-${presetCounter++}`

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,
      setLanguage: (language) => set({ language }),
      setTheme: (theme) => set({ theme }),
      setInput: (change) => set((state) => ({ input: { ...state.input, ...change } })),
      setShortcut: (commandId, keys) =>
        set((state) => {
          const keymap = { ...state.keymap }
          if (keys) keymap[commandId] = keys
          else delete keymap[commandId]
          return { keymap }
        }),
      resetShortcuts: () => set({ keymap: {} }),
      setArchiveLimit: (archiveLimitMb) => set({ archiveLimitMb }),
      setOnboardingDone: (onboardingDone) => set({ onboardingDone }),
      replaceAll: (settings) => set(migrateSettings(settings)),
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
      setExportPrefs: (dialog, prefs) => set((state) => ({ exportPrefs: { ...state.exportPrefs, [dialog]: prefs } })),
      togglePinnedTag: (tag) =>
        set((state) => ({ pinnedTags: state.pinnedTags.includes(tag) ? state.pinnedTags.filter((t) => t !== tag) : [...state.pinnedTags, tag] })),
      saveAnonymizeTemplate: (name, options) =>
        set((state) => ({ anonymizeTemplates: [...state.anonymizeTemplates.filter((t) => t.name !== name), { name, options }] })),
      removeAnonymizeTemplate: (name) => set((state) => ({ anonymizeTemplates: state.anonymizeTemplates.filter((t) => t.name !== name) })),
      saveVrPreset: (preset) => set((state) => ({ vrPresets: [...state.vrPresets.filter((p) => p.name !== preset.name), preset] })),
      removeVrPreset: (name) => set((state) => ({ vrPresets: state.vrPresets.filter((p) => p.name !== name) })),
    }),
    {
      name: SETTINGS_KEY,
      version: SETTINGS_VERSION,
      storage: createJSONStorage(safeStorage),
      partialize: ({ language, theme, input, keymap, archiveLimitMb, onboardingDone, links, display, presets, screenDpi, measureUnit, hangingRules, exportPrefs, pinnedTags, anonymizeTemplates, vrPresets }): Settings => ({
        language,
        theme,
        input,
        keymap,
        archiveLimitMb,
        onboardingDone,
        links,
        display,
        presets,
        screenDpi,
        measureUnit,
        hangingRules,
        exportPrefs,
        pinnedTags,
        anonymizeTemplates,
        vrPresets,
      }),
      migrate: (stored) => migrateSettings(stored),
      merge: (stored, current) => ({ ...current, ...migrateSettings(stored) }),
    },
  ),
)
