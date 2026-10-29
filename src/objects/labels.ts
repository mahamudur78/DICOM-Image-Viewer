// Label grids: a volume whose voxels hold a bitmask of the segments (or
// structures) present, so overlapping segments keep their own colours.
import { cross, dot, normalize, worldToIndex, type Vec3, type VolumeGrid } from '../volume/grid'

/** Float32 holds whole numbers exactly up to 2^24, so a grid has at most 24 segments. */
export const MAX_SEGMENTS = 24

export interface Segment {
  /** Bit in the label grid (0-based). */
  bit: number
  /** Segment or ROI number in the file. */
  number: number
  label: string
  color: [number, number, number]
  /** Made by an algorithm (SEG "AUTOMATIC"). */
  automatic?: boolean
  algorithm?: string
}

export interface LabelGrid {
  grid: VolumeGrid
  segments: Segment[]
}

/** Colours for segments without one. */
export const SEGMENT_COLORS: [number, number, number][] = [
  [230, 25, 75],
  [60, 180, 75],
  [255, 225, 25],
  [0, 130, 200],
  [245, 130, 48],
  [145, 30, 180],
  [70, 240, 240],
  [240, 50, 230],
  [210, 245, 60],
  [250, 190, 190],
]

/** DICOM CIELab (0–65535 scaled, PS3.3 C.10.7.1.1) as sRGB. */
export function dicomLabToRgb([l16, a16, b16]: number[]): [number, number, number] {
  const L = (l16 * 100) / 65535
  const a = (a16 * 255) / 65535 - 128
  const b = (b16 * 255) / 65535 - 128
  const fy = (L + 16) / 116
  const fx = fy + a / 500
  const fz = fy - b / 200
  const inverse = (t: number) => (t ** 3 > 0.008856 ? t ** 3 : (t - 16 / 116) / 7.787)
  // D65 white.
  const [x, y, z] = [0.95047 * inverse(fx), 1 * inverse(fy), 1.08883 * inverse(fz)]
  const linear = [3.2406 * x - 1.5372 * y - 0.4986 * z, -0.9689 * x + 1.8758 * y + 0.0415 * z, 0.0557 * x - 0.204 * y + 1.057 * z]
  const gamma = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)
  return linear.map((c) => Math.round(Math.max(0, Math.min(1, gamma(c))) * 255)) as [number, number, number]
}

export interface PlaneFrame {
  /** Image Position (Patient) of the frame's first pixel. */
  position: Vec3
}

export interface PlaneLayout {
  /** Image Orientation (Patient): row then column direction. */
  orientation: number[]
  /** Pixel Spacing: between rows, then between columns (mm). */
  pixelSpacing: [number, number]
  rows: number
  columns: number
  /** Slice spacing when the frames do not tell (e.g. one frame). */
  thickness?: number
}

/**
 * A grid covering parallel frames: in-plane as the frames, slices along the
 * normal at the smallest distance between frame positions.
 */
export function gridForFrames(layout: PlaneLayout, positions: Vec3[]): VolumeGrid & { scalars: Float32Array } {
  const row = normalize(layout.orientation.slice(0, 3))
  const column = normalize(layout.orientation.slice(3, 6))
  const normal = normalize(cross(row, column))
  const distances = [...new Set(positions.map((p) => Math.round(dot(p, normal) * 100) / 100))].sort((a, b) => a - b)
  let step = Infinity
  for (let i = 1; i < distances.length; i++) step = Math.min(step, distances[i] - distances[i - 1])
  if (!Number.isFinite(step) || step <= 0) step = layout.thickness || 1
  const first = positions.find((p) => Math.abs(dot(p, normal) - distances[0]) < 0.01) ?? positions[0]
  const slices = Math.round((distances[distances.length - 1] - distances[0]) / step) + 1
  return {
    dimensions: [layout.columns, layout.rows, slices],
    spacing: [layout.pixelSpacing[1], layout.pixelSpacing[0], step],
    origin: first,
    direction: [...row, ...column, ...normal],
    scalars: new Float32Array(layout.columns * layout.rows * slices),
  }
}

/** Where a frame's first pixel lands in a grid (whole voxel offsets). */
export function frameOffset(grid: VolumeGrid, position: Vec3) {
  return worldToIndex(grid, position).map(Math.round) as [number, number, number]
}

/** Sets a bit for the pixels of a frame that pass `on`. */
export function paintFrame(grid: VolumeGrid & { scalars: Float32Array }, position: Vec3, columns: number, rows: number, bit: number, on: (index: number) => boolean) {
  const [oi, oj, k] = frameOffset(grid, position)
  const [nx, ny, nz] = grid.dimensions
  if (k < 0 || k >= nz) return
  const value = 2 ** bit
  for (let y = 0; y < rows; y++) {
    const j = y + oj
    if (j < 0 || j >= ny) continue
    for (let x = 0; x < columns; x++) {
      const i = x + oi
      if (i < 0 || i >= nx || !on(y * columns + x)) continue
      const at = k * nx * ny + j * nx + i
      // Bits are added once each, so the sum stays an exact bitmask.
      if (!hasBit(grid.scalars[at], bit)) grid.scalars[at] += value
    }
  }
}

export const hasBit = (value: number, bit: number) => Math.floor(value / 2 ** bit) % 2 === 1

/** The label at a world point (nearest voxel); 0 outside. */
export function labelAt(grid: VolumeGrid, world: Vec3) {
  const [x, y, z] = worldToIndex(grid, world).map(Math.round)
  const [nx, ny, nz] = grid.dimensions
  if (x < 0 || y < 0 || z < 0 || x >= nx || y >= ny || z >= nz) return 0
  return grid.scalars[z * nx * ny + y * nx + x]
}

/** Number of voxels holding each bit, and their volume (cm³). */
export function segmentVolumes(labels: LabelGrid) {
  const counts = labels.segments.map(() => 0)
  const { scalars, spacing } = labels.grid
  for (let i = 0; i < scalars.length; i++) {
    const v = scalars[i]
    if (v) labels.segments.forEach((s, n) => hasBit(v, s.bit) && counts[n]++)
  }
  const voxel = (spacing[0] * spacing[1] * spacing[2]) / 1000
  return counts.map((count) => ({ count, volume: count * voxel }))
}
