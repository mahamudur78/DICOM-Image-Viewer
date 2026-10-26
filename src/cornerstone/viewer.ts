import { Enums, RenderingEngine, getRenderingEngine, type Types } from '@cornerstonejs/core'
import { ToolGroupManager } from '@cornerstonejs/tools'
import { setSyncSource } from './sync'
import { TOOL_GROUP_ID } from './tools'

export const RENDERING_ENGINE_ID = 'main-rendering-engine'
export const MAX_VIEWPORTS = 4

export const viewportIdAt = (cell: number) => `viewport-${cell}`

export interface WindowPreset {
  label: string
  width: number
  center: number
}

/** Common CT window presets (Hounsfield units). */
export const CT_PRESETS: WindowPreset[] = [
  { label: 'Soft tissue', width: 400, center: 40 },
  { label: 'Lung', width: 1500, center: -600 },
  { label: 'Bone', width: 1800, center: 400 },
  { label: 'Brain', width: 80, center: 40 },
  { label: 'Abdomen', width: 350, center: 50 },
  { label: 'Liver', width: 150, center: 30 },
]

export function createRenderingEngine() {
  return getRenderingEngine(RENDERING_ENGINE_ID) ?? new RenderingEngine(RENDERING_ENGINE_ID)
}

export function getViewport(viewportId: string): Types.IStackViewport | undefined {
  return getRenderingEngine(RENDERING_ENGINE_ID)?.getViewport(viewportId) as Types.IStackViewport | undefined
}

/**
 * Last image index shown per viewport and series, so a series keeps its
 * position when the layout changes and its viewport is recreated.
 */
const rememberedIndex = new Map<string, number>()
const rememberKey = (viewportId: string, seriesUID: string) => `${viewportId}|${seriesUID}`

export function mountViewport(viewportId: string, element: HTMLDivElement) {
  createRenderingEngine().enableElement({
    viewportId,
    type: Enums.ViewportType.STACK,
    element,
    defaultOptions: { background: [0, 0, 0] },
  })
  ToolGroupManager.getToolGroup(TOOL_GROUP_ID)?.addViewport(viewportId, RENDERING_ENGINE_ID)
}

/**
 * Makes the active viewport the source of reference lines and sync, and every
 * other mounted viewport a target. Call after viewports mount or the active one changes.
 */
export function setActiveSource(sourceViewportId: string | null) {
  const engine = getRenderingEngine(RENDERING_ENGINE_ID)
  if (!engine) return
  const mounted = engine.getViewports().map((viewport) => viewport.id)
  const source = sourceViewportId && mounted.includes(sourceViewportId) ? sourceViewportId : null
  setSyncSource(RENDERING_ENGINE_ID, mounted, source)
  return source
}

/** Disabling the element also removes it from its tool group and synchronizers. */
export function unmountViewport(viewportId: string) {
  getRenderingEngine(RENDERING_ENGINE_ID)?.disableElement(viewportId)
}

export function resizeViewports() {
  getRenderingEngine(RENDERING_ENGINE_ID)?.resize(true, true)
}

export async function showStack(viewportId: string, seriesUID: string, imageIds: string[]) {
  const viewport = getViewport(viewportId)
  if (!viewport || imageIds.length === 0) return
  // Default to the middle of the stack, which is usually the most useful slice.
  const index = rememberedIndex.get(rememberKey(viewportId, seriesUID)) ?? Math.floor(imageIds.length / 2)
  await viewport.setStack(imageIds, Math.min(index, imageIds.length - 1))
  viewport.render()
}

export function rememberIndex(viewportId: string, seriesUID: string, index: number) {
  rememberedIndex.set(rememberKey(viewportId, seriesUID), index)
}

export function forgetRememberedIndexes() {
  rememberedIndex.clear()
}

export async function setImageIndex(viewportId: string, index: number) {
  const viewport = getViewport(viewportId)
  if (!viewport) return
  const count = viewport.getImageIds().length
  await viewport.setImageIdIndex(Math.max(0, Math.min(count - 1, index)))
}

export function scrollImages(viewportId: string, delta: number) {
  getViewport(viewportId)?.scroll(delta)
}

export function setWindow(viewportId: string, width: number, center: number) {
  const viewport = getViewport(viewportId)
  if (!viewport) return
  viewport.setProperties({ voiRange: { lower: center - width / 2, upper: center + width / 2 } })
  viewport.render()
}

export function toggleInvert(viewportId: string) {
  const viewport = getViewport(viewportId)
  if (!viewport) return
  viewport.setProperties({ invert: !viewport.getProperties().invert })
  viewport.render()
}

export function rotate90(viewportId: string) {
  const viewport = getViewport(viewportId)
  if (!viewport) return
  const { rotation = 0 } = viewport.getViewPresentation()
  viewport.setViewPresentation({ rotation: (rotation + 90) % 360 })
  viewport.render()
}

export function flip(viewportId: string, direction: 'horizontal' | 'vertical') {
  const viewport = getViewport(viewportId)
  if (!viewport) return
  const presentation = viewport.getViewPresentation()
  viewport.setViewPresentation(
    direction === 'horizontal'
      ? { flipHorizontal: !presentation.flipHorizontal }
      : { flipVertical: !presentation.flipVertical },
  )
  viewport.render()
}

export function resetView(viewportId: string) {
  const viewport = getViewport(viewportId)
  if (!viewport) return
  viewport.resetProperties()
  viewport.resetCamera()
  viewport.render()
}

/** Downloads the current image (without measurement overlays) as PNG. */
export function downloadPng(viewportId: string, fileName: string) {
  const viewport = getViewport(viewportId)
  if (!viewport) return
  viewport.render()
  const link = document.createElement('a')
  link.href = viewport.getCanvas().toDataURL('image/png')
  link.download = fileName
  link.click()
}
