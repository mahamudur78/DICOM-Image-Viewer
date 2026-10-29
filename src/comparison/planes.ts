// Geometry of image planes in patient (world) coordinates: slice positions
// along a normal, which plane a series is in, and where one image's plane
// crosses another image (reference lines).

export type Vec3 = [number, number, number] | number[]

export const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
export const cross = (a: Vec3, b: Vec3): number[] => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]

/** An image in space: top-left pixel centre, row and column directions, pixel spacing, size. */
export interface ImagePlane {
  origin: Vec3
  /** Direction along a row (increasing column). */
  row: Vec3
  /** Direction down a column (increasing row). */
  column: Vec3
  /** Spacing between columns (x) and rows (y). */
  spacingX: number
  spacingY: number
  columns: number
  rows: number
}

export const normalOf = (plane: Pick<ImagePlane, 'row' | 'column'>) => cross(plane.row, plane.column)

/** Whether two normals describe the same plane orientation (either direction). */
export const isParallel = (a: Vec3, b: Vec3, tolerance = 0.99) => Math.abs(dot(a, b)) >= tolerance

export type PlaneName = 'axial' | 'sagittal' | 'coronal' | 'oblique'

/** The anatomical plane of an image orientation (row and column cosines). */
export function planeName(row: Vec3, column: Vec3): PlaneName {
  const normal = cross(row, column).map(Math.abs)
  const largest = Math.max(...normal)
  if (largest < 0.8) return 'oblique'
  return largest === normal[2] ? 'axial' : largest === normal[0] ? 'sagittal' : 'coronal'
}

/** Index of the slice whose position along the normal is closest to a distance. */
export function nearestSlice(positions: Vec3[], normal: Vec3, distance: number) {
  let best = -1
  let bestGap = Infinity
  positions.forEach((position, i) => {
    const gap = Math.abs(dot(position, normal) - distance)
    if (gap < bestGap) {
      best = i
      bestGap = gap
    }
  })
  return { index: best, gap: bestGap }
}

/** World position of image coordinates (column, row). */
export function imageToWorld(plane: ImagePlane, x: number, y: number): number[] {
  return [0, 1, 2].map((i) => plane.origin[i] + x * plane.spacingX * plane.row[i] + y * plane.spacingY * plane.column[i])
}

/**
 * The segment where the source image crosses the target image, in target
 * image coordinates (column, row), limited to both images. Null when the
 * planes are (nearly) parallel or do not meet inside both images.
 */
export function crossingSegment(source: ImagePlane, target: ImagePlane): [number[], number[]] | null {
  const n = normalOf(source)
  if (isParallel(n, normalOf(target), 0.999)) return null
  // Points of the target: P(u, v) = O + u·sx·row + v·sy·col; on the source plane when n·P = n·Os.
  const a = target.spacingX * dot(n, target.row)
  const b = target.spacingY * dot(n, target.column)
  const c = dot(n, source.origin) - dot(n, target.origin)
  // The line a·u + b·v = c, as point + t·direction.
  const length = Math.hypot(a, b)
  const point = [(a * c) / length ** 2, (b * c) / length ** 2]
  const direction = [-b / length, a / length]

  let low = -Infinity
  let high = Infinity
  /** Keeps t where lo ≤ value + slope·t ≤ hi. */
  const clip = (value: number, slope: number, lo: number, hi: number) => {
    if (Math.abs(slope) < 1e-12) {
      if (value < lo || value > hi) high = -Infinity
      return
    }
    const t1 = (lo - value) / slope
    const t2 = (hi - value) / slope
    low = Math.max(low, Math.min(t1, t2))
    high = Math.min(high, Math.max(t1, t2))
  }
  // Inside the target image (pixel edges are half a pixel beyond the centres).
  clip(point[0], direction[0], -0.5, target.columns - 0.5)
  clip(point[1], direction[1], -0.5, target.rows - 0.5)
  // Inside the source image: its coordinates are affine in t too.
  const world0 = imageToWorld(target, point[0], point[1])
  const worldStep = [0, 1, 2].map((i) => direction[0] * target.spacingX * target.row[i] + direction[1] * target.spacingY * target.column[i])
  const offset = [0, 1, 2].map((i) => world0[i] - source.origin[i])
  clip(dot(offset, source.row) / source.spacingX, dot(worldStep, source.row) / source.spacingX, -0.5, source.columns - 0.5)
  clip(dot(offset, source.column) / source.spacingY, dot(worldStep, source.column) / source.spacingY, -0.5, source.rows - 0.5)
  if (!(high > low)) return null
  const at = (t: number) => [point[0] + t * direction[0], point[1] + t * direction[1]]
  return [at(low), at(high)]
}
