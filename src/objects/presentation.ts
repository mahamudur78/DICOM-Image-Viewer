// Presentation states shown in cells: which state belongs to which viewport,
// and applying its window, rotation, flip and displayed area.
import { create } from 'zustand'
import { viewportIdAt } from '../cornerstone/constants'
import { getViewport } from '../cornerstone/viewer'
import { getImagePlane } from '../dicom/imagePlaneMetadata'
import type { DisplaySet, Study } from '../dicom/types'
import { t } from '../i18n'
import { setCellIndex, showInCell } from '../store/viewerStore'
import { findBaseSeries } from './base'
import type { DataSet } from './dicom'
import { imageToWorld, type ImagePlane } from './measurementSr'
import { forImage, readPresentationState, type PresentationState } from './presentationState'

export interface ShownPresentation {
  state: PresentationState
  seriesId: string
  /** Whether window, rotation and area have been applied to the viewport yet. */
  applied: boolean
}

export const usePresentation = create<{ byViewport: Record<string, ShownPresentation> }>()(() => ({ byViewport: {} }))

export function setPresentation(viewportId: string, shown: ShownPresentation | null) {
  usePresentation.setState((s) => {
    const byViewport = { ...s.byViewport }
    if (shown) byViewport[viewportId] = shown
    else delete byViewport[viewportId]
    return { byViewport }
  })
}

export function showPresentationState(cell: number, object: DisplaySet, dataSet: DataSet, studies: Study[]) {
  const state = readPresentationState(dataSet)
  const base = findBaseSeries(studies, object.study, { instances: state.images, seriesUID: state.seriesInstanceUIDs[0] })
  if (!base) return t('objects.baseNotOpen')
  setPresentation(viewportIdAt(cell), { state, seriesId: base.series.id, applied: false })
  showInCell(cell, base)
  const first = base.series.images.findIndex((image) => state.images.includes(image.sopInstanceUID))
  if (first >= 0) setCellIndex(cell, first)
  return null
}

export function planeOfImage(imageId: string): ImagePlane | null {
  const plane = getImagePlane(imageId)
  if (!plane) return null
  return { origin: plane.imagePositionPatient, row: plane.rowCosines, column: plane.columnCosines, spacing: [plane.columnPixelSpacing, plane.rowPixelSpacing] }
}

/** Applies window, inversion, rotation, flip and displayed area for the image shown. */
export function applyPresentation(viewportId: string, state: PresentationState, sopInstanceUID: string, imageId: string) {
  const viewport = getViewport(viewportId)
  if (!viewport) return false
  const voi = forImage(state.voi, sopInstanceUID)
  viewport.setProperties({
    ...(voi && { voiRange: { lower: voi.center - voi.width / 2, upper: voi.center + voi.width / 2 } }),
    ...(state.inverse && { invert: true }),
  })
  viewport.setViewPresentation({ rotation: state.rotation, flipHorizontal: state.flip })
  const area = forImage(state.areas, sopInstanceUID)
  const plane = planeOfImage(imageId)
  if (area && plane) {
    // Pixel indexes are 1-based: the area runs from the corner before the first to after the last.
    const topLeft = imageToWorld(plane, [area.topLeft[0] - 1, area.topLeft[1] - 1])
    const bottomRight = imageToWorld(plane, area.bottomRight)
    const width = Math.abs(area.bottomRight[0] - area.topLeft[0] + 1) * plane.spacing[0]
    const height = Math.abs(area.bottomRight[1] - area.topLeft[1] + 1) * plane.spacing[1]
    const [w, h] = state.rotation % 180 === 90 ? [height, width] : [width, height]
    const element = viewport.element
    const aspect = element.clientHeight / Math.max(1, element.clientWidth)
    const camera = viewport.getCamera()
    const center = [0, 1, 2].map((n) => (topLeft[n] + bottomRight[n]) / 2)
    const offset = [0, 1, 2].map((n) => camera.position![n] - camera.focalPoint![n])
    viewport.setCamera({
      focalPoint: center as [number, number, number],
      position: center.map((v, n) => v + offset[n]) as [number, number, number],
      parallelScale: Math.max(h / 2, (w / 2) * aspect),
    })
  }
  viewport.render()
  return true
}
