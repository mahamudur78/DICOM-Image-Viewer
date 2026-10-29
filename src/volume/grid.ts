// A volume as a regular grid in patient space, and sampling it: trilinear
// values, planes (MPR slices), curved reformats (CPR) and rays (3D picking).

export type Vec3 = number[]

export interface VolumeGrid {
  /** Voxels along i, j, k. */
  dimensions: [number, number, number]
  /** mm between voxels along i, j, k. */
  spacing: [number, number, number]
  /** World position of voxel (0, 0, 0). */
  origin: Vec3
  /** Direction cosines of i, j, k, as 9 numbers (i first), like vtk. */
  direction: number[]
  /** Values, i fastest, then j, then k. */
  scalars: ArrayLike<number>
}

export const add = (a: Vec3, b: Vec3) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
export const sub = (a: Vec3, b: Vec3) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
export const scale = (a: Vec3, s: number) => [a[0] * s, a[1] * s, a[2] * s]
export const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
export const cross = (a: Vec3, b: Vec3) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
export const length = (a: Vec3) => Math.hypot(a[0], a[1], a[2])
export const normalize = (a: Vec3) => {
  const l = length(a)
  return l > 0 ? scale(a, 1 / l) : [0, 0, 0]
}

const axis = (grid: VolumeGrid, n: number) => grid.direction.slice(n * 3, n * 3 + 3)

/** Continuous voxel index (i, j, k) of a world point. */
export function worldToIndex(grid: VolumeGrid, world: Vec3): Vec3 {
  const d = sub(world, grid.origin)
  return [0, 1, 2].map((n) => dot(d, axis(grid, n)) / grid.spacing[n])
}

export function indexToWorld(grid: VolumeGrid, index: Vec3): Vec3 {
  return [0, 1, 2].map((c) => grid.origin[c] + [0, 1, 2].reduce((sum, n) => sum + index[n] * grid.spacing[n] * axis(grid, n)[c], 0))
}

/** The value at a world point, interpolated between the 8 nearest voxels; `outside` beyond the grid. */
export function sample(grid: VolumeGrid, world: Vec3, outside = NaN) {
  const [x, y, z] = worldToIndex(grid, world)
  const [nx, ny, nz] = grid.dimensions
  if (x < 0 || y < 0 || z < 0 || x > nx - 1 || y > ny - 1 || z > nz - 1) return outside
  const x0 = Math.min(Math.floor(x), nx - 2 < 0 ? 0 : nx - 2)
  const y0 = Math.min(Math.floor(y), ny - 2 < 0 ? 0 : ny - 2)
  const z0 = Math.min(Math.floor(z), nz - 2 < 0 ? 0 : nz - 2)
  const fx = nx > 1 ? x - x0 : 0
  const fy = ny > 1 ? y - y0 : 0
  const fz = nz > 1 ? z - z0 : 0
  const x1 = Math.min(x0 + 1, nx - 1)
  const y1 = Math.min(y0 + 1, ny - 1)
  const z1 = Math.min(z0 + 1, nz - 1)
  const s = grid.scalars
  const at = (i: number, j: number, k: number) => s[i + nx * (j + ny * k)]
  const c00 = at(x0, y0, z0) * (1 - fx) + at(x1, y0, z0) * fx
  const c10 = at(x0, y1, z0) * (1 - fx) + at(x1, y1, z0) * fx
  const c01 = at(x0, y0, z1) * (1 - fx) + at(x1, y0, z1) * fx
  const c11 = at(x0, y1, z1) * (1 - fx) + at(x1, y1, z1) * fx
  return (c00 * (1 - fy) + c10 * fy) * (1 - fz) + (c01 * (1 - fy) + c11 * fy) * fz
}

/** A plane image: its top-left pixel centre, row and column directions, pixel size in mm and pixel count. */
export interface PlaneSpec {
  origin: Vec3
  row: Vec3
  column: Vec3
  pixelSpacing: number
  columns: number
  rows: number
}

/** Resamples the volume on a plane (an oblique slice), row by row. */
export function slicePlane(grid: VolumeGrid, plane: PlaneSpec, outside = NaN): Float32Array {
  const out = new Float32Array(plane.columns * plane.rows)
  const dx = scale(normalize(plane.row), plane.pixelSpacing)
  const dy = scale(normalize(plane.column), plane.pixelSpacing)
  for (let r = 0; r < plane.rows; r++) {
    const start = add(plane.origin, scale(dy, r))
    for (let c = 0; c < plane.columns; c++) out[r * plane.columns + c] = sample(grid, add(start, scale(dx, c)), outside)
  }
  return out
}

/** The world corners of the grid, for planes that cover the whole volume. */
export function gridCorners(grid: VolumeGrid) {
  const [nx, ny, nz] = grid.dimensions.map((n) => n - 1)
  return [0, nx].flatMap((i) => [0, ny].flatMap((j) => [0, nz].map((k) => indexToWorld(grid, [i, j, k]))))
}

// --- curved planar reformation -------------------------------------------------------------

/** Points every `step` mm along a Catmull-Rom curve through the control points, with unit tangents. */
export function resampleCurve(points: Vec3[], step: number): { points: Vec3[]; tangents: Vec3[] } {
  if (points.length < 2) return { points: [...points], tangents: points.map(() => [1, 0, 0]) }
  // A dense polyline along the spline, then evenly spaced points on it.
  const dense: Vec3[] = []
  const p = (i: number) => points[Math.max(0, Math.min(points.length - 1, i))]
  for (let i = 0; i < points.length - 1; i++) {
    for (let s = 0; s < 32; s++) {
      const t = s / 32
      const [p0, p1, p2, p3] = [p(i - 1), p(i), p(i + 1), p(i + 2)]
      dense.push(
        [0, 1, 2].map((c) => 0.5 * (2 * p1[c] + (-p0[c] + p2[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t * t + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t * t * t)),
      )
    }
  }
  dense.push(points[points.length - 1])
  const out: Vec3[] = [dense[0]]
  let carried = 0
  for (let i = 1; i < dense.length; i++) {
    let segment = length(sub(dense[i], dense[i - 1]))
    let from = dense[i - 1]
    while (carried + segment >= step) {
      const t = (step - carried) / segment
      const point = add(from, scale(sub(dense[i], from), t))
      out.push(point)
      segment -= step - carried
      from = point
      carried = 0
    }
    carried += segment
  }
  const tangents = out.map((_, i) => normalize(sub(out[Math.min(out.length - 1, i + 1)], out[Math.max(0, i - 1)])))
  return { points: out, tangents }
}

export interface CprOptions {
  /** Direction of the image's vertical axis (e.g. the plane normal: z for a curve drawn on axial). */
  up: Vec3
  /** Height of the image in mm, centred on the curve. */
  height: number
  /** mm per pixel, along the curve and up. */
  pixelSpacing: number
  /** Slab thickness in mm across the curve (maximum intensity); 0 for a thin reformat. */
  thickness: number
}

/**
 * A straightened curved reformat: each column is the volume along `up`
 * through one point of the curve; the curve runs left to right.
 */
export function curvedReformat(grid: VolumeGrid, curve: Vec3[], options: CprOptions) {
  const { points, tangents } = resampleCurve(curve, options.pixelSpacing)
  const up = normalize(options.up)
  const rows = Math.max(1, Math.round(options.height / options.pixelSpacing))
  const columns = points.length
  const data = new Float32Array(rows * columns)
  const layers = Math.max(1, Math.round(options.thickness / options.pixelSpacing))
  for (let c = 0; c < columns; c++) {
    // Across the curve, in the plane perpendicular to up.
    const across = normalize(cross(tangents[c], up))
    for (let r = 0; r < rows; r++) {
      const centre = add(points[c], scale(up, (rows / 2 - r) * options.pixelSpacing))
      let value = -Infinity
      for (let l = 0; l < layers; l++) {
        const offset = layers === 1 ? 0 : (l - (layers - 1) / 2) * options.pixelSpacing
        const v = sample(grid, add(centre, scale(across, offset)))
        if (!Number.isNaN(v) && v > value) value = v
      }
      data[r * columns + c] = value === -Infinity ? NaN : value
    }
  }
  return { data, columns, rows, length: (columns - 1) * options.pixelSpacing }
}

// --- rays ----------------------------------------------------------------------------------

/**
 * The first point along a ray where `isVisible(value)` holds, stepping
 * `step` mm, or null if the ray leaves the volume first.
 */
export function firstHit(
  grid: VolumeGrid,
  origin: Vec3,
  direction: Vec3,
  isVisible: (value: number) => boolean,
  step = 0.5,
  maxDistance = 5000,
  /** Points cut away (cropping, clipping) are skipped. */
  isKept: (point: Vec3) => boolean = () => true,
): Vec3 | null {
  const dir = normalize(direction)
  let entered = false
  for (let t = 0; t <= maxDistance; t += step) {
    const point = add(origin, scale(dir, t))
    const value = sample(grid, point)
    if (Number.isNaN(value)) {
      if (entered) return null
      continue
    }
    entered = true
    if (isVisible(value) && isKept(point)) return point
  }
  return null
}
