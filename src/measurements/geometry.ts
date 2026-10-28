// Plane geometry and pixel statistics of measurements. Points are 2D, in
// physical units (mm, or pixels when the image has no spacing); pixel (column,
// row) has its centre at (column · sx, row · sy).

export type Point = [number, number]

const sub = (a: Point, b: Point): Point => [a[0] - b[0], a[1] - b[1]]
const dot = (a: Point, b: Point) => a[0] * b[0] + a[1] * b[1]
export const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1])

/** Length of a polyline; closed adds the segment back to the start. */
export function polylineLength(points: Point[], closed = false) {
  let length = 0
  for (let i = 1; i < points.length; i++) length += distance(points[i - 1], points[i])
  if (closed && points.length > 2) length += distance(points[points.length - 1], points[0])
  return length
}

/** Area of a simple polygon (shoelace formula), always positive. */
export function polygonArea(points: Point[]) {
  let twice = 0
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i]
    const [x2, y2] = points[(i + 1) % points.length]
    twice += x1 * y2 - x2 * y1
  }
  return Math.abs(twice) / 2
}

/** Angle at the vertex b between rays b→a and b→c, in degrees (0–180). */
export function angleAt(a: Point, b: Point, c: Point) {
  const u = sub(a, b)
  const v = sub(c, b)
  const cos = dot(u, v) / (Math.hypot(...u) * Math.hypot(...v))
  return (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI
}

/** Cobb angle: the angle between two lines, as an acute angle (0–90°). */
export function angleBetweenLines(a1: Point, a2: Point, b1: Point, b2: Point) {
  const u = sub(a2, a1)
  const v = sub(b2, b1)
  const cos = Math.abs(dot(u, v)) / (Math.hypot(...u) * Math.hypot(...v))
  return (Math.acos(Math.min(1, cos)) * 180) / Math.PI
}

/** Foot of the perpendicular from p to the (infinite) line through a and b, and its length. */
export function perpendicular(a: Point, b: Point, p: Point) {
  const ab = sub(b, a)
  const lengthSq = dot(ab, ab)
  const t = lengthSq === 0 ? 0 : dot(sub(p, a), ab) / lengthSq
  const foot: Point = [a[0] + t * ab[0], a[1] + t * ab[1]]
  return { foot, distance: distance(p, foot) }
}

/** Volume of an ellipsoid from its three diameters: π/6 · L · W · H. */
export const ellipsoidVolume = (l: number, w: number, h: number) => (Math.PI / 6) * l * w * h

/** Points around an ellipse with the given centre and (half-)axis vectors. */
export function ellipsePolygon(center: Point, axisA: Point, axisB: Point, segments = 96): Point[] {
  return Array.from({ length: segments }, (_, i) => {
    const angle = (2 * Math.PI * i) / segments
    const [c, s] = [Math.cos(angle), Math.sin(angle)]
    return [center[0] + c * axisA[0] + s * axisB[0], center[1] + c * axisA[1] + s * axisB[1]]
  })
}

/**
 * Pixels whose centres lie inside a polygon (even–odd rule), as indexes into a
 * width × height image. Rows are scanned once against every edge, so large
 * freehand outlines stay fast.
 */
export function pixelsInPolygon(polygon: Point[], width: number, height: number, sx: number, sy: number): number[] {
  if (polygon.length < 3) return []
  const ys = polygon.map((p) => p[1] / sy)
  const firstRow = Math.max(0, Math.ceil(Math.min(...ys)))
  const lastRow = Math.min(height - 1, Math.floor(Math.max(...ys)))
  const inside: number[] = []
  for (let row = firstRow; row <= lastRow; row++) {
    const y = row * sy
    const crossings: number[] = []
    for (let i = 0; i < polygon.length; i++) {
      const [x1, y1] = polygon[i]
      const [x2, y2] = polygon[(i + 1) % polygon.length]
      // Half-open tests (top and left edges in, bottom and right out), so a pixel
      // centre on a shared edge belongs to exactly one shape.
      if (y1 <= y !== y2 <= y) crossings.push(x1 + ((y - y1) * (x2 - x1)) / (y2 - y1))
    }
    crossings.sort((a, b) => a - b)
    for (let i = 0; i + 1 < crossings.length; i += 2) {
      const from = Math.max(0, Math.ceil(crossings[i] / sx))
      const to = Math.min(width - 1, Math.ceil(crossings[i + 1] / sx) - 1)
      for (let column = from; column <= to; column++) inside.push(row * width + column)
    }
  }
  return inside
}

export interface Statistics {
  count: number
  mean: number
  median: number
  min: number
  max: number
  /** Population standard deviation, as Cornerstone reports it. */
  stdDev: number
}

export function statistics(values: ArrayLike<number>): Statistics | null {
  const count = values.length
  if (count === 0) return null
  let sum = 0
  let min = Infinity
  let max = -Infinity
  for (let i = 0; i < count; i++) {
    const v = values[i]
    sum += v
    if (v < min) min = v
    if (v > max) max = v
  }
  const mean = sum / count
  let squares = 0
  for (let i = 0; i < count; i++) squares += (values[i] - mean) ** 2
  const sorted = Float64Array.from(values).sort()
  const middle = Math.floor(count / 2)
  const median = count % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
  return { count, mean, median, min, max, stdDev: Math.sqrt(squares / count) }
}

/** Counts of values in equal-width bins between min and max. */
export function histogram(values: ArrayLike<number>, bins: number, min: number, max: number): number[] {
  const counts = new Array<number>(bins).fill(0)
  const width = (max - min) / bins
  for (let i = 0; i < values.length; i++) {
    const bin = width > 0 ? Math.floor((values[i] - min) / width) : 0
    counts[Math.max(0, Math.min(bins - 1, bin))]++
  }
  return counts
}

export type LengthUnit = 'mm' | 'cm'

/** A number with sensible precision: fewer decimals for larger values. */
export function round(value: number) {
  const abs = Math.abs(value)
  const decimals = abs >= 100 ? 1 : abs >= 1 ? 2 : 3
  return Number(value.toFixed(decimals)).toString()
}

/** Length in the user's unit; pixels stay pixels. Base is "mm" or "px". */
export function formatLength(mm: number, base: string, unit: LengthUnit) {
  if (base !== 'mm') return `${round(mm)} ${base}`
  return unit === 'cm' ? `${round(mm / 10)} cm` : `${round(mm)} mm`
}

export function formatArea(mm2: number, base: string, unit: LengthUnit) {
  if (base !== 'mm') return `${round(mm2)} ${base}²`
  return unit === 'cm' ? `${round(mm2 / 100)} cm²` : `${round(mm2)} mm²`
}

/** Volumes in cm³ are also millilitres, which is how they are usually reported. */
export function formatVolume(mm3: number, base: string, unit: LengthUnit) {
  if (base !== 'mm') return `${round(mm3)} ${base}³`
  return unit === 'cm' ? `${round(mm3 / 1000)} cm³` : `${round(mm3)} mm³`
}
