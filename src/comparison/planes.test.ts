import { describe, expect, it } from 'vitest'
import { crossingSegment, isParallel, nearestSlice, normalOf, planeName, type ImagePlane } from './planes'

// A 100 × 100 axial image at z = 0, 1 mm pixels, from (-50, -50).
const axial = (z = 0): ImagePlane => ({ origin: [-50, -50, z], row: [1, 0, 0], column: [0, 1, 0], spacingX: 1, spacingY: 1, columns: 100, rows: 100 })
// A sagittal image at x, rows along y, columns down along -z, from z = 40 to -39.
const sagittal = (x: number): ImagePlane => ({ origin: [x, -50, 40], row: [0, 1, 0], column: [0, 0, -1], spacingX: 1, spacingY: 1, columns: 100, rows: 80 })

describe('planes', () => {
  it('names planes', () => {
    expect(planeName([1, 0, 0], [0, 1, 0])).toBe('axial')
    expect(planeName([0, 1, 0], [0, 0, -1])).toBe('sagittal')
    expect(planeName([1, 0, 0], [0, 0, -1])).toBe('coronal')
    expect(planeName([1, 0, 0], [0, Math.SQRT1_2, Math.SQRT1_2])).toBe('oblique')
  })

  it('finds the nearest slice along a normal', () => {
    const positions = [0, 5, 10, 15].map((z) => [0, 0, z])
    expect(nearestSlice(positions, [0, 0, 1], 11)).toEqual({ index: 2, gap: 1 })
    // Opposite normal: distances change sign.
    expect(nearestSlice(positions, [0, 0, -1], -14).index).toBe(3)
    expect(isParallel([0, 0, 1], [0, 0, -1])).toBe(true)
    expect(isParallel(normalOf(axial()), normalOf(sagittal(0)))).toBe(false)
  })

  it('draws a sagittal slice as a vertical line on an axial image', () => {
    const segment = crossingSegment(sagittal(10), axial(0))!
    // x = 10 is column 60 of the axial image; the line runs the full height.
    expect(segment[0][0]).toBeCloseTo(60)
    expect(segment[1][0]).toBeCloseTo(60)
    expect(Math.min(segment[0][1], segment[1][1])).toBeCloseTo(-0.5)
    expect(Math.max(segment[0][1], segment[1][1])).toBeCloseTo(99.5)
  })

  it('limits the line to the source image', () => {
    // An axial image at z = 0 crosses the sagittal image at row 40 (z = 40 - 40).
    const segment = crossingSegment(axial(0), sagittal(10))!
    expect(segment[0][1]).toBeCloseTo(40)
    // A small axial image (columns 0..19 in y from -50) covers only part of the row.
    const small = { ...axial(0), rows: 20 }
    const part = crossingSegment(small, sagittal(10))!
    const columns = [part[0][0], part[1][0]].sort((a, b) => a - b)
    expect(columns[0]).toBeCloseTo(-0.5)
    expect(columns[1]).toBeCloseTo(19.5)
  })

  it('returns nothing for parallel planes or planes that miss', () => {
    expect(crossingSegment(axial(5), axial(0))).toBeNull()
    // The axial image at z = 100 is above the sagittal image (z 40 … -39).
    expect(crossingSegment(axial(100), sagittal(0))).toBeNull()
  })
})
