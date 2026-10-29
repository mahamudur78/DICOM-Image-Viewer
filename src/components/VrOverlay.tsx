import { Enums, getRenderingEngine } from '@cornerstonejs/core'
import { useEffect, useReducer, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { RENDERING_ENGINE_ID } from '../cornerstone/constants'
import { addMeasurePoint, pickSurface, scalpelCut, setVrMode, useVr3d } from '../cornerstone/volume3dTools'
import { notify } from '../notifications/toastStore'

/**
 * Over a 3D viewport: the scalpel outline being drawn, picking measurement
 * points on the surface, and the measurement line with its length.
 */
export function VrOverlay({ viewportId }: { viewportId: string }) {
  const { t } = useTranslation()
  const mode = useVr3d((s) => s.mode)
  const points = useVr3d((s) => s.measure[viewportId])
  const [outline, setOutline] = useState<[number, number][] | null>(null)
  const [, redraw] = useReducer((n: number) => n + 1, 0)
  const viewport = getRenderingEngine(RENDERING_ENGINE_ID)?.getViewport(viewportId)

  useEffect(() => {
    const element = getRenderingEngine(RENDERING_ENGINE_ID)?.getViewport(viewportId)?.element
    if (!element) return
    element.addEventListener(Enums.Events.CAMERA_MODIFIED, redraw)
    return () => element.removeEventListener(Enums.Events.CAMERA_MODIFIED, redraw)
  }, [viewportId])

  const active = mode !== 'none'
  const at = (event: React.PointerEvent) => {
    const rect = event.currentTarget.getBoundingClientRect()
    return [event.clientX - rect.left, event.clientY - rect.top] as [number, number]
  }
  const projected = viewport && points ? points.map((p) => viewport.worldToCanvas(p as [number, number, number])) : []
  const distance = points?.length === 2 ? Math.hypot(points[0][0] - points[1][0], points[0][1] - points[1][1], points[0][2] - points[1][2]) : null

  return (
    <svg
      data-testid="vr-overlay"
      className={`absolute inset-0 h-full w-full ${active ? 'cursor-crosshair' : 'pointer-events-none'}`}
      onPointerDown={(event) => {
        if (!active || event.button !== 0) return
        event.stopPropagation()
        event.currentTarget.setPointerCapture(event.pointerId)
        if (mode === 'measure') {
          const point = pickSurface(viewportId, at(event))
          if (point) addMeasurePoint(viewportId, point)
          else notify(t('vr.noSurface'), 'info')
        } else setOutline([at(event)])
      }}
      onPointerMove={(event) => outline && setOutline([...outline, at(event)])}
      onPointerUp={async () => {
        if (!outline) return
        const polygon = outline
        setOutline(null)
        if (polygon.length < 3) return
        const removed = await scalpelCut(viewportId, polygon, mode === 'cutOutside')
        notify(t('vr.cut', { count: removed }), 'info')
        setVrMode('none')
      }}
    >
      {outline && <polygon points={outline.map(([x, y]) => `${x},${y}`).join(' ')} fill="rgba(244,63,94,0.15)" stroke="#f43f5e" strokeWidth={1.5} />}
      {projected.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={4} fill="#facc15" />
      ))}
      {projected.length === 2 && (
        <>
          <line x1={projected[0][0]} y1={projected[0][1]} x2={projected[1][0]} y2={projected[1][1]} stroke="#facc15" strokeWidth={2} />
          <text data-testid="vr-distance" x={(projected[0][0] + projected[1][0]) / 2 + 6} y={(projected[0][1] + projected[1][1]) / 2 - 6} fill="#facc15" fontSize={14} style={{ paintOrder: 'stroke', stroke: '#000', strokeWidth: 3 }}>
            {t('vr.distance', { mm: distance!.toFixed(1) })}
          </text>
        </>
      )}
    </svg>
  )
}
