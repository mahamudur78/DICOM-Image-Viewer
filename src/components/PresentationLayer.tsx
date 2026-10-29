import { Enums } from '@cornerstonejs/core'
import { useEffect, useState } from 'react'
import { getViewport } from '../cornerstone/viewer'
import type { Series } from '../dicom/types'
import { imageToWorld } from '../objects/measurementSr'
import { applyPresentation, planeOfImage, setPresentation, usePresentation } from '../objects/presentation'
import { forImage, type PresentationGraphic, type PresentationState } from '../objects/presentationState'

type Point = [number, number]

interface Drawing {
  width: number
  height: number
  shutter: string | null
  shapes: { key: string; color: string; graphic?: PresentationGraphic & { canvas: Point[] }; text?: { text: string; at: Point } }[]
}

/**
 * A presentation state's shutter and annotations over a stack viewport. The
 * window, rotation, flip and displayed area are applied when it is first shown.
 */
export function PresentationLayer({ viewportId, series, element }: { viewportId: string; series: Series; element: HTMLDivElement | null }) {
  const shown = usePresentation((s) => s.byViewport[viewportId])
  const [drawing, setDrawing] = useState<Drawing | null>(null)
  const active = shown && shown.seriesId === series.id ? shown : null

  // Another series in the cell: the presentation no longer applies.
  useEffect(() => {
    if (shown && shown.seriesId !== series.id) setPresentation(viewportId, null)
  }, [shown, series.id, viewportId])

  useEffect(() => {
    if (!element || !active) return
    // Applying moves the camera, which fires the events that call draw again.
    let applied = active.applied
    const draw = () => {
      const viewport = getViewport(viewportId)
      const imageId = viewport?.getCurrentImageId()
      const image = series.images.find((i) => i.imageId === imageId)
      if (!viewport || !imageId || !image) return
      if (!applied) {
        applied = true
        if (applyPresentation(viewportId, active.state, image.sopInstanceUID, imageId)) setPresentation(viewportId, { ...active, applied: true })
      }
      setDrawing(drawingFor(active.state, image.sopInstanceUID, imageId, (world) => viewport.worldToCanvas(world as [number, number, number]) as Point, element))
    }
    const events = [Enums.Events.IMAGE_RENDERED, Enums.Events.CAMERA_MODIFIED]
    for (const event of events) element.addEventListener(event, draw)
    draw()
    return () => {
      for (const event of events) element.removeEventListener(event, draw)
    }
  }, [element, active, viewportId, series])

  if (!active || !drawing) return null
  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 ${drawing.width} ${drawing.height}`} data-testid="presentation-layer">
      {drawing.shutter && <path d={drawing.shutter} fill="#000" fillRule="evenodd" data-testid="presentation-shutter" />}
      {drawing.shapes.map((shape) =>
        shape.text ? (
          <text key={shape.key} x={shape.text.at[0]} y={shape.text.at[1]} fill={shape.color} fontSize="13" style={{ paintOrder: 'stroke', stroke: '#000', strokeWidth: 3 }}>
            {shape.text.text}
          </text>
        ) : (
          <GraphicShape key={shape.key} graphic={shape.graphic!} color={shape.color} />
        ),
      )}
    </svg>
  )
}

function GraphicShape({ graphic, color }: { graphic: PresentationGraphic & { canvas: Point[] }; color: string }) {
  const p = graphic.canvas
  const style = { stroke: color, strokeWidth: 1.5, fill: graphic.filled ? color : 'none', fillOpacity: graphic.filled ? 0.3 : undefined }
  if (graphic.type === 'POINT') return <path d={`M${p[0][0] - 4},${p[0][1]}h8M${p[0][0]},${p[0][1] - 4}v8`} {...style} />
  if (graphic.type === 'CIRCLE' && p.length >= 2) return <circle cx={p[0][0]} cy={p[0][1]} r={Math.hypot(p[1][0] - p[0][0], p[1][1] - p[0][1])} {...style} />
  if (graphic.type === 'ELLIPSE' && p.length >= 4) {
    const center = [(p[0][0] + p[1][0]) / 2, (p[0][1] + p[1][1]) / 2]
    const angle = (Math.atan2(p[1][1] - p[0][1], p[1][0] - p[0][0]) * 180) / Math.PI
    return (
      <ellipse
        cx={center[0]}
        cy={center[1]}
        rx={Math.hypot(p[1][0] - p[0][0], p[1][1] - p[0][1]) / 2}
        ry={Math.hypot(p[3][0] - p[2][0], p[3][1] - p[2][1]) / 2}
        transform={`rotate(${angle} ${center[0]} ${center[1]})`}
        {...style}
      />
    )
  }
  return <polyline points={p.map((q) => q.join(',')).join(' ')} {...style} />
}

function drawingFor(state: PresentationState, sopInstanceUID: string, imageId: string, toCanvas: (world: number[]) => Point, element: HTMLDivElement): Drawing | null {
  const plane = planeOfImage(imageId)
  if (!plane) return null
  const width = element.clientWidth
  const height = element.clientHeight
  const area = forImage(state.areas, sopInstanceUID)
  // DISPLAY units are fractions of the displayed area (or of the whole image without one).
  const imagePoint = (point: Point, units: string): Point => {
    if (units !== 'DISPLAY') return point
    const [x0, y0] = area ? [area.topLeft[0] - 1, area.topLeft[1] - 1] : [0, 0]
    const [x1, y1] = area ? area.bottomRight : [Infinity, Infinity]
    return [x0 + point[0] * (x1 - x0), y0 + point[1] * (y1 - y0)]
  }
  const canvas = (point: Point, units = 'PIXEL') => toCanvas(imageToWorld(plane, imagePoint(point, units)))

  const shapes: Drawing['shapes'] = []
  state.annotations.forEach((annotation, a) => {
    if (annotation.images && !annotation.images.includes(sopInstanceUID)) return
    const color = annotation.color ? `rgb(${annotation.color.join(',')})` : '#facc15'
    annotation.graphics.forEach((graphic, g) => shapes.push({ key: `${a}g${g}`, color, graphic: { ...graphic, canvas: graphic.points.map((p) => canvas(p, graphic.units)) } }))
    annotation.texts.forEach((text, n) => {
      const at = text.box ? canvas([text.box[0], text.box[1]], text.units) : text.anchor ? canvas(text.anchor, text.units) : null
      if (at) shapes.push({ key: `${a}t${n}`, color, text: { text: text.text, at: [at[0], at[1] + (text.box ? 12 : 0)] } })
    })
  })

  // Shutters: everything outside the shape is black (even-odd: the outer rectangle minus the shape).
  const outer = `M0,0H${width}V${height}H0Z`
  const shutterPaths = state.shutters.map((shutter) => {
    if (shutter.shape === 'RECTANGULAR') {
      const corners: Point[] = [
        [shutter.left - 1, shutter.top - 1],
        [shutter.right, shutter.top - 1],
        [shutter.right, shutter.bottom],
        [shutter.left - 1, shutter.bottom],
      ]
      return `M${corners.map((c) => canvas(c).join(',')).join('L')}Z`
    }
    if (shutter.shape === 'CIRCULAR') {
      const center = canvas([shutter.center[0] - 0.5, shutter.center[1] - 0.5])
      const edge = canvas([shutter.center[0] - 0.5 + shutter.radius, shutter.center[1] - 0.5])
      const r = Math.hypot(edge[0] - center[0], edge[1] - center[1])
      return `M${center[0] - r},${center[1]}a${r},${r} 0 1,0 ${2 * r},0a${r},${r} 0 1,0 ${-2 * r},0Z`
    }
    return `M${shutter.points.map((p) => canvas([p[0] - 0.5, p[1] - 0.5]).join(',')).join('L')}Z`
  })
  return { width, height, shutter: shutterPaths.length ? `${outer}${shutterPaths[0]}` : null, shapes }
}
