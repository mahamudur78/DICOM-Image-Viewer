import { describe, expect, it } from 'vitest'
import {
  formatDate,
  formatPersonName,
  frameRateOf,
  isLocalizer,
  parseDicomDateTime,
  parseDicomTime,
  sequenceKey,
  seriesKindOf,
  sliceLocation,
  sortImages,
} from './parse'

describe('formatPersonName', () => {
  it('joins name components', () => {
    expect(formatPersonName('Doe^John')).toBe('Doe John')
    expect(formatPersonName('Doe^John^^Dr')).toBe('Doe John Dr')
  })
  it('handles empty values', () => {
    expect(formatPersonName(undefined)).toBe('')
    expect(formatPersonName('^')).toBe('')
  })
  it('shows ideographic groups next to the alphabetic name', () => {
    expect(formatPersonName('Yamada^Tarou=山田^太郎=やまだ^たろう')).toBe('Yamada Tarou (山田 太郎)')
    expect(formatPersonName('=山田^太郎')).toBe('山田 太郎')
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
  const axial = [1, 0, 0, 0, 1, 0]
  it('projects the position on the slice normal', () => {
    expect(sliceLocation([-50, -50, -12.5], axial)).toBe(-12.5)
    // Sagittal: rows along y, columns along -z → normal along -x.
    expect(sliceLocation([30, 0, 0], [0, 1, 0, 0, 0, -1])).toBe(-30)
  })
  it('returns null for missing or malformed values', () => {
    expect(sliceLocation(undefined, axial)).toBeNull()
    expect(sliceLocation([1, 2], axial)).toBeNull()
    expect(sliceLocation([1, 2, 3], [1, 0, 0])).toBeNull()
    expect(sliceLocation([NaN, 0, 0], axial)).toBeNull()
  })
})

describe('isLocalizer', () => {
  it('uses ImageType', () => expect(isLocalizer('ORIGINAL\\PRIMARY\\LOCALIZER', '')).toBe(true))
  it('uses the description', () => {
    expect(isLocalizer(undefined, 'Topogram 0.6 T20f')).toBe(true)
    expect(isLocalizer('ORIGINAL\\PRIMARY\\AXIAL', 'Chest 2.5mm')).toBe(false)
  })
})

describe('seriesKindOf', () => {
  it('recognises video, PDF, reports and images', () => {
    expect(seriesKindOf('1.2.840.10008.5.1.4.1.1.77.1.4.1', '1.2.840.10008.1.2.4.102', true)).toBe('video')
    expect(seriesKindOf('1.2.840.10008.5.1.4.1.1.104.1', '1.2.840.10008.1.2.1', false)).toBe('pdf')
    expect(seriesKindOf('1.2.840.10008.5.1.4.1.1.88.11', '1.2.840.10008.1.2.1', false)).toBe('sr')
    expect(seriesKindOf('1.2.840.10008.5.1.4.1.1.2', '1.2.840.10008.1.2.1', true)).toBe('image')
  })
  it('recognises non-image objects and rejects unknown ones', () => {
    expect(seriesKindOf('1.2.840.10008.5.1.4.1.1.481.3', '1.2.840.10008.1.2', false)).toBe('rtstruct')
    expect(seriesKindOf('1.2.840.10008.5.1.4.1.1.88.59', '1.2.840.10008.1.2.1', false)).toBe('ko')
    expect(seriesKindOf('1.2.840.10008.5.1.4.1.1.66.4', '1.2.840.10008.1.2.1', true)).toBe('seg')
    expect(seriesKindOf('1.2.840.10008.5.1.4.1.1.9.4.1', '1.2.840.10008.1.2.1', false)).toBe('waveform')
    expect(seriesKindOf('1.2.840.10008.5.1.4.1.1.66', '1.2.840.10008.1.2.1', false)).toBeNull()
  })
})

describe('frameRateOf', () => {
  it('prefers frame time, then cine rate, then recommended rate', () => {
    expect(frameRateOf(50, 10, 5)).toBe(20)
    expect(frameRateOf(undefined, 30, 5)).toBe(30)
    expect(frameRateOf(0, undefined, 25)).toBe(25)
    expect(frameRateOf()).toBeNull()
  })
  it('keeps rates in a sensible range', () => {
    expect(frameRateOf(1)).toBe(120)
    expect(frameRateOf(33.33)).toBe(30)
  })
})

describe('parseDicomTime / parseDicomDateTime', () => {
  it('parses TM values', () => {
    expect(parseDicomTime('101530.5')).toBe(10 * 3600 + 15 * 60 + 30.5)
    expect(parseDicomTime('10')).toBe(36000)
    expect(parseDicomTime('10:15:30')).toBe(36930)
    expect(parseDicomTime('')).toBeNull()
    expect(parseDicomTime(undefined)).toBeNull()
  })
  it('orders acquisitions across days', () => {
    expect(parseDicomDateTime('20260102', '000001')! - parseDicomDateTime('20260101', '235959')!).toBe(2)
    expect(parseDicomDateTime(undefined, '000010')).toBe(10)
    expect(parseDicomDateTime('20260101', undefined)).toBeNull()
  })
})

describe('sequenceKey', () => {
  it('separates orientation, size, echo time and b-value', () => {
    const axial = { orientation: [1, 0, 0, 0, 1, 0], rows: 256, columns: 256 }
    expect(sequenceKey(axial)).toBe(sequenceKey({ ...axial, orientation: [1, 0, 0, 0, 1, 0.001] }))
    expect(sequenceKey(axial)).not.toBe(sequenceKey({ ...axial, orientation: [0, 1, 0, 0, 0, -1] }))
    expect(sequenceKey(axial)).not.toBe(sequenceKey({ ...axial, rows: 512 }))
    expect(sequenceKey({ ...axial, echoTime: 12 })).not.toBe(sequenceKey({ ...axial, echoTime: 90 }))
    expect(sequenceKey({ ...axial, bValue: 0 })).not.toBe(sequenceKey({ ...axial, bValue: 1000 }))
  })
})

describe('sortImages', () => {
  const image = (instanceNumber: number, sliceLocation: number | null, acquisitionTime: number | null, path: string, frame = 0) => ({
    instanceNumber,
    sliceLocation,
    acquisitionTime,
    path,
    frame,
  })
  const images = [
    image(2, 0, 30, 'IM10'),
    image(1, 5, 20, 'IM2'),
    image(1, -5, 10, 'IM1'),
    image(3, null, null, 'IM3'),
  ]
  const paths = (list: typeof images) => list.map((i) => i.path)

  it('sorts by instance number, then position', () => expect(paths(sortImages(images, 'instance'))).toEqual(['IM1', 'IM2', 'IM10', 'IM3']))
  it('sorts by position', () => expect(paths(sortImages(images, 'position')).slice(0, 3)).toEqual(['IM1', 'IM10', 'IM2']))
  it('sorts by acquisition time', () => expect(paths(sortImages(images, 'time')).slice(0, 3)).toEqual(['IM1', 'IM2', 'IM10']))
  it('sorts file names naturally', () => expect(paths(sortImages(images, 'fileName'))).toEqual(['IM1', 'IM2', 'IM3', 'IM10']))
  it('keeps frames of one file in order', () => {
    const frames = [image(1, 0, 0, 'cine', 3), image(1, 0, 0, 'cine', 1), image(1, 0, 0, 'cine', 2)]
    expect(sortImages(frames, 'fileName').map((f) => f.frame)).toEqual([1, 2, 3])
  })
})
