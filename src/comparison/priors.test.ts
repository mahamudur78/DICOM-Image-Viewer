import { describe, expect, it } from 'vitest'
import { BUILT_IN_RULES, applyHangingRules, matchesWords, ruleFromGrid } from '../dicom/hangingProtocol'
import type { ImageEntry, Series, Study } from '../dicom/types'
import { findPriorMatch, mergeStudies, priorStudies, seriesSimilarity } from './priors'

const image = (n: number): ImageEntry => ({
  imageId: `img${n}`,
  file: new File([], `${n}.dcm`),
  path: `${n}.dcm`,
  instanceNumber: n,
  sliceLocation: null,
  acquisitionTime: null,
  frame: 0,
  sopInstanceUID: `sop${n}`,
})

const series = (id: string, description: string, extra: Partial<Series> = {}): Series => ({
  id,
  seriesInstanceUID: id,
  seriesNumber: Number(id.replace(/\D/g, '')) || 1,
  description,
  modality: 'CT',
  kind: 'image',
  hasOrientation: true,
  isLocalizer: false,
  frameRate: null,
  frameTimeVector: null,
  sortMode: 'instance',
  plane: 'axial',
  images: [image(1), image(2)],
  ...extra,
})

const study = (uid: string, date: string, list: Series[], patientId = 'P1'): Study => ({
  studyInstanceUID: uid,
  patientName: 'Test',
  patientId,
  studyDate: date,
  description: 'Chest',
  series: list,
})

const scout = series('a1', 'Topogram', { isLocalizer: true, plane: 'coronal', images: [image(1)] })
const current = study('new', '2026-03-01', [scout, series('a2', 'Chest 1mm lung'), series('a3', 'Chest 5mm soft tissue')])
const prior = study('old', '2025-03-01', [series('b1', 'Chest 5mm soft tissue'), series('b2', 'Chest 1mm lung')])
const older = study('oldest', '2024-01-01', [series('c1', 'Chest')])
const other = study('x', '2025-06-01', [series('d1', 'Chest 1mm lung')], 'P2')

describe('priors', () => {
  it('lists the patient’s earlier studies, newest first', () => {
    expect(priorStudies([older, current, other, prior], current).map((s) => s.studyInstanceUID)).toEqual(['old', 'oldest'])
    expect(priorStudies([current], current)).toEqual([])
  })

  it('matches a series by modality, plane and description', () => {
    expect(seriesSimilarity(current.series[1], prior.series[1])).toBeGreaterThan(seriesSimilarity(current.series[1], prior.series[0]))
    expect(seriesSimilarity(current.series[1], series('m', 'Chest 1mm lung', { modality: 'MR' }))).toBe(-1)
    expect(findPriorMatch([current, prior, other], { study: current, series: current.series[1] })).toEqual({ study: prior, series: prior.series[1] })
    expect(findPriorMatch([current, other], { study: current, series: current.series[1] })).toBeNull()
  })

  it('adds new studies and new images of open series', () => {
    const extra = study('new', '2026-03-01', [series('a2', 'Chest 1mm lung', { images: [image(3)] }), series('a9', 'Late phase')])
    const merged = mergeStudies([current], [extra, prior])
    expect(merged.map((s) => s.studyInstanceUID)).toEqual(['new', 'old'])
    const lung = merged[0].series.find((s) => s.id === 'a2')!
    expect(lung.images.map((i) => i.instanceNumber)).toEqual([1, 2, 3])
    expect(merged[0].series.map((s) => s.id)).toEqual(['a1', 'a2', 'a3', 'a9'])
    // The open study object is not changed.
    expect(current.series).toHaveLength(3)
  })
})

describe('hanging rules', () => {
  it('matches words with alternatives', () => {
    expect(matchesWords('Ax DWI b1000', 'dwi|diffusion')).toBe(true)
    expect(matchesWords('T2 FLAIR', 't1')).toBe(false)
    expect(matchesWords('Chest 1mm lung', 'lung 1mm')).toBe(true)
  })

  it('places current and prior side by side', () => {
    const result = applyHangingRules(BUILT_IN_RULES, [current, prior])!
    expect(result.rule.id).toBe('builtin-ct-prior')
    expect(result.layout).toEqual({ rows: 1, cols: 2 })
    expect(result.cells[0]!.study).toBe(current)
    expect(result.cells[1]!.study).toBe(prior)
    // Axial images, not the scout.
    expect(result.cells[0]!.series.isLocalizer).toBe(false)
    expect(applyHangingRules(BUILT_IN_RULES, [current])).toBeNull()
  })

  it('lays out an MR brain by sequence', () => {
    const mr = (id: string, description: string) => series(id, description, { modality: 'MR', bodyPart: 'HEAD' })
    const brain = study('mr', '2026-01-01', [mr('m1', 'Ax DWI'), mr('m2', 'Ax T2 FLAIR'), mr('m3', 'Sag T1'), mr('m4', 'Ax T2')])
    const cells = applyHangingRules(BUILT_IN_RULES, [brain])!.cells.map((c) => c?.series.description)
    // "t2" also matches "T2 FLAIR"; the FLAIR cell then takes what remains for "flair".
    expect(cells[0]).toBe('Sag T1')
    expect(cells).toContain('Ax DWI')
    expect(new Set(cells).size).toBe(4)
  })

  it('saves the grid as a rule that reproduces it', () => {
    const rule = ruleFromGrid('Mine', { rows: 1, cols: 2 }, [{ study: current, series: current.series[2] }, { study: prior, series: prior.series[0] }], current)!
    expect(rule).toMatchObject({ modality: 'CT', needsPrior: true, layout: { rows: 1, cols: 2 } })
    const result = applyHangingRules([rule], [current, prior])!
    expect(result.cells.map((c) => c?.series.id)).toEqual(['a3', 'b1'])
  })
})
