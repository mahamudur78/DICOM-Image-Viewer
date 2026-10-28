import { describe, expect, it } from 'vitest'
import { compareImages, formatDate, formatPersonName, isLocalizer, sliceLocation } from './parse'

describe('formatPersonName', () => {
  it('joins name components', () => {
    expect(formatPersonName('Doe^John')).toBe('Doe John')
    expect(formatPersonName('Doe^John^^Dr')).toBe('Doe John Dr')
  })
  it('handles empty values', () => {
    expect(formatPersonName(undefined)).toBe('')
    expect(formatPersonName('^')).toBe('')
  })
})

describe('formatDate', () => {
  it('formats DA values', () => expect(formatDate('20240131')).toBe('2024-01-31'))
  it('passes through other values', () => {
    expect(formatDate('2024')).toBe('2024')
    expect(formatDate(undefined)).toBe('')
  })
})

describe('sliceLocation', () => {
  const axial = '1\\0\\0\\0\\1\\0'
  it('projects the position on the slice normal', () => {
    expect(sliceLocation('-50\\-50\\-12.5', axial)).toBe(-12.5)
    // Sagittal: rows along y, columns along -z → normal along -x.
    expect(sliceLocation('30\\0\\0', '0\\1\\0\\0\\0\\-1')).toBe(-30)
  })
  it('returns null for missing or malformed values', () => {
    expect(sliceLocation(undefined, axial)).toBeNull()
    expect(sliceLocation('1\\2', axial)).toBeNull()
    expect(sliceLocation('1\\2\\3', '1\\0\\0')).toBeNull()
    expect(sliceLocation('a\\b\\c', axial)).toBeNull()
  })
})

describe('isLocalizer', () => {
  it('uses ImageType', () => expect(isLocalizer('ORIGINAL\\PRIMARY\\LOCALIZER', '')).toBe(true))
  it('uses the description', () => {
    expect(isLocalizer(undefined, 'Topogram 0.6 T20f')).toBe(true)
    expect(isLocalizer('ORIGINAL\\PRIMARY\\AXIAL', 'Chest 2.5mm')).toBe(false)
  })
})

describe('compareImages', () => {
  it('sorts by instance number, then position', () => {
    const images = [
      { instanceNumber: 2, sliceLocation: 0 },
      { instanceNumber: 1, sliceLocation: 5 },
      { instanceNumber: 1, sliceLocation: -5 },
      { instanceNumber: 1, sliceLocation: null },
    ]
    expect(images.sort(compareImages)).toEqual([
      { instanceNumber: 1, sliceLocation: -5 },
      { instanceNumber: 1, sliceLocation: 5 },
      { instanceNumber: 1, sliceLocation: null },
      { instanceNumber: 2, sliceLocation: 0 },
    ])
  })
})
