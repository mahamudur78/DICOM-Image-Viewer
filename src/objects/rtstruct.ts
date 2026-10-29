// RT Structure Set: named regions (ROIs) as planar contours, rasterized into a
// label grid (contours on one plane combine even-odd, so holes stay holes).
import { pixelsInPolygon } from '../measurements/geometry'
import { cross, dot, normalize, worldToIndex, type Vec3, type VolumeGrid } from '../volume/grid'
import { decodedText, firstItem, items, numbers, referenceOf, text, type DataSet } from './dicom'
import { MAX_SEGMENTS, SEGMENT_COLORS, gridForFrames, type LabelGrid, type Segment } from './labels'

export interface Contour {
  points: Vec3[]
  closed: boolean
  /** Image the contour was drawn on, if given. */
  sopInstanceUID?: string
}

export interface Roi extends Segment {
  /** RT ROI Interpreted Type, e.g. PTV, ORGAN, EXTERNAL. */
  type?: string
  contours: Contour[]
}

export interface StructureSet {
  label?: string
  frameOfReferenceUID?: string
  rois: Roi[]
}

export function parseRtStruct(dataSet: DataSet): StructureSet {
  const types = new Map(items(dataSet, 'x30060080').map((item) => [Number(text(item, 'x30060084')), text(item, 'x300600a4')]))
  const contours = new Map(
    items(dataSet, 'x30060039').map((item) => [
      Number(text(item, 'x30060084')),
      {
        color: numbers(item, 'x3006002a'),
        contours: items(item, 'x30060040').flatMap((contour): Contour[] => {
          const data = numbers(contour, 'x30060050') ?? []
          if (data.length < 3) return []
          const points = Array.from({ length: Math.floor(data.length / 3) }, (_, i) => data.slice(i * 3, i * 3 + 3))
          const image = firstItem(contour, 'x30060016')
          const type = text(contour, 'x30060042') ?? 'CLOSED_PLANAR'
          return [{ points, closed: type === 'CLOSED_PLANAR', ...(image && { sopInstanceUID: referenceOf(image)?.sopInstanceUID }) }]
        }),
      },
    ]),
  )
  const rois = items(dataSet, 'x30060020')
    .slice(0, MAX_SEGMENTS)
    .map((item, bit): Roi => {
      const number = Number(text(item, 'x30060022'))
      const found = contours.get(number)
      const color = found?.color?.length === 3 ? (found.color as [number, number, number]) : SEGMENT_COLORS[bit % SEGMENT_COLORS.length]
      return { bit, number, label: decodedText(item, 'x30060026') ?? `ROI ${number}`, color, type: types.get(number), contours: found?.contours ?? [] }
    })
  const reference = firstItem(dataSet, 'x30060010')
  const roiReference = firstItem(dataSet, 'x30060020')
  return {
    label: text(dataSet, 'x30060002'),
    frameOfReferenceUID: (reference && text(reference, 'x00200052')) ?? (roiReference && text(roiReference, 'x30060024')),
    rois,
  }
}

/** Normal of a contour's plane (Newell's method), or null for degenerate ones. */
export function contourNormal(points: Vec3[]): Vec3 | null {
  const n = [0, 0, 0]
  for (let i = 0; i < points.length; i++) {
    const [a, b] = [points[i], points[(i + 1) % points.length]]
    n[0] += (a[1] - b[1]) * (a[2] + b[2])
    n[1] += (a[2] - b[2]) * (a[0] + b[0])
    n[2] += (a[0] - b[0]) * (a[1] + b[1])
  }
  return Math.hypot(n[0], n[1], n[2]) > 1e-9 ? normalize(n) : null
}

/**
 * A grid for contours without a reference image: in their plane, 1 mm
 * pixels (coarser for large extents), slices at the contours' spacing.
 */
export function gridForContours(set: StructureSet, margin = 5): VolumeGrid & { scalars: Float32Array } {
  const all = set.rois.flatMap((roi) => roi.contours.filter((c) => c.closed))
  const normal = all.map((c) => contourNormal(c.points)).find(Boolean) ?? [0, 0, 1]
  const helper = Math.abs(normal[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]
  const column = normalize(cross(normal, helper))
  const row = normalize(cross(column, normal))
  const points = all.flatMap((c) => c.points)
  const u = points.map((p) => dot(p, row))
  const v = points.map((p) => dot(p, column))
  const [u0, u1, v0, v1] = [Math.min(...u) - margin, Math.max(...u) + margin, Math.min(...v) - margin, Math.max(...v) + margin]
  const pixel = Math.max(1, (u1 - u0) / 512, (v1 - v0) / 512)
  const columns = Math.ceil((u1 - u0) / pixel) + 1
  const rows = Math.ceil((v1 - v0) / pixel) + 1
  const positions = all.map((c) => {
    const d = dot(c.points[0], normal)
    return [0, 1, 2].map((n) => row[n] * u0 + column[n] * v0 + normal[n] * d)
  })
  return gridForFrames({ orientation: [...row, ...column], pixelSpacing: [pixel, pixel], rows, columns }, positions.length ? positions : [[0, 0, 0]])
}

/** Fills each ROI's closed contours into the grid as its bit. */
export function rasterize(set: StructureSet, grid: VolumeGrid & { scalars: Float32Array }): LabelGrid {
  const [nx, ny, nz] = grid.dimensions
  for (const roi of set.rois) {
    const slices = new Map<number, Uint8Array>()
    for (const contour of roi.contours) {
      if (!contour.closed || contour.points.length < 3) continue
      const index = contour.points.map((p) => worldToIndex(grid, p))
      const k = Math.round(index[0][2])
      if (k < 0 || k >= nz || index.some((p) => Math.abs(p[2] - k) > 0.5)) continue
      let mask = slices.get(k)
      if (!mask) slices.set(k, (mask = new Uint8Array(nx * ny)))
      for (const pixel of pixelsInPolygon(index.map((p) => [p[0], p[1]]), nx, ny, 1, 1)) mask[pixel] ^= 1
    }
    const value = 2 ** roi.bit
    for (const [k, mask] of slices) for (let i = 0; i < mask.length; i++) if (mask[i]) grid.scalars[k * nx * ny + i] += value
  }
  return { grid, segments: set.rois.map(({ contours: _contours, type: _type, ...segment }) => segment) }
}
