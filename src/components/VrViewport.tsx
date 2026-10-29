import { Enums, getRenderingEngine } from '@cornerstonejs/core'
import { useEffect, useReducer, useRef, useState } from 'react'
import { useCursor3D } from '../comparison/cursor3d'
import { installInteractiveQuality } from '../cornerstone/volume3dTools'
import { VrOverlay } from './VrOverlay'
import { MPR_VR_VIEWPORT_ID, RENDERING_ENGINE_ID } from '../cornerstone/constants'
import { useTranslation } from 'react-i18next'
import { resizeViewports } from '../cornerstone/viewer'
import { applyPreset, mountVrViewport, onShiftChange, showVolume3D, unmountVrViewport } from '../cornerstone/volume3d'
import type { DisplaySet } from '../dicom/types'
import { useContextMenuTrigger } from './contextMenuTrigger'

interface VrViewportProps {
  viewportId: string
  volumeId: string | null
  preset: string
  displaySet: DisplaySet
  active: boolean
  onActivate: () => void
}

/** One 3D volume rendering viewport; the volume is loaded by the parent. */
export function VrViewport({ viewportId, volumeId, preset, displaySet, active, onActivate }: VrViewportProps) {
  const { t } = useTranslation()
  const contextMenu = useContextMenuTrigger()
  const elementRef = useRef<HTMLDivElement>(null)
  const presetRef = useRef(preset)
  const [shownVolume, setShownVolume] = useState<string | null>(null)
  const [shift, setShift] = useState(0)

  useEffect(() => {
    const element = elementRef.current!
    mountVrViewport(viewportId, element)
    const resizeObserver = new ResizeObserver(() => resizeViewports())
    resizeObserver.observe(element)
    const unsubscribe = onShiftChange((id, value) => id === viewportId && setShift(value))
    const stopQuality = installInteractiveQuality(viewportId, element)
    return () => {
      stopQuality()
      unsubscribe()
      resizeObserver.disconnect()
      unmountVrViewport(viewportId)
    }
  }, [viewportId])

  // Declared before the volume effect so a preset that changes together with
  // the series is already in presetRef when the new volume is shown.
  useEffect(() => {
    if (presetRef.current === preset) return
    presetRef.current = preset
    // applyPreset resets the shift and notifies onShiftChange.
    if (shownVolume && shownVolume === volumeId) applyPreset(viewportId, preset)
  }, [viewportId, preset, shownVolume, volumeId])

  useEffect(() => {
    if (!volumeId) return
    let cancelled = false
    const initialPreset = presetRef.current
    showVolume3D(viewportId, volumeId, initialPreset).then(() => {
      if (cancelled) return
      // The preset may have changed while the volume was being attached.
      if (presetRef.current !== initialPreset) applyPreset(viewportId, presetRef.current)
      setShownVolume(volumeId)
    })
    return () => {
      cancelled = true
    }
  }, [viewportId, volumeId])

  return (
    <div
      className={`@container relative h-full min-h-0 w-full min-w-0 overflow-hidden bg-black outline-1 -outline-offset-1 ${
        active ? 'z-10 outline-2 outline-sky-500' : 'outline-slate-800'
      }`}
      data-viewport-id={viewportId}
      onPointerDownCapture={(event) => {
        onActivate()
        contextMenu.onPointerDownCapture(event)
      }}
      onPointerMoveCapture={contextMenu.onPointerMoveCapture}
      onPointerCancelCapture={contextMenu.onPointerCancelCapture}
      onPointerUpCapture={contextMenu.onPointerUpCapture}
      onContextMenu={contextMenu.onContextMenu}
    >
      <div ref={elementRef} className="absolute inset-0" />
      {viewportId === MPR_VR_VIEWPORT_ID && <CenterMarker viewportId={viewportId} />}
      {shownVolume && <VrOverlay viewportId={viewportId} />}
      <div className="pointer-events-none absolute inset-0 font-mono text-[11px] leading-[1.4] text-slate-100 [text-shadow:0_1px_2px_#000] sm:text-xs">
        <div className="absolute left-2 top-2 max-w-[50%]">
          <div className="font-semibold text-sky-300">{t('viewport.vr')}</div>
          <div className="truncate @max-xs:hidden">{displaySet.study.patientName || t('viewport.anonymous')}</div>
        </div>
        <div className="absolute bottom-2 left-2">
          <div>{preset}</div>
          {shift !== 0 && (
            <div className="text-amber-300">{t('viewport.shift', { value: `${shift > 0 ? '+' : ''}${Math.round(shift)}` })}</div>
          )}
        </div>
        <div className="absolute bottom-2 right-2 max-w-[45%] truncate text-right @max-xs:hidden">
          {displaySet.series.description || t('viewport.seriesNumber', { number: displaySet.series.seriesNumber })}
        </div>
      </div>
    </div>
  )
}

/**
 * Where the MPR planes cross, drawn over the 3D rendering (a point inside the
 * volume would be hidden by the tissue in front of it).
 */
function CenterMarker({ viewportId }: { viewportId: string }) {
  const { t } = useTranslation()
  const center = useCursor3D((s) => s.mprCenter)
  const [, redraw] = useReducer((n: number) => n + 1, 0)

  // Rotating the 3D view moves the projected point.
  useEffect(() => {
    const element = getRenderingEngine(RENDERING_ENGINE_ID)?.getViewport(viewportId)?.element
    if (!element) return
    element.addEventListener(Enums.Events.CAMERA_MODIFIED, redraw)
    return () => element.removeEventListener(Enums.Events.CAMERA_MODIFIED, redraw)
  }, [viewportId])

  const viewport = getRenderingEngine(RENDERING_ENGINE_ID)?.getViewport(viewportId)
  if (!center || !viewport) return null
  const [x, y] = viewport.worldToCanvas(center as [number, number, number])
  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full" data-testid="mpr-center" aria-label={t('cursor3d.title')}>
      <g stroke="#f43f5e" strokeWidth={1.5} fill="none">
        <circle cx={x} cy={y} r={6} />
        <line x1={x - 12} y1={y} x2={x + 12} y2={y} />
        <line x1={x} y1={y - 12} x2={x} y2={y + 12} />
      </g>
    </svg>
  )
}
