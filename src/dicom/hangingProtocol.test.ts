import { describe, expect, it } from 'vitest'
import { hangingOrder } from './hangingProtocol'
import type { Series, Study } from './types'

const series = (seriesNumber: number, isLocalizer = false): Series => ({
  id: `s${seriesNumber}`,
  seriesInstanceUID: `s${seriesNumber}`,
  kind: 'image',
  frameRate: null,
  frameTimeVector: null,
  sortMode: 'instance',
  seriesNumber,
  description: '',
  modality: 'CT',
  hasOrientation: true,
  isLocalizer,
  images: [],
})

const study = (uid: string, list: Series[]): Study => ({
  studyInstanceUID: uid,
  patientName: '',
  patientId: '',
  studyDate: '',
  description: '',
  series: list,
})

describe('hangingOrder', () => {
  it('puts localizers first and keeps study/series order', () => {
    const studies = [study('a', [series(2), series(1, true)]), study('b', [series(3), series(4, true)])]
    expect(hangingOrder(studies).map((d) => d.series.seriesNumber)).toEqual([1, 4, 2, 3])
  })
  it('handles no studies', () => expect(hangingOrder([])).toEqual([]))
  it('puts videos, reports and PDFs after images', () => {
    const report = { ...series(1), kind: 'sr' as const }
    expect(hangingOrder([study('a', [report, series(2), series(3, true)])]).map((d) => d.series.kind + d.series.seriesNumber)).toEqual([
      'image3',
      'image2',
      'sr1',
    ])
  })
})
