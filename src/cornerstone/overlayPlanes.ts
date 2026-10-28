import { metaData } from '@cornerstonejs/core'
import { wadouri } from '@cornerstonejs/dicom-image-loader'

interface OverlayPlane {
  rows: number
  columns: number
  x: number
  y: number
  pixelData: number[]
}

/** Overlay bitmaps by image id and plane, so redraws (zoom, pan) only re-place them. */
const bitmaps = new Map<string, HTMLCanvasElement[]>()

/** Frame number of a multi-frame image id ("…?frame=3"), 1 for single frames. */
const frameOf = (imageId: string) => Number(imageId.match(/[?&]frame=(\d+)/)?.[1] ?? 1)

/**
 * Overlay planes (60xx) of an image as canvases. Multi-frame overlays hold one
 * bit plane per frame, starting at Image Frame Origin (60xx,0051).
 */
export function overlayBitmaps(imageId: string): HTMLCanvasElement[] {
  const cached = bitmaps.get(imageId)
  if (cached) return cached
  const module = metaData.get('overlayPlaneModule', imageId) as { overlays?: OverlayPlane[] } | undefined
  // Not loaded yet: try again on the next render instead of caching "no overlays".
  if (!module) return []
  let dataSet: { uint16(tag: string): number | undefined; intString(tag: string): number | undefined } | undefined
  try {
    dataSet = wadouri.dataSetCacheManager.get(wadouri.parseImageId(imageId).url)
  } catch {
    dataSet = undefined
  }
  const groups = ['6000', '6002', '6004', '6006', '6008', '600a', '600c', '600e', '6010', '6012', '6014', '6016', '6018', '601a', '601c', '601e']
  const present = groups.filter((group) => (dataSet as { elements?: Record<string, unknown> } | undefined)?.elements?.[`x${group}3000`])
  const canvases = (module?.overlays ?? []).flatMap((overlay, i) => {
    const { rows, columns } = overlay
    if (!rows || !columns) return []
    const group = present[i]
    // Number of Frames in Overlay is IS (text); Image Frame Origin is US.
    const frames = (group && dataSet?.intString(`x${group}0015`)) || 1
    const origin = (group && dataSet?.uint16(`x${group}0051`)) || 1
    const frameIndex = frames > 1 ? frameOf(imageId) - origin : 0
    if (frameIndex < 0 || frameIndex >= frames) return []
    const offset = frameIndex * rows * columns

    const canvas = document.createElement('canvas')
    canvas.width = columns
    canvas.height = rows
    const context = canvas.getContext('2d')!
    const image = context.createImageData(columns, rows)
    for (let p = 0; p < rows * columns; p++) {
      if (!overlay.pixelData[offset + p]) continue
      image.data.set([255, 230, 120, 255], p * 4) // pale yellow, like most viewers
    }
    context.putImageData(image, 0, 0)
    Object.assign(canvas, { overlayX: overlay.x, overlayY: overlay.y })
    return [canvas]
  })
  bitmaps.set(imageId, canvases)
  return canvases
}

export const clearOverlayBitmaps = () => bitmaps.clear()
