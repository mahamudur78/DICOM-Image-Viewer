import type { Types } from '@cornerstonejs/core'
import { getViewport } from './viewer'

/**
 * Image pixel ↔ world conversions from the viewport's own image data. Unlike
 * Cornerstone's `imageToWorldCoords`, this also works for images without
 * position and orientation tags (the viewport then uses a default plane).
 */
function geometry(viewportId: string) {
  const data = getViewport(viewportId)?.getImageData()
  if (!data) return null
  const { origin, direction, spacing } = data
  return { origin, row: [direction[0], direction[1], direction[2]], column: [direction[3], direction[4], direction[5]], spacing }
}

/** World point of image coordinates (column, row; pixel centres are integers). */
export function imageToWorld(viewportId: string, [x, y]: [number, number]): Types.Point3 | null {
  const g = geometry(viewportId)
  if (!g) return null
  return [0, 1, 2].map((i) => g.origin[i] + x * g.spacing[0] * g.row[i] + y * g.spacing[1] * g.column[i]) as Types.Point3
}

/** Image coordinates (column, row) of a world point. */
export function worldToImage(viewportId: string, world: Types.Point3): [number, number] | null {
  const g = geometry(viewportId)
  if (!g) return null
  const d = [0, 1, 2].map((i) => world[i] - g.origin[i])
  const dot = (v: number[]) => d[0] * v[0] + d[1] * v[1] + d[2] * v[2]
  return [dot(g.row) / g.spacing[0], dot(g.column) / g.spacing[1]]
}

/** Canvas (CSS pixel) position of image coordinates. */
export function imageToCanvas(viewportId: string, point: [number, number]): Types.Point2 | null {
  const world = imageToWorld(viewportId, point)
  return world && getViewport(viewportId)!.worldToCanvas(world)
}
