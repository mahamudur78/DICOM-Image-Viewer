// How each series was last viewed (zoom, pan, rotation, flips, window, invert,
// colormap), so showing it again — in any cell — brings that view back.
import type { Types } from '@cornerstonejs/core'
import { getViewport } from './viewer'

interface SavedView {
  presentation: Types.ViewPresentation
  voiRange?: Types.VOIRange
  invert?: boolean
  colormap?: string
}

const saved = new Map<string, SavedView>()

/** Remembers the view of a series, if the viewport is showing that series. */
export function saveViewState(viewportId: string, seriesId: string, firstImageId: string | undefined) {
  const viewport = getViewport(viewportId)
  if (!viewport || !firstImageId || viewport.getImageIds?.()[0] !== firstImageId) return
  const properties = viewport.getProperties?.()
  saved.set(seriesId, {
    presentation: viewport.getViewPresentation(),
    voiRange: properties?.voiRange,
    invert: properties?.invert,
    colormap: properties?.colormap?.name,
  })
}

/** Shows a series as it was last viewed; returns whether there was a saved view. */
export function restoreViewState(viewportId: string, seriesId: string) {
  const view = saved.get(seriesId)
  const viewport = getViewport(viewportId)
  if (!view || !viewport) return false
  viewport.setViewPresentation(view.presentation)
  viewport.setProperties({
    ...(view.voiRange && { voiRange: view.voiRange }),
    ...(view.invert !== undefined && { invert: view.invert }),
    ...(view.colormap && { colormap: { name: view.colormap } }),
  })
  viewport.render()
  return true
}

export const forgetViewState = (seriesId: string) => saved.delete(seriesId)

export const forgetAllViewStates = () => saved.clear()
