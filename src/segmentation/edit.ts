// Editing a label grid (bitmask per voxel, see objects/labels.ts): brush,
// threshold, region growing, scissors, interpolation between slices, and the
// changes each edit makes, for undo and redo.
import { cross, dot, normalize, worldToIndex, type Vec3, type VolumeGrid } from '../volume/grid'
import { hasBit } from '../objects/labels'

export type Grid = VolumeGrid & { scalars: Float32Array }

/** The value of the image under voxel `index` of the label grid (HU, SUV, …). */
export type ValueAt = (index: number) => number

export const withBit = (value: number, bit: number, on: boolean) => {
  const set = hasBit(value, bit)
  return on ? (set ? value : value + 2 ** bit) : set ? value - 2 ** bit : value
}

// --- changes -------------------------------------------------------------------------------

export interface Change {
  indexes: Uint32Array
  before: Float32Array
  after: Float32Array
}

/** Collects the voxels an edit changes, with their values before. */
export class Recorder {
  private readonly before = new Map<number, number>()
  private readonly grid: Grid
  constructor(grid: Grid) {
    this.grid = grid
  }

  set(index: number, value: number) {
    const current = this.grid.scalars[index]
    if (current === value) return
    if (!this.before.has(index)) this.before.set(index, current)
    this.grid.scalars[index] = value
  }

  setBit(index: number, bit: number, on: boolean) {
    this.set(index, withBit(this.grid.scalars[index], bit, on))
  }

  finish(): Change | null {
    const indexes = Uint32Array.from([...this.before.keys()].filter((i) => this.before.get(i) !== this.grid.scalars[i]))
    if (!indexes.length) return null
    return { indexes, before: Float32Array.from(indexes, (i) => this.before.get(i)!), after: Float32Array.from(indexes, (i) => this.grid.scalars[i]) }
  }
}

/** Undo and redo of edits on one grid (the most recent 50). */
export class History {
  private done: Change[] = []
  private undone: Change[] = []
  private readonly limit: number
  constructor(limit = 50) {
    this.limit = limit
  }

  push(change: Change | null) {
    if (!change) return
    this.done.push(change)
    if (this.done.length > this.limit) this.done.shift()
    this.undone = []
  }

  get canUndo() {
    return this.done.length > 0
  }
  get canRedo() {
    return this.undone.length > 0
  }

  undo(grid: Grid) {
    const change = this.done.pop()
    if (!change) return false
    change.indexes.forEach((index, n) => (grid.scalars[index] = change.before[n]))
    this.undone.push(change)
    return true
  }

  redo(grid: Grid) {
    const change = this.undone.pop()
    if (!change) return false
    change.indexes.forEach((index, n) => (grid.scalars[index] = change.after[n]))
    this.done.push(change)
    return true
  }
}

// --- geometry helpers ----------------------------------------------------------------------

const axis = (grid: VolumeGrid, n: number) => grid.direction.slice(n * 3, n * 3 + 3)

/** World position of voxel (i, j, k), fast. */
function worldOf(grid: VolumeGrid) {
  const [a, b, c] = [0, 1, 2].map((n) => axis(grid, n).map((v) => v * grid.spacing[n]))
  const o = grid.origin
  return (i: number, j: number, k: number) => [o[0] + i * a[0] + j * b[0] + k * c[0], o[1] + i * a[1] + j * b[1] + k * c[1], o[2] + i * a[2] + j * b[2] + k * c[2]]
}

/** Half the thickness of a voxel seen along a direction. */
const halfThickness = (grid: VolumeGrid, normal: Vec3) => 0.5 * [0, 1, 2].reduce((sum, n) => sum + Math.abs(dot(normal, axis(grid, n))) * grid.spacing[n], 0)

/** Voxel index ranges covering a sphere of `radius` mm around a world point. */
function boxAround(grid: VolumeGrid, center: Vec3, radius: number) {
  const c = worldToIndex(grid, center)
  return [0, 1, 2].map((n) => [Math.max(0, Math.floor(c[n] - radius / grid.spacing[n])), Math.min(grid.dimensions[n] - 1, Math.ceil(c[n] + radius / grid.spacing[n]))])
}

/** The grid axis closest to a view direction (the "slice" a 2D view shows). */
export function sliceAxis(grid: VolumeGrid, normal: Vec3) {
  const scores = [0, 1, 2].map((n) => Math.abs(dot(normal, axis(grid, n))))
  return scores.indexOf(Math.max(...scores))
}

// --- brush --------------------------------------------------------------------------------------

export interface BrushOptions {
  radius: number
  /** The view's direction; the brush is a disc in the view plane, one voxel thick. */
  normal: Vec3
  erase?: boolean
  /** Only voxels whose image value passes (threshold brush). */
  accept?: (index: number) => boolean
}

export function brush(grid: Grid, bit: number, center: Vec3, options: BrushOptions, recorder: Recorder) {
  const normal = normalize(options.normal)
  const thickness = halfThickness(grid, normal)
  const world = worldOf(grid)
  const [nx, ny] = grid.dimensions
  const [[i0, i1], [j0, j1], [k0, k1]] = boxAround(grid, center, options.radius + thickness)
  const r2 = options.radius * options.radius
  for (let k = k0; k <= k1; k++)
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const p = world(i, j, k)
        const d = [p[0] - center[0], p[1] - center[1], p[2] - center[2]]
        const along = dot(d, normal)
        if (Math.abs(along) > thickness || dot(d, d) - along * along > r2) continue
        const index = k * nx * ny + j * nx + i
        if (options.accept && !options.erase && !options.accept(index)) continue
        recorder.setBit(index, bit, !options.erase)
      }
}

/** A brush dragged from one point to another: discs every half radius. */
export function stroke(grid: Grid, bit: number, from: Vec3, to: Vec3, options: BrushOptions, recorder: Recorder) {
  const length = Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2])
  const steps = Math.max(1, Math.ceil(length / Math.max(0.1, options.radius / 2)))
  for (let s = 0; s <= steps; s++) {
    const t = s / steps
    brush(grid, bit, [0, 1, 2].map((n) => from[n] + (to[n] - from[n]) * t), options, recorder)
  }
}

// --- threshold and region growing ---------------------------------------------------------------

/** Every voxel with a value in [lower, upper] joins the segment (optionally only within another bit). */
export function thresholdAll(grid: Grid, bit: number, valueAt: ValueAt, lower: number, upper: number, recorder: Recorder, within?: number) {
  for (let i = 0; i < grid.scalars.length; i++) {
    if (within !== undefined && !hasBit(grid.scalars[i], within)) continue
    const v = valueAt(i)
    if (v >= lower && v <= upper) recorder.setBit(i, bit, true)
  }
}

export interface FillOptions {
  lower: number
  upper: number
  /** Only within the slice of the seed along this grid axis; the whole volume when absent. */
  sliceAxis?: number
  maxVoxels?: number
}

/** Region growing from a seed voxel: 6-connected voxels with values in range. Returns the voxels filled. */
export function floodFill(grid: Grid, bit: number, seed: number[], valueAt: ValueAt, options: FillOptions, recorder: Recorder) {
  const [nx, ny, nz] = grid.dimensions
  const [si, sj, sk] = seed.map(Math.round)
  if (si < 0 || sj < 0 || sk < 0 || si >= nx || sj >= ny || sk >= nz) return 0
  const limit = options.maxVoxels ?? 5_000_000
  const inRange = (index: number) => {
    const v = valueAt(index)
    return v >= options.lower && v <= options.upper
  }
  const start = sk * nx * ny + sj * nx + si
  if (!inRange(start)) return 0
  const fixed = options.sliceAxis
  const seen = new Uint8Array(grid.scalars.length)
  let queue = new Int32Array(1024)
  let head = 0
  let tail = 0
  queue[tail++] = start
  seen[start] = 1
  let filled = 0
  while (head < tail && filled < limit) {
    const index = queue[head++]
    recorder.setBit(index, bit, true)
    filled++
    const i = index % nx
    const j = Math.floor(index / nx) % ny
    const k = Math.floor(index / (nx * ny))
    const neighbours: [number, number, number, number][] = [
      [i - 1, j, k, 0],
      [i + 1, j, k, 0],
      [i, j - 1, k, 1],
      [i, j + 1, k, 1],
      [i, j, k - 1, 2],
      [i, j, k + 1, 2],
    ]
    for (const [a, b, c, along] of neighbours) {
      if (along === fixed || a < 0 || b < 0 || c < 0 || a >= nx || b >= ny || c >= nz) continue
      const next = c * nx * ny + b * nx + a
      if (seen[next] || !inRange(next)) continue
      seen[next] = 1
      if (tail === queue.length) {
        const bigger = new Int32Array(queue.length * 2)
        bigger.set(queue)
        queue = bigger
      }
      queue[tail++] = next
    }
  }
  return filled
}

// --- scissors and contours ----------------------------------------------------------------------

export interface ScissorsOptions {
  normal: Vec3
  erase?: boolean
  /** "slice": only the voxels on the drawing's plane; "volume": the whole depth along the normal. */
  depth: 'slice' | 'volume'
}

/** A plane basis (u, v) for a normal. */
export function planeBasis(normal: Vec3) {
  const n = normalize(normal)
  const helper = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]
  const u = normalize(cross(n, helper))
  const v = normalize(cross(n, u))
  return { n, u, v }
}

const insidePolygon = (x: number, y: number, polygon: number[][]) => {
  let inside = false
  for (let a = 0, b = polygon.length - 1; a < polygon.length; b = a++) {
    const [xa, ya] = polygon[a]
    const [xb, yb] = polygon[b]
    if (ya > y !== yb > y && x < ((xb - xa) * (y - ya)) / (yb - ya) + xa) inside = !inside
  }
  return inside
}

/** Fills (or erases) the voxels inside a closed polygon drawn on a view plane. */
export function scissors(grid: Grid, bit: number, polygon: Vec3[], options: ScissorsOptions, recorder: Recorder) {
  if (polygon.length < 3) return
  const { n, u, v } = planeBasis(options.normal)
  const flat = polygon.map((p) => [dot(p, u), dot(p, v)])
  const [minU, maxU, minV, maxV] = [Math.min(...flat.map((p) => p[0])), Math.max(...flat.map((p) => p[0])), Math.min(...flat.map((p) => p[1])), Math.max(...flat.map((p) => p[1]))]
  const plane = dot(polygon[0], n)
  const thickness = halfThickness(grid, n)
  const world = worldOf(grid)
  const [nx, ny, nz] = grid.dimensions
  // Index bounds: the polygon's box, and for one slice only near its plane.
  let box = [
    [0, nx - 1],
    [0, ny - 1],
    [0, nz - 1],
  ]
  if (options.depth === 'slice') {
    const corners = polygon.map((p) => worldToIndex(grid, p))
    box = [0, 1, 2].map((d) => [Math.max(0, Math.floor(Math.min(...corners.map((c) => c[d])) - 1)), Math.min(grid.dimensions[d] - 1, Math.ceil(Math.max(...corners.map((c) => c[d])) + 1))])
  }
  for (let k = box[2][0]; k <= box[2][1]; k++)
    for (let j = box[1][0]; j <= box[1][1]; j++)
      for (let i = box[0][0]; i <= box[0][1]; i++) {
        const p = world(i, j, k)
        if (options.depth === 'slice' && Math.abs(dot(p, n) - plane) > thickness) continue
        const pu = dot(p, u)
        const pv = dot(p, v)
        if (pu < minU || pu > maxU || pv < minV || pv > maxV || !insidePolygon(pu, pv, flat)) continue
        recorder.setBit(k * nx * ny + j * nx + i, bit, !options.erase)
      }
}

/** A circle on a view plane as a polygon. */
export function circlePolygon(center: Vec3, edge: Vec3, normal: Vec3, sides = 48): Vec3[] {
  const { u, v } = planeBasis(normal)
  const r = Math.hypot(edge[0] - center[0], edge[1] - center[1], edge[2] - center[2])
  return Array.from({ length: sides }, (_, s) => {
    const a = (s / sides) * 2 * Math.PI
    return [0, 1, 2].map((d) => center[d] + r * (Math.cos(a) * u[d] + Math.sin(a) * v[d]))
  })
}

// --- interpolation between slices ---------------------------------------------------------------

/** Chamfer distance (in pixels) from every pixel to the nearest pixel where `target` is true. */
function distanceTo(target: Uint8Array, width: number, height: number) {
  const d = new Float32Array(width * height).fill(1e9)
  for (let i = 0; i < d.length; i++) if (target[i]) d[i] = 0
  const pass = (x: number, y: number, dx: number, dy: number, w: number) => {
    const xx = x + dx
    const yy = y + dy
    if (xx < 0 || yy < 0 || xx >= width || yy >= height) return
    const i = y * width + x
    d[i] = Math.min(d[i], d[yy * width + xx] + w)
  }
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      pass(x, y, -1, 0, 1)
      pass(x, y, 0, -1, 1)
      pass(x, y, -1, -1, Math.SQRT2)
      pass(x, y, 1, -1, Math.SQRT2)
    }
  for (let y = height - 1; y >= 0; y--)
    for (let x = width - 1; x >= 0; x--) {
      pass(x, y, 1, 0, 1)
      pass(x, y, 0, 1, 1)
      pass(x, y, 1, 1, Math.SQRT2)
      pass(x, y, -1, 1, Math.SQRT2)
    }
  return d
}

/** Signed distance of a slice mask: negative inside, positive outside. */
function signedDistance(mask: Uint8Array, width: number, height: number) {
  const outside = Uint8Array.from(mask, (m) => 1 - m)
  const toInside = distanceTo(mask, width, height)
  const toOutside = distanceTo(outside, width, height)
  return Float32Array.from(mask, (m, i) => (m ? -toOutside[i] + 0.5 : toInside[i] - 0.5))
}

/**
 * Fills empty slices between drawn ones along a grid axis by blending the
 * signed distances of the nearest drawn slices (shape-based interpolation).
 * Returns how many slices were filled.
 */
export function interpolateSlices(grid: Grid, bit: number, along: number, recorder: Recorder) {
  const dims = grid.dimensions
  const [a, b] = [0, 1, 2].filter((n) => n !== along)
  const [width, height] = [dims[a], dims[b]]
  const index = (s: number, x: number, y: number) => {
    const p = [0, 0, 0]
    p[along] = s
    p[a] = x
    p[b] = y
    return p[2] * dims[0] * dims[1] + p[1] * dims[0] + p[0]
  }
  const maskOf = (s: number) => {
    const mask = new Uint8Array(width * height)
    let any = false
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++)
        if (hasBit(grid.scalars[index(s, x, y)], bit)) {
          mask[y * width + x] = 1
          any = true
        }
    return any ? mask : null
  }
  const drawn: number[] = []
  const masks = new Map<number, Uint8Array>()
  for (let s = 0; s < dims[along]; s++) {
    const mask = maskOf(s)
    if (mask) {
      drawn.push(s)
      masks.set(s, mask)
    }
  }
  let filled = 0
  for (let n = 0; n + 1 < drawn.length; n++) {
    const [s0, s1] = [drawn[n], drawn[n + 1]]
    if (s1 - s0 < 2) continue
    const d0 = signedDistance(masks.get(s0)!, width, height)
    const d1 = signedDistance(masks.get(s1)!, width, height)
    for (let s = s0 + 1; s < s1; s++) {
      const t = (s - s0) / (s1 - s0)
      for (let p = 0; p < width * height; p++) if ((1 - t) * d0[p] + t * d1[p] <= 0) recorder.setBit(index(s, p % width, Math.floor(p / width)), bit, true)
      filled++
    }
  }
  return filled
}

// --- statistics -----------------------------------------------------------------------------------

export interface SegmentStats {
  count: number
  /** cm³ */
  volume: number
  mean: number
  sd: number
  min: number
  max: number
  /** Longest distance between two surface voxels (mm). */
  maxDiameter: number
}

export function segmentStats(grid: Grid, bit: number, valueAt: ValueAt): SegmentStats {
  const [nx, ny, nz] = grid.dimensions
  const world = worldOf(grid)
  let count = 0
  let sum = 0
  let sum2 = 0
  let min = Infinity
  let max = -Infinity
  const surface: number[][] = []
  const on = (i: number, j: number, k: number) => i >= 0 && j >= 0 && k >= 0 && i < nx && j < ny && k < nz && hasBit(grid.scalars[k * nx * ny + j * nx + i], bit)
  for (let k = 0; k < nz; k++)
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) {
        const index = k * nx * ny + j * nx + i
        if (!hasBit(grid.scalars[index], bit)) continue
        count++
        const v = valueAt(index)
        if (Number.isFinite(v)) {
          sum += v
          sum2 += v * v
          min = Math.min(min, v)
          max = Math.max(max, v)
        }
        if (!on(i - 1, j, k) || !on(i + 1, j, k) || !on(i, j - 1, k) || !on(i, j + 1, k) || !on(i, j, k - 1) || !on(i, j, k + 1)) surface.push(world(i, j, k))
      }
  // The diameter compares every pair of surface voxels; large surfaces are sampled.
  const step = Math.max(1, Math.ceil(surface.length / 2500))
  const points = surface.filter((_, n) => n % step === 0)
  let diameter = 0
  for (let p = 0; p < points.length; p++)
    for (let q = p + 1; q < points.length; q++) {
      const d = (points[p][0] - points[q][0]) ** 2 + (points[p][1] - points[q][1]) ** 2 + (points[p][2] - points[q][2]) ** 2
      if (d > diameter) diameter = d
    }
  const mean = count ? sum / count : NaN
  return {
    count,
    volume: (count * grid.spacing[0] * grid.spacing[1] * grid.spacing[2]) / 1000,
    mean,
    sd: count ? Math.sqrt(Math.max(0, sum2 / count - mean * mean)) : NaN,
    min: count ? min : NaN,
    max: count ? max : NaN,
    maxDiameter: Math.sqrt(diameter),
  }
}

// --- TMTV ------------------------------------------------------------------------------------------

export interface Lesion {
  count: number
  volume: number
  suvMax: number
  suvMean: number
  /** Total lesion glycolysis: SUVmean × volume (g, with SUV in g/ml). */
  tlg: number
}

export interface TmtvResult {
  threshold: number
  lesions: Lesion[]
  volume: number
  tlg: number
}

/**
 * Total metabolic tumour volume: voxels at or above a SUV threshold (a fixed
 * value, or a percentage of the maximum), optionally only inside another
 * segment, kept as 6-connected lesions of at least `minVolume` cm³.
 */
export function tmtv(grid: Grid, bit: number, suvAt: ValueAt, threshold: { suv: number } | { percent: number }, recorder: Recorder, options: { within?: number; minVolume?: number } = {}): TmtvResult {
  const candidates = (i: number) => options.within === undefined || hasBit(grid.scalars[i], options.within)
  let peak = -Infinity
  for (let i = 0; i < grid.scalars.length; i++) if (candidates(i)) peak = Math.max(peak, suvAt(i))
  const cut = 'suv' in threshold ? threshold.suv : (peak * threshold.percent) / 100
  const [nx, ny, nz] = grid.dimensions
  const voxel = (grid.spacing[0] * grid.spacing[1] * grid.spacing[2]) / 1000
  const minVoxels = Math.max(1, Math.ceil((options.minVolume ?? 0.1) / voxel))
  const visited = new Uint8Array(grid.scalars.length)
  const above = (i: number) => candidates(i) && suvAt(i) >= cut
  const lesions: Lesion[] = []
  const stack: number[] = []
  for (let start = 0; start < grid.scalars.length; start++) {
    if (visited[start] || !above(start)) continue
    const members: number[] = []
    stack.push(start)
    visited[start] = 1
    while (stack.length) {
      const index = stack.pop()!
      members.push(index)
      const i = index % nx
      const j = Math.floor(index / nx) % ny
      const k = Math.floor(index / (nx * ny))
      for (const [a, b, c] of [
        [i - 1, j, k],
        [i + 1, j, k],
        [i, j - 1, k],
        [i, j + 1, k],
        [i, j, k - 1],
        [i, j, k + 1],
      ]) {
        if (a < 0 || b < 0 || c < 0 || a >= nx || b >= ny || c >= nz) continue
        const next = c * nx * ny + b * nx + a
        if (visited[next] || !above(next)) continue
        visited[next] = 1
        stack.push(next)
      }
    }
    if (members.length < minVoxels) continue
    let sum = 0
    let max = -Infinity
    for (const m of members) {
      const v = suvAt(m)
      sum += v
      max = Math.max(max, v)
      recorder.setBit(m, bit, true)
    }
    const volume = members.length * voxel
    lesions.push({ count: members.length, volume, suvMax: max, suvMean: sum / members.length, tlg: (sum / members.length) * volume })
  }
  lesions.sort((a, b) => b.volume - a.volume)
  return { threshold: cut, lesions, volume: lesions.reduce((s, l) => s + l.volume, 0), tlg: lesions.reduce((s, l) => s + l.tlg, 0) }
}

/** Removes a bit everywhere (clearing a segment). */
export function clearSegment(grid: Grid, bit: number, recorder: Recorder) {
  for (let i = 0; i < grid.scalars.length; i++) if (hasBit(grid.scalars[i], bit)) recorder.setBit(i, bit, false)
}

/** Value lookup for a label grid laid over another grid (e.g. the image volume). */
export function valuesFrom(labels: VolumeGrid, image: VolumeGrid, sampler: (grid: VolumeGrid, world: number[]) => number): ValueAt {
  const same = labels.dimensions.every((d, n) => d === image.dimensions[n]) && labels.spacing.every((s, n) => Math.abs(s - image.spacing[n]) < 1e-6) && labels.origin.every((o, n) => Math.abs(o - image.origin[n]) < 1e-6)
  if (same) return (index) => image.scalars[index]
  const world = worldOf(labels)
  const [nx, ny] = labels.dimensions
  return (index) => sampler(image, world(index % nx, Math.floor(index / nx) % ny, Math.floor(index / (nx * ny))))
}
