import { Enums } from '@cornerstonejs/core'
import { useEffect, useRef } from 'react'
import { drawOverlayPlanes } from '../cornerstone/overlayPlanes'
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
      context.clearRect(0, 0, canvas.width, canvas.height)
      drawOverlayPlanes(context, viewportId, imageId, ratio)
    }
    element.addEventListener(Enums.Events.IMAGE_RENDERED, draw)
    draw()
    return () => element.removeEventListener(Enums.Events.IMAGE_RENDERED, draw)
  }, [viewportId, element])

  return <canvas ref={canvasRef} data-testid="dicom-overlay" className="pointer-events-none absolute inset-0 h-full w-full" />
}
