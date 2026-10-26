import { Enums, utilities } from '@cornerstonejs/core'
import { useEffect, useRef, useState } from 'react'
import {
  MPR_VIEWPORTS,
  getMprViewport,
  loadVolume,
  mountMprViewport,
  showVolume,
  unmountMprViewport,
} from '../cornerstone/mpr'
import { getOrientationMarkers, type OrientationMarkers } from '../cornerstone/orientation'
import { resizeViewports } from '../cornerstone/viewer'
import type { DisplaySet } from '../dicom/types'

interface MprViewProps {
  displaySet: DisplaySet
  activeViewportId: string
  onActivate: (viewportId: string) => void
  onError: (message: string) => void
}

/** Axial, sagittal and coronal reconstructions of one series, side by side. */
export function MprView({ displaySet, activeViewportId, onActivate, onError }: MprViewProps) {
  const { series } = displaySet
  const [progress, setProgress] = useState(0)
  const [ready, setReady] = useState<DisplaySet['series'] | null>(null)

  useEffect(() => {
    let cancelled = false
    loadVolume(series, (fraction) => !cancelled && setProgress(fraction))
      .then(async (volumeId) => {
        if (cancelled) return
        await showVolume(volumeId, series.images[Math.floor(series.images.length / 2)].imageId)
        if (!cancelled) setReady(series)
      })
      .catch((error: unknown) => {
        if (!cancelled) onError(`Could not build the volume: ${error instanceof Error ? error.message : String(error)}`)
      })
    return () => {
      cancelled = true
    }
  }, [series, onError])

  const building = ready !== series

  return (
    <div className="relative grid h-full w-full grid-rows-3 gap-px bg-slate-800 lg:grid-cols-3 lg:grid-rows-1">
      {MPR_VIEWPORTS.map(({ id, label, orientation }) => (
        <MprViewport
          key={id}
          viewportId={id}
          label={label}
          orientation={orientation}
          displaySet={displaySet}
          active={id === activeViewportId}
          onActivate={() => onActivate(id)}
        />
      ))}
      {(building || progress < 1) && (
        <div className="pointer-events-none absolute bottom-3 left-1/2 z-20 -translate-x-1/2 rounded-full bg-slate-900/90 px-4 py-1.5 text-xs text-slate-200 shadow">
          {building ? 'Building volume…' : 'Loading slices…'} {Math.round(progress * 100)}%
        </div>
      )}
    </div>
  )
}

interface MprViewportProps {
  viewportId: string
  label: string
  orientation: Enums.OrientationAxis
  displaySet: DisplaySet
  active: boolean
  onActivate: () => void
}

interface MprOverlay {
  slice: string
  windowWidth: number | null
  windowCenter: number | null
  slab: number
  markers: OrientationMarkers | null
}

function MprViewport({ viewportId, label, orientation, displaySet, active, onActivate }: MprViewportProps) {
  const elementRef = useRef<HTMLDivElement>(null)
  const [overlay, setOverlay] = useState<MprOverlay>({
    slice: '',
    windowWidth: null,
    windowCenter: null,
    slab: 0,
    markers: null,
  })

  useEffect(() => {
    const element = elementRef.current!
    mountMprViewport(viewportId, orientation, element)

    const update = () => {
      const viewport = getMprViewport(viewportId)
      if (!viewport || !viewport.getDefaultActor()) return
      const voi = viewport.getProperties()?.voiRange
      const { imageIndex, numberOfSlices } = utilities.getImageSliceDataForVolumeViewport(viewport) ?? {}
      setOverlay({
        slice: numberOfSlices ? `${imageIndex + 1} / ${numberOfSlices}` : '',
        windowWidth: voi ? Math.round(voi.upper - voi.lower) : null,
        windowCenter: voi ? Math.round((voi.upper + voi.lower) / 2) : null,
        slab: viewport.getSlabThickness(),
        markers: getOrientationMarkers(viewport),
      })
    }
    const events = [Enums.Events.CAMERA_MODIFIED, Enums.Events.VOI_MODIFIED, Enums.Events.VOLUME_NEW_IMAGE]
    for (const event of events) element.addEventListener(event, update)

    const resizeObserver = new ResizeObserver(() => resizeViewports())
    resizeObserver.observe(element)

    return () => {
      resizeObserver.disconnect()
      for (const event of events) element.removeEventListener(event, update)
      unmountMprViewport(viewportId)
    }
  }, [viewportId, orientation])

  const { markers } = overlay

  return (
    <div
      className={`@container relative min-h-0 min-w-0 overflow-hidden bg-black outline-1 -outline-offset-1 ${
        active ? 'z-10 outline-2 outline-sky-500' : 'outline-slate-800'
      }`}
      onPointerDownCapture={onActivate}
      onWheelCapture={active ? undefined : onActivate}
      onContextMenu={(event) => event.preventDefault()}
    >
      <div ref={elementRef} className="absolute inset-0" />
      <div className="pointer-events-none absolute inset-0 font-mono text-[11px] leading-[1.4] text-slate-100 [text-shadow:0_1px_2px_#000] sm:text-xs">
        <div className="absolute left-2 top-2 max-w-[40%]">
          <div className="font-semibold text-sky-300">{label}</div>
          <div className="truncate @max-xs:hidden">{displaySet.study.patientName}</div>
        </div>
        <div className="absolute right-2 top-2 max-w-[40%] text-right @max-xs:hidden">
          <div className="truncate">{displaySet.series.description || `Series ${displaySet.series.seriesNumber}`}</div>
          {overlay.slab > 1 && <div className="text-amber-300">Slab {overlay.slab.toFixed(0)} mm</div>}
        </div>
        <div className="absolute bottom-2 left-2">
          {overlay.windowWidth !== null && (
            <div>
              W: {overlay.windowWidth} L: {overlay.windowCenter}
            </div>
          )}
        </div>
        <div className="absolute bottom-2 right-2 text-right">{overlay.slice}</div>
        {markers && (
          <div className="text-sm font-semibold text-amber-200/90">
            <span className="absolute left-1/2 top-2 -translate-x-1/2">{markers.top}</span>
            <span className="absolute bottom-2 left-1/2 -translate-x-1/2 @max-xs:bottom-10">{markers.bottom}</span>
            <span className="absolute left-2 top-1/2 -translate-y-1/2">{markers.left}</span>
            <span className="absolute right-2 top-1/2 -translate-y-1/2">{markers.right}</span>
          </div>
        )}
      </div>
    </div>
  )
}
