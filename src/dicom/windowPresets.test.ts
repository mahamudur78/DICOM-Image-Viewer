import { describe, expect, it } from 'vitest'
import { CT_PRESETS, findPresetIndex } from './windowPresets'

describe('findPresetIndex', () => {
  it('matches exactly', () => expect(findPresetIndex(CT_PRESETS, { width: 1800, center: 400 })).toBe(2))
  it('tolerates the off-by-one width of stored VOI ranges', () =>
    expect(findPresetIndex(CT_PRESETS, { width: 399, center: 40 })).toBe(0))
  it('returns -1 for custom windows', () => expect(findPresetIndex(CT_PRESETS, { width: 1880, center: 460 })).toBe(-1))
})
