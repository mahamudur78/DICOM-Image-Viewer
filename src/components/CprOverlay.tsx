import { Enums } from '@cornerstonejs/core'
import { useEffect, useReducer } from 'react'
import { useTranslation } from 'react-i18next'
import { getMprViewport } from '../cornerstone/mpr'
import { addCprPoint, useCpr } from '../cornerstone/mprTools'

/**
 * The curved-reformat path on an MPR viewport: while drawing, clicks add
 * points; the path is drawn on the viewport it belongs to.
 */
export function CprOverlay({ viewportId }: { viewportId: string }) {
  const { t } = useTranslation()
  const { drawing, viewportId: pathViewport, points } = useCpr()
  const [, redraw] = useReducer((n: number) => n + 1, 0)

  useEffect(() => {
    const element = getMprViewport(viewportId)?.element
    if (!element) return
    element.addEventListener(Enums.Events.CAMERA_MODIFIED, redraw)
    return () => element.removeEventListener(Enums.Events.CAMERA_MODIFIED, redraw)
  }, [viewportId])

  const viewport = getMprViewport(viewportId)
  const mine = pathViewport === viewportId
  if (!viewport || (!drawing && !mine) || (pathViewport && !mine)) return null
  const canvas = mine ? points.map((p) => viewport.worldToCanvas(p as [number, number, number])) : []

  return (
    <svg
      data-testid="cpr-overlay"
      aria-label={t('cpr.overlay')}
      className={`absolute inset-0 h-full w-full ${drawing ? 'cursor-crosshair' : 'pointer-events-none'}`}
      onPointerDown={(event) => {
        if (!drawing || event.button !== 0) return
        event.stopPropagation()
        const rect = event.currentTarget.getBoundingClientRect()
        addCprPoint(viewportId, [event.clientX - rect.left, event.clientY - rect.top])
      }}
    >
      <polyline points={canvas.map(([x, y]) => `${x},${y}`).join(' ')} fill="none" stroke="#facc15" strokeWidth={2} />
      {canvas.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={4} fill="#facc15" />
      ))}
    </svg>
  )
}
