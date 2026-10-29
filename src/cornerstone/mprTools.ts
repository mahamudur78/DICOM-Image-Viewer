// MPR extras: resetting oblique planes, reformatting a new series along the
// plane of an MPR view, and curved reformats along a path drawn on MPR.
import { Enums, type Types } from '@cornerstonejs/core'
import { CrosshairsTool, ToolGroupManager } from '@cornerstonejs/tools'
import { create } from 'zustand'
import { add, cross, dot, gridCorners, normalize, scale, slicePlane, sub, type PlaneSpec, type VolumeGrid } from '../volume/grid'
import { MPR_VIEWPORTS, getMprViewport } from './mpr'
import { MPR_TOOL_GROUP_ID } from './tools'
import { volumeGrid } from './volume3dTools'

/** Back to straight axial, sagittal and coronal planes through the volume centre. */
export function resetPlanes() {
  for (const { id, orientation } of MPR_VIEWPORTS) {
    const viewport = getMprViewport(id)
    if (!viewport) continue
    viewport.setOrientation(orientation as Enums.OrientationAxis)
    viewport.resetCamera()
  }
  const crosshairs = ToolGroupManager.getToolGroup(MPR_TOOL_GROUP_ID)?.getToolInstance(CrosshairsTool.toolName) as { resetCrosshairs?: () => void } | undefined
  crosshairs?.resetCrosshairs?.()
  for (const { id } of MPR_VIEWPORTS) getMprViewport(id)?.render()
}

/** The volume an MPR viewport shows, as a grid. */
export function mprGrid(viewportId: string): VolumeGrid | null {
  const volumeId = getMprViewport(viewportId)?.getActors()[0]?.referencedId
  return volumeId ? volumeGrid(volumeId) : null
}

/** Screen directions of an MPR view: right, down and toward the viewer. */
export function viewAxes(camera: Types.ICamera) {
  const normal = normalize(camera.viewPlaneNormal as number[])
  const up = normalize(camera.viewUp as number[])
  return { row: normalize(cross(up, normal)), column: scale(up, -1), normal }
}

export interface ReformatPlan {
  planes: PlaneSpec[]
  /** Positions along the normal (mm), for the slice positions. */
  normal: number[]
  spacing: number
}

/**
 * Slices parallel to an MPR view, `spacing` mm apart, covering the whole
 * volume: each the size of the volume's extent in that plane.
 */
export function planReformat(viewportId: string, spacing: number, maxSlices = 1000): ReformatPlan | null {
  const viewport = getMprViewport(viewportId)
  const grid = mprGrid(viewportId)
  if (!viewport || !grid) return null
  const { row, column, normal } = viewAxes(viewport.getCamera())
  const corners = gridCorners(grid)
  const range = (axis: number[]) => {
    const values = corners.map((c) => dot(c, axis))
    return [Math.min(...values), Math.max(...values)]
  }
  const [r0, r1] = range(row)
  const [c0, c1] = range(column)
  // Slices from the far side toward the viewer, so their order follows the view's scroll direction.
  const [n0, n1] = range(normal)
  const pixelSpacing = Math.min(...grid.spacing)
  const columns = Math.max(1, Math.floor((r1 - r0) / pixelSpacing) + 1)
  const rows = Math.max(1, Math.floor((c1 - c0) / pixelSpacing) + 1)
  const count = Math.min(maxSlices, Math.max(1, Math.floor((n1 - n0) / spacing) + 1))
  const planes = Array.from({ length: count }, (_, i) => {
    const depth = n0 + i * spacing
    const origin = add(add(scale(row, r0), scale(column, c0)), scale(normal, depth))
    return { origin, row, column, pixelSpacing, columns, rows }
  })
  return { planes, normal, spacing }
}

/** Samples one planned slice (outside the volume: the volume's lowest value). */
export function reformatSlice(grid: VolumeGrid, plane: PlaneSpec, outside: number) {
  return slicePlane(grid, plane, outside)
}

// --- curved reformat path -------------------------------------------------------------------------

interface CprState {
  /** Collecting points on an MPR viewport. */
  drawing: boolean
  viewportId: string | null
  points: number[][]
}

export const useCpr = create<CprState>()(() => ({ drawing: false, viewportId: null, points: [] }))

export const startCprPath = () => useCpr.setState({ drawing: true, viewportId: null, points: [] })
export const stopCprPath = () => useCpr.setState({ drawing: false })
export const clearCprPath = () => useCpr.setState({ drawing: false, viewportId: null, points: [] })

/** Adds a point clicked on an MPR viewport (all points must be on the same viewport). */
export function addCprPoint(viewportId: string, canvasPoint: [number, number]) {
  const viewport = getMprViewport(viewportId)
  if (!viewport) return
  const { viewportId: current, points } = useCpr.getState()
  if (current && current !== viewportId) return
  const world = viewport.canvasToWorld(canvasPoint as Types.Point2) as number[]
  useCpr.setState({ viewportId, points: [...points, world] })
}

export const undoCprPoint = () => useCpr.setState((s) => ({ points: s.points.slice(0, -1) }))

/** The up direction for the path: the normal of the viewport it was drawn on. */
export function cprUp() {
  const { viewportId } = useCpr.getState()
  const viewport = viewportId ? getMprViewport(viewportId) : undefined
  return viewport ? viewAxes(viewport.getCamera()).normal : null
}

export const distanceAlong = (points: number[][]) => points.slice(1).reduce((sum, p, i) => sum + Math.hypot(...sub(p, points[i])), 0)
