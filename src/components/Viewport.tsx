import { Enums } from '@cornerstonejs/core'
import { useEffect, useRef, useState } from 'react'
import { getOrientationMarkers, type OrientationMarkers } from '../cornerstone/orientation'
import {
  getViewport,
  mountViewport,
  rememberIndex,
  resizeViewports,
  setImageIndex,
  showStack,
  unmountViewport,
} from '../cornerstone/viewer'
import type { DisplaySet } from '../dicom/types'
import { ImageScrollbar } from './ImageScrollbar'

interface ViewportProps {
  viewportId: string
  displaySet: DisplaySet
  active: boolean
  onActivate: () => void
  onToggleMaximize: () => void
  onIndexChange: (index: number) => void
  onError: (message: string) => void
}

interface OverlayState {
  index: number
  windowWidth: number | null
  windowCenter: number | null
  zoom: number
  size: string
  markers: OrientationMarkers | null
}

const INITIAL_OVERLAY: OverlayState = {
  index: 0,
  windowWidth: null,
  windowCenter: null,
  zoom: 1,
  size: '',
  markers: null,
}

export function Viewport({
  viewportId,
  displaySet,
  active,
  onActivate,
  onToggleMaximize,
  onIndexChange,
  onError,
}: ViewportProps) {
  const { study, series } = displaySet
  const elementRef = useRef<HTMLDivElement>(null)
  const onIndexChangeRef = useRef(onIndexChange)
  const seriesRef = useRef(series)
  const [overlay, setOverlay] = useState<OverlayState>(INITIAL_OVERLAY)
  const [loadedSeries, setLoadedSeries] = useState<DisplaySet['series'] | null>(null)
  const loading = loadedSeries !== series
  const count = series.images.length

  useEffect(() => {
    onIndexChangeRef.current = onIndexChange
    seriesRef.current = series
  }, [onIndexChange, series])

  useEffect(() => {
    const element = elementRef.current!
    mountViewport(viewportId, element)

    const update = () => {
      const viewport = getViewport(viewportId)
      if (!viewport) return
      const voi = viewport.getProperties().voiRange
      const image = viewport.getCornerstoneImage()
      const index = viewport.getCurrentImageIdIndex()
      rememberIndex(viewportId, seriesRef.current.seriesInstanceUID, index)
      onIndexChangeRef.current(index)
      setOverlay({
        index,
        windowWidth: voi ? Math.round(voi.upper - voi.lower) : null,
        windowCenter: voi ? Math.round((voi.upper + voi.lower) / 2) : null,
        zoom: viewport.getZoom(),
        size: image ? `${image.columns} × ${image.rows}` : '',
        markers: seriesRef.current.hasOrientation ? getOrientationMarkers(viewport) : null,
      })
    }
    const events = [Enums.Events.STACK_NEW_IMAGE, Enums.Events.VOI_MODIFIED, Enums.Events.CAMERA_MODIFIED]
    for (const event of events) element.addEventListener(event, update)

    const resizeObserver = new ResizeObserver(() => resizeViewports())
    resizeObserver.observe(element)

    return () => {
      resizeObserver.disconnect()
      for (const event of events) element.removeEventListener(event, update)
      unmountViewport(viewportId)
    }
  }, [viewportId])

  useEffect(() => {
    let cancelled = false
    showStack(
      viewportId,
      series.seriesInstanceUID,
      series.images.map((image) => image.imageId),
    )
      .catch((error: unknown) => {
        if (!cancelled) onError(`Could not display this series: ${describeError(error)}`)
      })
      .finally(() => {
        if (!cancelled) setLoadedSeries(series)
      })
    return () => {
      cancelled = true
    }
  }, [viewportId, series, onError])

  const { markers } = overlay

  return (
    <div
      className={`@container relative h-full w-full overflow-hidden bg-black outline-1 -outline-offset-1 ${
        active ? 'z-10 outline-2 outline-sky-500' : 'outline-slate-800'
      }`}
      onPointerDownCapture={onActivate}
      onWheelCapture={active ? undefined : onActivate}
      onDoubleClick={onToggleMaximize}
      onContextMenu={(event) => event.preventDefault()}
    >
      <div ref={elementRef} className="absolute inset-0" />

      <div className="pointer-events-none absolute inset-0 font-mono text-[11px] leading-[1.4] text-slate-100 [text-shadow:0_1px_2px_#000] sm:text-xs">
        {/* Small cells (e.g. 2×2 on a phone) show only the essentials. */}
        <div className="absolute left-2 top-2 max-w-[40%]">
          <div className="truncate font-semibold">{study.patientName}</div>
          {study.patientId && <div className="truncate @max-xs:hidden">{study.patientId}</div>}
          {overlay.size && <div className="@max-xs:hidden">{overlay.size}</div>}
        </div>
        <div className="absolute right-5 top-2 max-w-[40%] text-right @max-xs:hidden">
          <div className="truncate">{study.studyDate}</div>
          <div>
            {series.modality} · #{series.seriesNumber}
          </div>
          {series.description && <div className="truncate">{series.description}</div>}
        </div>
        <div className="absolute bottom-2 left-2">
          <div>Z: {overlay.zoom.toFixed(2)}</div>
          {overlay.windowWidth !== null && (
            <div>
              W: {overlay.windowWidth} L: {overlay.windowCenter}
            </div>
          )}
        </div>
        <div className="absolute bottom-2 right-5 text-right">
          {overlay.index + 1} / {count}
        </div>

        {markers && (
          <div className="text-sm font-semibold text-amber-200/90">
            <span className="absolute left-1/2 top-2 -translate-x-1/2">{markers.top}</span>
            <span className="absolute bottom-2 left-1/2 -translate-x-1/2 @max-xs:bottom-10">{markers.bottom}</span>
            <span className="absolute left-2 top-1/2 -translate-y-1/2">{markers.left}</span>
            <span className="absolute right-5 top-1/2 -translate-y-1/2">{markers.right}</span>
          </div>
        )}
      </div>

      {count > 1 && (
        <ImageScrollbar count={count} index={overlay.index} onChange={(index) => void setImageIndex(viewportId, index)} />
      )}

      {loading && (
        <div className="absolute inset-0 grid place-items-center bg-black/40 text-sm text-slate-200">Loading images…</div>
      )}
    </div>
  )
}

function describeError(error: unknown) {
  if (error instanceof Error) return error.message
  if (typeof error === 'object' && error && 'error' in error) return String((error as { error: unknown }).error)
  return String(error)
}
