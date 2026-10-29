import { describe, expect, it } from 'vitest'
import { filterStudies, groupByPatient } from './studyTree'
import type { Series, Study } from './types'

const series = (description: string, modality = 'CT'): Series => ({
  id: description,
  seriesInstanceUID: description,
  seriesNumber: 1,
  description,
  modality,
  kind: 'image',
  hasOrientation: true,
  isLocalizer: false,
  frameRate: null,
  frameTimeVector: null,
  sortMode: 'instance',
  images: [],
})

const study = (uid: string, patientName: string, patientId: string, studyDate: string, description: string, list: Series[]): Study => ({
  studyInstanceUID: uid,
  patientName,
  patientId,
  studyDate,
  description,
  series: list,
})

const studies = [
  study('1', 'Rahim Karim', 'P1', '2025-01-01', 'Chest', [series('Lung 1mm'), series('Mediastinum')]),
  study('2', 'Doe Jane', 'P2', '2026-03-01', 'Abdomen', [series('Liver MR', 'MR')]),
  study('3', 'Rahim Karim', 'P1', '2026-02-01', 'Chest follow-up', [series('Lung 1mm')]),
]

describe('groupByPatient', () => {
  it('groups by patient ID with the newest study first', () => {
    const groups = groupByPatient(studies)
    expect(groups.map((g) => [g.key, g.studies.map((s) => s.studyInstanceUID)])).toEqual([
      ['P1', ['3', '1']],
      ['P2', ['2']],
    ])
  })
})

describe('filterStudies', () => {
  it('keeps whole studies when the patient or study matches', () => {
    expect(filterStudies(studies, 'jane').map((s) => s.studyInstanceUID)).toEqual(['2'])
    expect(filterStudies(studies, 'follow').map((s) => s.series.length)).toEqual([1])
  })
  it('keeps only matching series otherwise, with every word required', () => {
    const result = filterStudies(studies, 'chest medi')
    expect(result.map((s) => [s.studyInstanceUID, s.series.map((x) => x.description)])).toEqual([['1', ['Mediastinum']]])
    expect(filterStudies(studies, 'mr').map((s) => s.studyInstanceUID)).toEqual(['2'])
  })
  it('returns everything for an empty query', () => expect(filterStudies(studies, '  ')).toBe(studies))
})
