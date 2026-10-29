import { useEffect, useState, type RefObject } from 'react'
import { getRenderingEngine, type Types } from '@cornerstonejs/core'
import { RENDERING_ENGINE_ID } from '../cornerstone/constants'
import { useSegmentTool } from '../segmentation/tool'
import { useViewer } from '../store/viewerStore'

const BRUSHES = new Set(['brush', 'eraser', 'threshold'])

/** The segment tool's brush outline under the pointer, and the scissors or contour path being drawn. */
export function SegmentPreviewLayer({ viewportId, elementRef }: { viewportId: string; elementRef: RefObject<HTMLDivElement | null> }) {
  const active = useViewer((s) => s.activeTool === 'segment')
  const { kind, radius, path } = useSegmentTool()
  const [pointer, setPointer] = useState<{ x: number; y: number; r: number } | null>(null)

  useEffect(() => {
    const element = elementRef.current
    if (!element || !active || !BRUSHES.has(kind)) return
    const move = (event: PointerEvent) => {
      const viewport = getRenderingEngine(RENDERING_ENGINE_ID)?.getViewport(viewportId) as Types.IViewport | undefined
      if (!viewport) return
      const rect = element.getBoundingClientRect()
      const canvas: Types.Point2 = [event.clientX - rect.left, event.clientY - rect.top]
      // Pixels per mm on screen, from two world points a millimetre apart in the view plane.
      const world = viewport.canvasToWorld(canvas)
      const right = viewport.canvasToWorld([canvas[0] + 10, canvas[1]])
      const mmPerPixel = Math.hypot(right[0] - world[0], right[1] - world[1], right[2] - world[2]) / 10
      setPointer({ x: canvas[0], y: canvas[1], r: radius / Math.max(1e-6, mmPerPixel) })
    }
    const leave = () => setPointer(null)
    element.addEventListener('pointermove', move)
    element.addEventListener('pointerleave', leave)
    return () => {
      element.removeEventListener('pointermove', move)
      element.removeEventListener('pointerleave', leave)
    }
  }, [elementRef, active, kind, radius, viewportId])

  if (!active) return null
  const shown = path?.viewportId === viewportId ? path : null
  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full" data-testid="segment-preview">
      {pointer && BRUSHES.has(kind) && <circle cx={pointer.x} cy={pointer.y} r={pointer.r} fill="none" stroke={kind === 'eraser' ? '#f87171' : '#facc15'} strokeWidth={1.5} />}
      {shown && shown.points.length > 1 && (
        <polyline points={shown.points.map((p) => p.join(',')).join(' ') + (shown.closed ? ` ${shown.points[0].join(',')}` : '')} fill="rgba(250,204,21,0.15)" stroke="#facc15" strokeWidth={1.5} strokeDasharray="4 3" />
      )}
    </svg>
  )
}
