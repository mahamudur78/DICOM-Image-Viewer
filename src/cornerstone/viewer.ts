import { Enums, RenderingEngine, getRenderingEngine, type Types } from '@cornerstonejs/core'
import { ToolGroupManager } from '@cornerstonejs/tools'
import { TOOL_GROUP_ID, createToolGroup } from './tools'

export const RENDERING_ENGINE_ID = 'main-rendering-engine'
export const VIEWPORT_ID = 'main-viewport'

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

export function getViewport(): Types.IStackViewport | undefined {
  return getRenderingEngine(RENDERING_ENGINE_ID)?.getViewport(VIEWPORT_ID) as
    | Types.IStackViewport
    | undefined
}

export function mountViewport(element: HTMLDivElement) {
  const renderingEngine = getRenderingEngine(RENDERING_ENGINE_ID) ?? new RenderingEngine(RENDERING_ENGINE_ID)
  renderingEngine.enableElement({
    viewportId: VIEWPORT_ID,
    type: Enums.ViewportType.STACK,
    element,
    defaultOptions: { background: [0, 0, 0] },
  })
  createToolGroup(RENDERING_ENGINE_ID, VIEWPORT_ID)
}

export function unmountViewport() {
  ToolGroupManager.destroyToolGroup(TOOL_GROUP_ID)
  getRenderingEngine(RENDERING_ENGINE_ID)?.destroy()
}

export function resizeViewport() {
  getRenderingEngine(RENDERING_ENGINE_ID)?.resize(true, true)
}

export async function showStack(imageIds: string[]) {
  const viewport = getViewport()
  if (!viewport || imageIds.length === 0) return
  // Start in the middle of the stack, which is usually the most useful slice.
  await viewport.setStack(imageIds, Math.floor(imageIds.length / 2))
  viewport.render()
}

export async function setImageIndex(index: number) {
  const viewport = getViewport()
  if (!viewport) return
  const count = viewport.getImageIds().length
  await viewport.setImageIdIndex(Math.max(0, Math.min(count - 1, index)))
}

export function scrollImages(delta: number) {
  getViewport()?.scroll(delta)
}

export function setWindow(width: number, center: number) {
  const viewport = getViewport()
  if (!viewport) return
  viewport.setProperties({ voiRange: { lower: center - width / 2, upper: center + width / 2 } })
  viewport.render()
}

export function toggleInvert() {
  const viewport = getViewport()
  if (!viewport) return
  viewport.setProperties({ invert: !viewport.getProperties().invert })
  viewport.render()
}

export function rotate90() {
  const viewport = getViewport()
  if (!viewport) return
  const { rotation = 0 } = viewport.getViewPresentation()
  viewport.setViewPresentation({ rotation: (rotation + 90) % 360 })
  viewport.render()
}

export function flip(direction: 'horizontal' | 'vertical') {
  const viewport = getViewport()
  if (!viewport) return
  const presentation = viewport.getViewPresentation()
  viewport.setViewPresentation(
    direction === 'horizontal'
      ? { flipHorizontal: !presentation.flipHorizontal }
      : { flipVertical: !presentation.flipVertical },
  )
  viewport.render()
}

export function resetView() {
  const viewport = getViewport()
  if (!viewport) return
  viewport.resetProperties()
  viewport.resetCamera()
  viewport.render()
}

/** Downloads the current image (without measurement overlays) as PNG. */
export function downloadPng(fileName: string) {
  const viewport = getViewport()
  if (!viewport) return
  viewport.render()
  const link = document.createElement('a')
  link.href = viewport.getCanvas().toDataURL('image/png')
  link.download = fileName
  link.click()
}
