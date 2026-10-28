import { describe, expect, it } from 'vitest'
import {
  angleAt,
  angleBetweenLines,
  ellipsePolygon,
  ellipsoidVolume,
  formatArea,
  formatLength,
  formatVolume,
  histogram,
  perpendicular,
  pixelsInPolygon,
  polygonArea,
  polylineLength,
  statistics,
  type Point,
} from './geometry'

describe('geometry', () => {
  it('measures polylines and polygons', () => {
    const square: Point[] = [[0, 0], [10, 0], [10, 10], [0, 10]]
    expect(polylineLength(square)).toBe(30)
    expect(polylineLength(square, true)).toBe(40)
    expect(polygonArea(square)).toBe(100)
    expect(polygonArea([...square].reverse())).toBe(100)
  })

  it('measures angles', () => {
    expect(angleAt([10, 0], [0, 0], [0, 10])).toBeCloseTo(90)
    expect(angleAt([10, 0], [0, 0], [-10, 0])).toBeCloseTo(180)
    // Cobb: lines at 30° and 150° (same as −30°) meet at 60°.
    const at = (deg: number): Point => [Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180)]
    expect(angleBetweenLines([0, 0], at(30), [0, 0], at(150))).toBeCloseTo(60)
    expect(angleBetweenLines([0, 0], at(30), [5, 5], [5 + at(30)[0], 5 + at(30)[1]])).toBeCloseTo(0)
  })

  it('finds the perpendicular distance to a line', () => {
    const { foot, distance } = perpendicular([0, 0], [10, 0], [3, 4])
    expect(foot).toEqual([3, 0])
    expect(distance).toBe(4)
    // Beyond the segment the line still extends.
    expect(perpendicular([0, 0], [1, 0], [5, -2]).distance).toBe(2)
  })

  it('computes ellipsoid volume', () => {
    // A sphere of diameter 2: 4/3·π.
    expect(ellipsoidVolume(2, 2, 2)).toBeCloseTo((4 / 3) * Math.PI)
  })

  it('finds the pixels inside a polygon', () => {
    // Pixel centres 1..3 in both directions of a 5×5 image.
    const square: Point[] = [[0.5, 0.5], [3.5, 0.5], [3.5, 3.5], [0.5, 3.5]]
    const inside = pixelsInPolygon(square, 5, 5, 1, 1)
    expect(inside).toHaveLength(9)
    expect(inside).toContain(1 * 5 + 1)
    expect(inside).not.toContain(0)
    // Spacing: the same physical square on 0.5 mm pixels covers twice the pixels per side.
    expect(pixelsInPolygon(square, 10, 10, 0.5, 0.5)).toHaveLength(36)
    // Clipped to the image.
    expect(pixelsInPolygon([[-5, -5], [50, -5], [50, 50], [-5, 50]], 4, 3, 1, 1)).toHaveLength(12)
  })

  it('approximates a circle closely enough for its pixels', () => {
    const circle = ellipsePolygon([50, 50], [20, 0], [0, 20])
    expect(polygonArea(circle)).toBeCloseTo(Math.PI * 400, -1)
    expect(Math.abs(pixelsInPolygon(circle, 100, 100, 1, 1).length - Math.PI * 400)).toBeLessThan(30)
  })

  it('computes statistics', () => {
    const stats = statistics([1, 2, 3, 4, 100])!
    expect(stats).toMatchObject({ count: 5, min: 1, max: 100, median: 3, mean: 22 })
    expect(stats.stdDev).toBeCloseTo(39.0128, 3)
    expect(statistics([4, 1, 3, 2])!.median).toBe(2.5)
    expect(statistics([])).toBeNull()
  })

  it('bins values', () => {
    expect(histogram([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 2, 0, 10)).toEqual([5, 6])
    expect(histogram([3, 3], 4, 3, 3)).toEqual([2, 0, 0, 0])
  })

  it('formats values in the chosen unit', () => {
    expect(formatLength(12.345, 'mm', 'mm')).toBe('12.35 mm')
    expect(formatLength(123.45, 'mm', 'cm')).toBe('12.35 cm')
    expect(formatLength(40, 'px', 'cm')).toBe('40 px')
    expect(formatArea(250, 'mm', 'cm')).toBe('2.5 cm²')
    expect(formatArea(250, 'px', 'mm')).toBe('250 px²')
    expect(formatVolume(4189, 'mm', 'cm')).toBe('4.19 cm³')
  })
})
