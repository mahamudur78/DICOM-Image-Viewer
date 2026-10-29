import { Enums, getRenderingEngine, type Types } from '@cornerstonejs/core'
import { useEffect, useRef, useState } from 'react'
import { RENDERING_ENGINE_ID } from '../cornerstone/constants'
import { renderOverlay } from '../functional/fusion'
import { fusionKeyOf, overlayGrid, useFusion } from '../functional/fusionStore'
import { sample } from '../volume/grid'

/** Overlay pixels are computed at this fraction of the canvas, then drawn smoothly scaled up. */
const RESOLUTION = 0.5

/**
 * The fused series over a viewport, in colour. Each canvas point is mapped
 * to the patient and then into the overlay volume, so zoom, pan, rotation,
 * flips and oblique planes all line up by themselves.
 */
export function FusionLayer({ viewportId, fusionKey }: { viewportId: string; fusionKey?: string | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  // `null` turns fusion off for this viewport (the PET/CT layout's plain CT row).
  const key = fusionKey === undefined ? fusionKeyOf(viewportId) : fusionKey
  const setting = useFusion((s) => (key ? s.settings[key] : undefined))
  // The viewport may mount after this layer (its parent's effect runs later): look again shortly.
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const canvas = canvasRef.current
    const viewport = getRenderingEngine(RENDERING_ENGINE_ID)?.getViewport(viewportId) as Types.IViewport | undefined
    if (!canvas || !viewport || !setting?.volumeId || !setting.visible) {
      canvas?.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height)
      if (viewport || !setting?.volumeId) return
      const retry = window.setTimeout(() => setAttempt((n) => n + 1), 200)
      return () => window.clearTimeout(retry)
    }
    let frame = 0
    const draw = () => {
      frame = 0
      const grid = overlayGrid(setting.volumeId!)
      const element = viewport.element
      if (!grid || !element.clientWidth) return
      const width = Math.max(1, Math.round(element.clientWidth * RESOLUTION))
      const height = Math.max(1, Math.round(element.clientHeight * RESOLUTION))
      const pixels = renderOverlay(
        width,
        height,
        (x, y) => viewport.canvasToWorld([(x + 0.5) / RESOLUTION, (y + 0.5) / RESOLUTION]) as number[],
        (world) => sample(grid, world),
        setting.style,
        setting.registration,
      )
      const small = document.createElement('canvas')
      small.width = width
      small.height = height
      small.getContext('2d')!.putImageData(new ImageData(pixels, width, height), 0, 0)
      const ratio = window.devicePixelRatio || 1
      canvas.width = Math.round(element.clientWidth * ratio)
      canvas.height = Math.round(element.clientHeight * ratio)
      const context = canvas.getContext('2d')!
      context.imageSmoothingEnabled = true
      context.clearRect(0, 0, canvas.width, canvas.height)
      context.drawImage(small, 0, 0, canvas.width, canvas.height)
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(draw)
    }
    const events = [Enums.Events.IMAGE_RENDERED, Enums.Events.CAMERA_MODIFIED]
    for (const event of events) viewport.element.addEventListener(event, schedule)
    // The overlay volume streams in; redraw as it fills.
    const timer = window.setInterval(schedule, setting.progress < 1 ? 600 : 60_000)
    schedule()
    return () => {
      cancelAnimationFrame(frame)
      window.clearInterval(timer)
      for (const event of events) viewport.element.removeEventListener(event, schedule)
    }
  }, [viewportId, setting, attempt])

  if (!setting?.volumeId) return null
  return <canvas ref={canvasRef} data-testid="fusion-layer" className="pointer-events-none absolute inset-0 h-full w-full" />
}
