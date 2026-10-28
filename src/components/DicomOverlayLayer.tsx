import { Enums } from '@cornerstonejs/core'
import { imageToCanvas } from '../cornerstone/imageCoords'
import { useEffect, useRef } from 'react'
import { overlayBitmaps } from '../cornerstone/overlayPlanes'
import { getViewport } from '../cornerstone/viewer'

/**
 * Draws the image's DICOM overlay planes over a stack viewport, following
 * its zoom, pan, rotation and flips.
 */
export function DicomOverlayLayer({ viewportId, element }: { viewportId: string; element: HTMLDivElement | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!element) return
    const draw = () => {
      const canvas = canvasRef.current
      const viewport = getViewport(viewportId)
      const imageId = viewport?.getCurrentImageId()
      if (!canvas || !viewport || !imageId) return
      const ratio = window.devicePixelRatio || 1
      canvas.width = Math.round(element.clientWidth * ratio)
      canvas.height = Math.round(element.clientHeight * ratio)
      const context = canvas.getContext('2d')!
      context.setTransform(1, 0, 0, 1, 0, 0)
      context.clearRect(0, 0, canvas.width, canvas.height)
      for (const bitmap of overlayBitmaps(imageId)) {
        const { overlayX = 0, overlayY = 0 } = bitmap as HTMLCanvasElement & { overlayX?: number; overlayY?: number }
        // Image pixel (x, y) is the centre of a pixel; place the bitmap by its corners.
        const p0 = imageToCanvas(viewportId, [overlayX - 0.5, overlayY - 0.5])
        const px = imageToCanvas(viewportId, [overlayX + bitmap.width - 0.5, overlayY - 0.5])
        const py = imageToCanvas(viewportId, [overlayX - 0.5, overlayY + bitmap.height - 0.5])
        if (!p0 || !px || !py) continue
        context.setTransform(
          (ratio * (px[0] - p0[0])) / bitmap.width,
          (ratio * (px[1] - p0[1])) / bitmap.width,
          (ratio * (py[0] - p0[0])) / bitmap.height,
          (ratio * (py[1] - p0[1])) / bitmap.height,
          ratio * p0[0],
          ratio * p0[1],
        )
        context.imageSmoothingEnabled = false
        context.drawImage(bitmap, 0, 0)
      }
    }
    element.addEventListener(Enums.Events.IMAGE_RENDERED, draw)
    draw()
    return () => element.removeEventListener(Enums.Events.IMAGE_RENDERED, draw)
  }, [viewportId, element])

  return <canvas ref={canvasRef} data-testid="dicom-overlay" className="pointer-events-none absolute inset-0 h-full w-full" />
}
