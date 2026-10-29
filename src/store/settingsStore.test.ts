import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, migrateSettings, useSettings } from './settingsStore'

describe('migrateSettings', () => {
  it('returns defaults for missing or broken data', () => {
    expect(migrateSettings(undefined)).toEqual(DEFAULT_SETTINGS)
    expect(migrateSettings('garbage')).toEqual(DEFAULT_SETTINGS)
    expect(migrateSettings({ links: null, language: 3, display: 'x', presets: 'y', screenDpi: 5 })).toEqual(DEFAULT_SETTINGS)
  })

  it('upgrades version 1 settings, keeping what was there', () => {
    expect(migrateSettings({ language: 'bn', links: { sliceSync: true, voiSync: 'yes' } })).toEqual({
      ...DEFAULT_SETTINGS,
      language: 'bn',
      links: { ...DEFAULT_SETTINGS.links, sliceSync: true },
    })
  })

  it('keeps valid hanging rules (version 3)', () => {
    const rule = { id: 'r', name: 'Mine', modality: 'CT', layout: { rows: 1, cols: 2 }, cells: [{}, { prior: true }] }
    const migrated = migrateSettings({ hangingRules: [rule, { id: 'x' }, 'junk'] })
    expect(migrated.hangingRules).toEqual([rule])
    expect(migrated.links.zoomPanSync).toBe(false)
  })

  it('keeps valid presets and display choices, drops broken ones', () => {
    const preset = { id: 'a', label: 'Stroke', width: 40, center: 35, modality: 'CT' }
    const migrated = migrateSettings({
      display: { privacy: true, scaleBar: 1 },
      presets: [preset, { id: 'b', label: 'bad', width: -5, center: 0, modality: 'CT' }, null],
      screenDpi: 110,
    })
    expect(migrated.display).toEqual({ ...DEFAULT_SETTINGS.display, privacy: true })
    expect(migrated.presets).toEqual([preset])
    expect(migrated.screenDpi).toBe(110)
  })
})

describe('useSettings', () => {
  beforeEach(() => useSettings.setState({ presets: [] }))

  it('toggles links and display options without localStorage', () => {
    useSettings.getState().toggleLink('voiSync')
    expect(useSettings.getState().links.voiSync).toBe(true)
    useSettings.getState().toggleLink('voiSync')
    useSettings.getState().toggleDisplay('privacy')
    expect(useSettings.getState().display.privacy).toBe(true)
    useSettings.getState().toggleDisplay('privacy')
  })

  it('adds, renames, reorders and removes presets within a modality', () => {
    const { addPreset } = useSettings.getState()
    addPreset({ label: 'A', width: 1, center: 0, modality: 'CT' })
    addPreset({ label: 'M', width: 1, center: 0, modality: 'MR' })
    addPreset({ label: 'B', width: 1, center: 0, modality: 'CT' })
    const [a, , b] = useSettings.getState().presets
    useSettings.getState().movePreset(b.id, -1)
    expect(useSettings.getState().presets.map((p) => p.label)).toEqual(['B', 'M', 'A'])
    useSettings.getState().movePreset(b.id, -1) // already first among CT
    useSettings.getState().updatePreset(a.id, { label: 'Renamed' })
    useSettings.getState().removePreset(b.id)
    expect(useSettings.getState().presets.map((p) => p.label)).toEqual(['M', 'Renamed'])
  })
})
