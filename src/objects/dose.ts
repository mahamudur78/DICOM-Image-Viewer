// Isodose lines (marching squares on a sampled plane) and dose-volume
// histograms of structures.
import { indexToWorld, sample, type VolumeGrid } from '../volume/grid'
import { hasBit, type LabelGrid, type Segment } from './labels'

export type Segment2 = [number, number, number, number]

/**
 * Line segments (x0, y0, x1, y1 in grid cells) where a width × height field
 * crosses `level`. NaN cells are skipped.
 */
export function isolines(values: ArrayLike<number>, width: number, height: number, level: number): Segment2[] {
  const out: Segment2[] = []
  const at = (x: number, y: number) => values[y * width + x]
  const cross = (a: number, b: number) => (level - a) / (b - a)
  for (let y = 0; y + 1 < height; y++)
    for (let x = 0; x + 1 < width; x++) {
      const [tl, tr, br, bl] = [at(x, y), at(x + 1, y), at(x + 1, y + 1), at(x, y + 1)]
      if ([tl, tr, br, bl].some(Number.isNaN)) continue
      const index = (tl >= level ? 8 : 0) | (tr >= level ? 4 : 0) | (br >= level ? 2 : 0) | (bl >= level ? 1 : 0)
      if (index === 0 || index === 15) continue
      const top: [number, number] = [x + cross(tl, tr), y]
      const right: [number, number] = [x + 1, y + cross(tr, br)]
      const bottom: [number, number] = [x + cross(bl, br), y + 1]
      const left: [number, number] = [x, y + cross(tl, bl)]
      const pairs: [[number, number], [number, number]][] =
        index === 1 || index === 14 ? [[left, bottom]]
        : index === 2 || index === 13 ? [[bottom, right]]
        : index === 3 || index === 12 ? [[left, right]]
        : index === 4 || index === 11 ? [[top, right]]
        : index === 6 || index === 9 ? [[top, bottom]]
        : index === 7 || index === 8 ? [[left, top]]
        : index === 5 ? [[left, top], [bottom, right]]
        : [[top, right], [left, bottom]] // 10
      for (const [a, b] of pairs) out.push([a[0], a[1], b[0], b[1]])
    }
  return out
}

/** Isodose levels (% of the reference dose) and their colours, as in most planning systems. */
export const ISODOSE_LEVELS: { percent: number; color: string }[] = [
  { percent: 107, color: '#ff00ff' },
  { percent: 100, color: '#ff0000' },
  { percent: 95, color: '#ff8000' },
  { percent: 80, color: '#ffff00' },
  { percent: 50, color: '#00ff00' },
  { percent: 30, color: '#00ffff' },
  { percent: 10, color: '#0080ff' },
]

export interface DvhCurve {
  segment: Segment
  /** cm³ */
  volume: number
  min: number
  max: number
  mean: number
  /** Dose received by at least 95 % / 2 % / 98 % of the volume. */
  d95: number
  d2: number
  d98: number
  /** Cumulative: % of the volume receiving at least `dose`. */
  points: { dose: number; percent: number }[]
}

/** Cumulative DVH of every segment of a label grid, with dose sampled at its voxel centres. */
export function dvh(labels: LabelGrid, dose: VolumeGrid, bins = 100): DvhCurve[] {
  const { grid } = labels
  const [nx, ny, nz] = grid.dimensions
  const doses: number[][] = labels.segments.map(() => [])
  for (let k = 0; k < nz; k++)
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) {
        const label = grid.scalars[k * nx * ny + j * nx + i]
        if (!label) continue
        const value = sample(dose, indexToWorld(grid, [i, j, k]), 0)
        labels.segments.forEach((segment, n) => hasBit(label, segment.bit) && doses[n].push(value))
      }
  const voxel = (grid.spacing[0] * grid.spacing[1] * grid.spacing[2]) / 1000
  for (const values of doses) values.sort((a, b) => a - b)
  // One dose axis for every curve, so they can be drawn and exported together.
  const top = Math.max(1e-9, ...doses.map((values) => values[values.length - 1] ?? 0))
  return labels.segments.flatMap((segment, n): DvhCurve[] => {
    const values = doses[n]
    if (!values.length) return []
    const max = values[values.length - 1]
    const atLeast = (fraction: number) => values[Math.max(0, Math.min(values.length - 1, Math.floor(values.length * (1 - fraction))))]
    const points = Array.from({ length: bins + 1 }, (_, b) => {
      const d = (top * b) / bins
      // Values are sorted: count those ≥ d with a binary search.
      let lo = 0
      let hi = values.length
      while (lo < hi) {
        const mid = (lo + hi) >> 1
        if (values[mid] < d) lo = mid + 1
        else hi = mid
      }
      return { dose: d, percent: ((values.length - lo) / values.length) * 100 }
    })
    return [
      {
        segment,
        volume: values.length * voxel,
        min: values[0],
        max,
        mean: values.reduce((sum, v) => sum + v, 0) / values.length,
        d95: atLeast(0.95),
        d2: atLeast(0.02),
        d98: atLeast(0.98),
        points,
      },
    ]
  })
}

export function dvhCsv(curves: DvhCurve[]) {
  const quote = (s: string) => `"${s.replace(/"/g, '""')}"`
  const header = ['Dose', ...curves.map((c) => quote(`${c.segment.label} (%)`))].join(',')
  const rows = (curves[0]?.points ?? []).map((_, i) => [curves[0].points[i].dose.toFixed(3), ...curves.map((c) => (c.points[i]?.percent ?? 0).toFixed(2))].join(','))
  return [header, ...rows].join('\r\n') + '\r\n'
}
