import type { Types } from '@cornerstonejs/core'
import { utilities } from '@cornerstonejs/tools'

const { getOrientationStringLPS, invertOrientationStringLPS } = utilities.orientation

export interface OrientationMarkers {
  top: string
  bottom: string
  left: string
  right: string
}

/**
 * Patient-direction labels for the four viewport edges, derived from the
 * camera so they follow rotation and flips. Only the dominant direction is
 * kept for oblique planes, matching what most viewers show.
 */
export function getOrientationMarkers(viewport: { getCamera(): Types.ICamera }): OrientationMarkers | null {
  const { viewUp, viewPlaneNormal } = viewport.getCamera()
  if (!viewUp || !viewPlaneNormal) return null

  const [ux, uy, uz] = viewUp
  const [nx, ny, nz] = viewPlaneNormal
  // Screen-right direction in patient space: viewUp × viewPlaneNormal.
  const right: Types.Point3 = [uy * nz - uz * ny, uz * nx - ux * nz, ux * ny - uy * nx]
  const down: Types.Point3 = [-ux, -uy, -uz]

  const rightLabel = getOrientationStringLPS(right).charAt(0)
  const downLabel = getOrientationStringLPS(down).charAt(0)
  if (!rightLabel || !downLabel) return null

  return {
    right: rightLabel,
    left: invertOrientationStringLPS(rightLabel),
    bottom: downLabel,
    top: invertOrientationStringLPS(downLabel),
  }
}
