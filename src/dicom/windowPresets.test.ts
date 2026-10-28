import { describe, expect, it } from 'vitest'
import { CT_PRESETS, findPresetIndex, fullRangeWindow, percentileWindow, regionWindow, windowOptions } from './windowPresets'

describe('findPresetIndex', () => {
  it('matches exactly', () => expect(findPresetIndex(CT_PRESETS, { width: 1800, center: 400 })).toBe(2))
  it('tolerates the off-by-one width of stored VOI ranges', () =>
    expect(findPresetIndex(CT_PRESETS, { width: 399, center: 40 })).toBe(0))
  it('returns -1 for custom windows', () => expect(findPresetIndex(CT_PRESETS, { width: 1880, center: 460 })).toBe(-1))
})

describe('windowOptions', () => {
  const user = [
    { id: 'u1', label: 'Stroke', width: 40, center: 35, modality: 'CT' },
    { id: 'u2', label: 'MR soft', width: 500, center: 250, modality: 'MR' },
  ]
  it('lists header windows, built-in presets and the user presets of the modality', () => {
    const options = windowOptions('CT', [{ width: 400, center: 40, explanation: 'SOFT' }, { width: 0, center: 0 }], user)
    expect(options.map((o) => [o.source, o.label])).toEqual([
      ['header', 'SOFT'],
      ...CT_PRESETS.map((p) => ['builtin', p.label]),
      ['user', 'Stroke'],
    ])
  })
  it('has no built-in presets outside CT; unnamed header windows get a generic label', () => {
    const options = windowOptions('MR', [{ width: 600, center: 300 }], user)
    expect(options.map((o) => [o.label, o.labelKey])).toEqual([
      ['window.header', true],
      ['MR soft', false],
    ])
  })
})

describe('percentileWindow / fullRangeWindow', () => {
  it('ignores outliers', () => {
    const pixels = [...Array.from({ length: 1000 }, (_, i) => i % 100), 5000, -5000]
    const window = percentileWindow(pixels)!
    expect(window.center).toBeCloseTo(49.5, 0)
    expect(window.width).toBeLessThan(110)
  })
  it('applies the rescale', () => expect(percentileWindow([0, 10], 0, 1, 2, -1000)).toEqual({ width: 20, center: -990 }))
  it('never returns a zero width', () => {
    expect(percentileWindow([7, 7, 7])).toEqual({ width: 1, center: 7.5 })
    expect(fullRangeWindow(3, 3)).toEqual({ width: 1, center: 3.5 })
  })
})

describe('regionWindow', () => {
  // 4×3 image with values 0..11 row by row.
  const pixels = Array.from({ length: 12 }, (_, i) => i)
  it('covers the values inside the rectangle, in any corner order', () => {
    expect(regionWindow(pixels, 4, 3, [2, 1], [1, 2])).toEqual(fullRangeWindow(5, 10))
  })
  it('clips to the image and applies the rescale', () => {
    expect(regionWindow(pixels, 4, 3, [-5, -5], [0.4, 0.4], 2, 10)).toEqual(fullRangeWindow(10, 10))
    expect(regionWindow(pixels, 4, 3, [9, 9], [12, 12])).toBeNull()
  })
})
