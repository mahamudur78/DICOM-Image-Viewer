import dicomParser from 'dicom-parser'
import { describe, expect, it } from 'vitest'
import { hasBit, labelAt } from '../objects/labels'
import { parseRtStruct } from '../objects/rtstruct'
import { segInfo, segLabels } from '../objects/seg'
import { History, Recorder, brush, circlePolygon, floodFill, interpolateSlices, scissors, segmentStats, stroke, thresholdAll, tmtv, type Grid } from './edit'
import { rgbToDicomLab, sliceContours, writeRtStruct, writeSeg } from './writeObjects'
import { dicomLabToRgb } from '../objects/labels'

const N = [20, 20, 10] as [number, number, number]
const newGrid = (): Grid => ({ dimensions: N, spacing: [1, 1, 2], origin: [0, 0, 0], direction: [1, 0, 0, 0, 1, 0, 0, 0, 1], scalars: new Float32Array(N[0] * N[1] * N[2]) })
const at = (i: number, j: number, k: number) => k * N[0] * N[1] + j * N[0] + i
const count = (grid: Grid, bit: number) => grid.scalars.reduce((n, v) => n + (hasBit(v, bit) ? 1 : 0), 0)
/** Image values: 100 inside a ball of radius 5 around (10, 10, 10 mm), 0 elsewhere. */
const image = (index: number) => {
  const [i, j, k] = [index % N[0], Math.floor(index / N[0]) % N[1], Math.floor(index / (N[0] * N[1]))]
  return Math.hypot(i - 10, j - 10, k * 2 - 10) <= 5 ? 100 : 0
}

describe('editing', () => {
  it('paints and erases a disc in the view plane, one slice thick', () => {
    const grid = newGrid()
    const rec = new Recorder(grid)
    brush(grid, 0, [10, 10, 4], { radius: 3, normal: [0, 0, 1] }, rec)
    expect(hasBit(grid.scalars[at(10, 10, 2)], 0)).toBe(true)
    expect(hasBit(grid.scalars[at(10, 10, 3)], 0)).toBe(false)
    expect(count(grid, 0)).toBe(29)
    stroke(grid, 1, [2, 2, 4], [17, 2, 4], { radius: 1, normal: [0, 0, 1] }, rec)
    expect(hasBit(grid.scalars[at(9, 2, 2)], 1)).toBe(true)
    brush(grid, 0, [10, 10, 4], { radius: 1, normal: [0, 0, 1], erase: true }, rec)
    expect(hasBit(grid.scalars[at(10, 10, 2)], 0)).toBe(false)
    expect(hasBit(grid.scalars[at(10, 10, 2)], 1)).toBe(false)
  })
  it('keeps only voxels in range with the threshold brush, and thresholds a volume', () => {
    const grid = newGrid()
    const rec = new Recorder(grid)
    brush(grid, 0, [10, 10, 10], { radius: 8, normal: [0, 0, 1], accept: (i) => image(i) > 50 }, rec)
    expect(count(grid, 0)).toBe(81)
    thresholdAll(grid, 1, image, 50, 200, rec)
    expect(count(grid, 1)).toBe([...grid.scalars.keys()].filter((i) => image(i) > 50).length)
  })
  it('grows a region in a slice or the whole volume', () => {
    const grid = newGrid()
    const rec = new Recorder(grid)
    const slice = floodFill(grid, 0, [10, 10, 5], image, { lower: 50, upper: 200, sliceAxis: 2 }, rec)
    expect(slice).toBe(81)
    const all = floodFill(grid, 1, [10, 10, 5], image, { lower: 50, upper: 200 }, rec)
    expect(all).toBe(count(grid, 1))
    expect(all).toBeGreaterThan(slice)
    expect(floodFill(grid, 2, [0, 0, 0], image, { lower: 50, upper: 200 }, rec)).toBe(0)
  })
  it('fills a polygon on one slice or through the volume, and erases', () => {
    const grid = newGrid()
    const rec = new Recorder(grid)
    const square = [[4.5, 4.5, 6], [14.5, 4.5, 6], [14.5, 14.5, 6], [4.5, 14.5, 6]]
    scissors(grid, 0, square, { normal: [0, 0, 1], depth: 'slice' }, rec)
    expect(count(grid, 0)).toBe(100)
    scissors(grid, 1, circlePolygon([10, 10, 0], [13, 10, 0], [0, 0, 1]), { normal: [0, 0, 1], depth: 'volume' }, rec)
    expect(count(grid, 1) % 10).toBe(0)
    expect(count(grid, 1) / 10).toBeGreaterThan(20)
    scissors(grid, 0, square, { normal: [0, 0, 1], depth: 'slice', erase: true }, rec)
    expect(count(grid, 0)).toBe(0)
  })
  it('interpolates between drawn slices', () => {
    const grid = newGrid()
    const rec = new Recorder(grid)
    brush(grid, 0, [10, 10, 0], { radius: 2, normal: [0, 0, 1] }, rec)
    brush(grid, 0, [10, 10, 12], { radius: 6, normal: [0, 0, 1] }, rec)
    expect(interpolateSlices(grid, 0, 2, rec)).toBe(5)
    const sizes = [0, 1, 2, 3, 4, 5, 6].map((k) => [...Array(400).keys()].filter((p) => hasBit(grid.scalars[k * 400 + p], 0)).length)
    expect(sizes.every((s, k) => k === 0 || s >= sizes[k - 1])).toBe(true)
    expect(sizes[3]).toBeGreaterThan(sizes[0])
  })
  it('undoes and redoes edits', () => {
    const grid = newGrid()
    const history = new History()
    const rec = new Recorder(grid)
    brush(grid, 0, [10, 10, 4], { radius: 3, normal: [0, 0, 1] }, rec)
    history.push(rec.finish())
    expect(count(grid, 0)).toBe(29)
    expect(history.undo(grid)).toBe(true)
    expect(count(grid, 0)).toBe(0)
    expect(history.redo(grid)).toBe(true)
    expect(count(grid, 0)).toBe(29)
    expect(history.canRedo).toBe(false)
  })
})

describe('results', () => {
  it('measures volume, values and diameter', () => {
    const grid = newGrid()
    thresholdAll(grid, 0, image, 50, 200, new Recorder(grid))
    const stats = segmentStats(grid, 0, image)
    expect(stats.volume).toBeCloseTo((stats.count * 2) / 1000, 6)
    expect(stats.mean).toBe(100)
    expect(stats.maxDiameter).toBeGreaterThan(9)
    expect(stats.maxDiameter).toBeLessThan(11)
  })
  it('finds TMTV lesions above a SUV threshold or a percentage of the maximum', () => {
    const grid = newGrid()
    const suv = (index: number) => {
      const [i, j, k] = [index % N[0], Math.floor(index / N[0]) % N[1], Math.floor(index / (N[0] * N[1]))]
      if (Math.hypot(i - 5, j - 5, k - 5) <= 2) return 10
      if (Math.hypot(i - 15, j - 15, k - 5) <= 3) return 4
      return 1
    }
    const fixed = tmtv(grid, 0, suv, { suv: 2.5 }, new Recorder(grid), { minVolume: 0 })
    expect(fixed.lesions.length).toBe(2)
    expect(fixed.lesions[0].suvMax).toBe(4)
    expect(fixed.tlg).toBeCloseTo(fixed.lesions.reduce((s, l) => s + l.suvMean * l.volume, 0), 6)
    const percent = tmtv(newGrid(), 0, suv, { percent: 41 }, new Recorder(newGrid()), { minVolume: 0 })
    expect(percent.threshold).toBeCloseTo(4.1, 6)
    expect(percent.lesions.length).toBe(1)
  })
})

describe('saving', () => {
  const source = {
    patientName: 'Test',
    patientId: 'T',
    studyInstanceUID: '1.2.3',
    studyDate: '2026-01-01',
    seriesInstanceUID: '1.2.3.4',
    seriesNumber: 1,
    seriesDescription: 'Segmentation',
    modality: 'SEG',
    referencedSeriesUID: '1.2.3.1',
    frameOfReferenceUID: '1.2.3.200',
  }
  const images = Array.from({ length: N[2] }, (_, k) => ({ sopClassUID: '1.2.840.10008.5.1.4.1.1.2', sopInstanceUID: `1.2.3.1.${k}`, frame: 0 }))
  const segments = [
    { bit: 0, number: 1, label: 'Ball', color: [255, 0, 0] as [number, number, number], algorithmType: 'SEMIAUTOMATIC' },
    { bit: 1, number: 2, label: 'Box', color: [0, 128, 255] as [number, number, number], algorithmType: 'MANUAL' },
  ]

  it('converts colours to CIELab and back', () => {
    expect(dicomLabToRgb(rgbToDicomLab([0, 128, 255])).map((c, n) => Math.abs(c - [0, 128, 255][n]) <= 2)).toEqual([true, true, true])
  })
  it('writes a SEG that reads back', () => {
    const grid = newGrid()
    const rec = new Recorder(grid)
    thresholdAll(grid, 0, image, 50, 200, rec)
    scissors(grid, 1, [[2, 2, 2], [6, 2, 2], [6, 6, 2], [2, 6, 2]], { normal: [0, 0, 1], depth: 'slice' }, rec)
    const { bytes, frames } = writeSeg(source, grid, segments, images)
    const dataSet = dicomParser.parseDicom(bytes)
    const info = segInfo(dataSet)
    expect(info.segments.map((s) => s.label)).toEqual(['Ball', 'Box'])
    expect(info.segments[0].automatic).toBe(true)
    expect(info.referencedInstances.length).toBe(N[2])
    const labels = segLabels(dataSet)!
    expect(frames).toBeGreaterThan(5)
    // The read grid covers only the slices with frames; compare by world position.
    for (let index = 0; index < grid.scalars.length; index++) {
      const [i, j, k] = [index % N[0], Math.floor(index / N[0]) % N[1], Math.floor(index / (N[0] * N[1]))]
      const value = labelAt(labels.grid, [i, j, k * 2])
      if (hasBit(grid.scalars[index], 0) !== hasBit(value, 0)) throw new Error(`differs at ${i},${j},${k}`)
    }
  })
  it('traces contours and writes an RTSTRUCT that reads back', () => {
    const grid = newGrid()
    scissors(grid, 0, [[4.5, 4.5, 4], [9.5, 4.5, 4], [9.5, 9.5, 4], [4.5, 9.5, 4]], { normal: [0, 0, 1], depth: 'slice' }, new Recorder(grid))
    const loops = sliceContours(grid, 0, 2)
    expect(loops.length).toBe(1)
    const xs = loops[0].map((p) => p[0])
    expect([Math.min(...xs), Math.max(...xs)]).toEqual([4.5, 9.5])
    const set = parseRtStruct(dicomParser.parseDicom(writeRtStruct(source, grid, segments.slice(0, 1), images).bytes))
    expect(set.rois[0].label).toBe('Ball')
    expect(set.rois[0].contours.length).toBe(1)
    expect(set.rois[0].contours[0].points[0][2]).toBe(4)
    expect(set.frameOfReferenceUID).toBe('1.2.3.200')
  })
})
