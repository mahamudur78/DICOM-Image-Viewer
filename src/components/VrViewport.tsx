import { useEffect, useRef, useState } from 'react'
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
    return () => {
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
      onPointerUpCapture={contextMenu.onPointerUpCapture}
      onContextMenu={contextMenu.onContextMenu}
    >
      <div ref={elementRef} className="absolute inset-0" />
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
