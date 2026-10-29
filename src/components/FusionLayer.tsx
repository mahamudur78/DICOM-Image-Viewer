import { Enums, getRenderingEngine, type Types } from '@cornerstonejs/core'
import { useEffect, useRef, useState } from 'react'
import { RENDERING_ENGINE_ID } from '../cornerstone/constants'
import { colorize, colorizeLabels, sampleOverlay } from '../functional/fusion'
import { fusionKeyOf, objectKeysOf, overlayGrid, useFusion, type FusionSetting } from '../functional/fusionStore'
import { ISODOSE_LEVELS, isolines } from '../objects/dose'
import { labelAt } from '../objects/labels'
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
      const labels = setting.mode === 'labels'
      const values = sampleOverlay(
        width,
        height,
        (x, y) => viewport.canvasToWorld([(x + 0.5) / RESOLUTION, (y + 0.5) / RESOLUTION]) as number[],
        labels ? (world) => labelAt(grid, world) : (world) => sample(grid, world),
        setting.registration,
      )
      const pixels = labels
        ? colorizeLabels(values, width, height, setting.segments ?? [], setting.style.opacity)
        : setting.mode === 'dose' && !setting.dose?.wash
          ? new Uint8ClampedArray(width * height * 4)
          : colorize(values, setting.style)
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
      if (setting.mode === 'dose' && setting.dose?.isodose) drawIsodose(context, values, width, height, setting, canvas.width / width)
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
  return <canvas ref={canvasRef} data-testid={key?.startsWith('obj:') ? 'object-layer' : 'fusion-layer'} className="pointer-events-none absolute inset-0 h-full w-full" />
}

/** Isodose lines at the usual percentages of the reference dose. */
function drawIsodose(context: CanvasRenderingContext2D, values: Float32Array, width: number, height: number, setting: FusionSetting, scale: number) {
  const reference = setting.dose!.reference
  context.lineWidth = Math.max(1, scale * 0.6)
  for (const { percent, color } of ISODOSE_LEVELS) {
    const lines = isolines(values, width, height, (reference * percent) / 100)
    if (!lines.length) continue
    context.strokeStyle = color
    context.beginPath()
    // Cell coordinates are pixel centres of the sampled grid.
    for (const [x0, y0, x1, y1] of lines) {
      context.moveTo((x0 + 0.5) * scale, (y0 + 0.5) * scale)
      context.lineTo((x1 + 0.5) * scale, (y1 + 0.5) * scale)
    }
    context.stroke()
  }
}

/** The DICOM objects (segmentations, structures, dose, maps) shown over a series, in any viewport of it. */
export function ObjectLayers({ viewportId, seriesId }: { viewportId: string; seriesId: string | undefined }) {
  const keys = useFusion((s) => (seriesId ? objectKeysOf(s.settings, seriesId).join('\n') : ''))
  if (!keys) return null
  return keys.split('\n').map((key) => <FusionLayer key={key} viewportId={viewportId} fusionKey={key} />)
}
