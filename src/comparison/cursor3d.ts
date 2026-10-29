// The 3D cursor: a point in the patient picked on any image. Every other
// viewport of the same frame of reference shows the slice through it and
// marks it; MPR moves its crosshairs there.
import { getEnabledElement, metaData, type Types } from '@cornerstonejs/core'
import { BaseTool, CrosshairsTool, ToolGroupManager, type Types as ToolTypes } from '@cornerstonejs/tools'
import { create } from 'zustand'
import { viewportIdAt } from '../cornerstone/constants'
import { getMprViewport, MPR_VIEWPORTS } from '../cornerstone/mpr'
import { MPR_TOOL_GROUP_ID } from '../cornerstone/tools'
import { getViewport, setImageIndex } from '../cornerstone/viewer'
import { useViewer } from '../store/viewerStore'
import { dot, nearestSlice, normalOf } from './planes'

export interface Cursor3D {
  point: number[]
  frameOfReferenceUID: string | undefined
}

export const useCursor3D = create<{ cursor: Cursor3D | null; mprCenter: number[] | null }>()(() => ({ cursor: null, mprCenter: null }))

export const clearCursor3D = () => useCursor3D.setState({ cursor: null, mprCenter: null })

const forOf = (imageId: string | undefined) =>
  imageId ? (metaData.get('imagePlaneModule', imageId) as { frameOfReferenceUID?: string } | undefined)?.frameOfReferenceUID : undefined

/** Places the cursor at a world point picked on a viewport and brings the other viewports to it. */
export function setCursor3D(point: number[], sourceViewportId: string) {
  const source = getViewport(sourceViewportId)
  const frameOfReferenceUID = source?.getFrameOfReferenceUID?.() ?? forOf(source?.getCurrentImageId?.())
  useCursor3D.setState({ cursor: { point, frameOfReferenceUID } })

  if (useViewer.getState().volumeView) {
    // MPR: the crosshairs move to the point, which moves all three planes.
    const crosshairs = ToolGroupManager.getToolGroup(MPR_TOOL_GROUP_ID)?.getToolInstance(CrosshairsTool.toolName) as CrosshairsTool | undefined
    if (crosshairs && MPR_VIEWPORTS.some(({ id }) => getMprViewport(id))) crosshairs.setToolCenter(point as Types.Point3)
    else for (const { id } of MPR_VIEWPORTS) getMprViewport(id)?.jumpToWorld(point as Types.Point3)
    return
  }

  const { cells, layout, maximizedCell } = useViewer.getState()
  if (maximizedCell !== null) return
  for (let cell = 0; cell < layout.rows * layout.cols; cell++) {
    const viewportId = viewportIdAt(cell)
    const series = cells[cell]?.series
    if (viewportId === sourceViewportId || series?.kind !== 'image' || !getViewport(viewportId)) continue
    const index = sliceThrough(series.images.map((image) => image.imageId), point, frameOfReferenceUID)
    if (index !== null) void setImageIndex(viewportId, index)
  }
}

interface PlaneModule {
  imagePositionPatient?: number[]
  rowCosines?: number[]
  columnCosines?: number[]
  frameOfReferenceUID?: string
  sliceThickness?: number
}

/**
 * The slice of a series that passes through a point, or null when the
 * series is in another frame of reference or the point lies outside it.
 */
function sliceThrough(imageIds: string[], point: number[], frameOfReferenceUID: string | undefined): number | null {
  const planes = imageIds.map((id) => metaData.get('imagePlaneModule', id) as PlaneModule | undefined)
  const first = planes[0]
  if (!first?.imagePositionPatient || !first.rowCosines || !first.columnCosines) return null
  if (!frameOfReferenceUID || first.frameOfReferenceUID !== frameOfReferenceUID) return null
  const normal = normalOf({ row: first.rowCosines, column: first.columnCosines })
  const positions = planes.map((p) => p?.imagePositionPatient ?? [NaN, NaN, NaN])
  const { index, gap } = nearestSlice(positions, normal, dot(point, normal))
  const spacing = positions.length > 1 ? Math.abs(dot(positions[1], normal) - dot(positions[0], normal)) : (first.sliceThickness ?? 1)
  return index >= 0 && gap <= Math.max(spacing, 1) ? index : null
}

/** Picks the 3D cursor with a click or drag (also bound to Shift+click while other tools are selected). */
export class Cursor3DTool extends BaseTool {
  static toolName = 'Cursor3D'

  constructor(toolProps: ToolTypes.PublicToolProps = {}, defaultToolProps: ToolTypes.ToolProps = { supportedInteractionTypes: ['Mouse', 'Touch'] }) {
    super(toolProps, defaultToolProps)
  }

  preMouseDownCallback = (evt: ToolTypes.EventTypes.InteractionEventType) => {
    this.pick(evt)
    return true
  }

  mouseDragCallback = (evt: ToolTypes.EventTypes.InteractionEventType) => this.pick(evt)
  touchDragCallback = (evt: ToolTypes.EventTypes.InteractionEventType) => this.pick(evt)

  private pick(evt: ToolTypes.EventTypes.InteractionEventType) {
    const viewportId = getEnabledElement(evt.detail.element)?.viewport.id
    if (viewportId) setCursor3D([...evt.detail.currentPoints.world], viewportId)
  }
}
