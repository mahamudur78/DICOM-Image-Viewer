import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, migrateSettings, useSettings } from './settingsStore'

describe('migrateSettings', () => {
  it('returns defaults for missing or broken data', () => {
    expect(migrateSettings(undefined)).toEqual(DEFAULT_SETTINGS)
    expect(migrateSettings('garbage')).toEqual(DEFAULT_SETTINGS)
    expect(migrateSettings({ links: null, language: 3 })).toEqual(DEFAULT_SETTINGS)
  })

  it('keeps valid values and fills in the rest', () => {
    expect(migrateSettings({ language: 'bn', links: { sliceSync: true, voiSync: 'yes' } })).toEqual({
      language: 'bn',
      links: { referenceLines: true, sliceSync: true, voiSync: false },
    })
  })
})

describe('useSettings', () => {
  it('toggles links without localStorage', () => {
    useSettings.getState().toggleLink('voiSync')
    expect(useSettings.getState().links.voiSync).toBe(true)
    useSettings.getState().toggleLink('voiSync')
    expect(useSettings.getState().links.voiSync).toBe(false)
  })
})
