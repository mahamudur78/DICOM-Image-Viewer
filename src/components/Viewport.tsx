import { Enums } from '@cornerstonejs/core'
import { useEffect, useRef, useState } from 'react'
import {
  getViewport,
  mountViewport,
  resizeViewport,
  setImageIndex,
  showStack,
  unmountViewport,
} from '../cornerstone/viewer'
import type { Series, Study } from '../dicom/types'

interface ViewportProps {
  study: Study
  series: Series
  onError: (message: string) => void
  onIndexChange: (index: number) => void
}

interface OverlayState {
  index: number
  windowWidth: number | null
  windowCenter: number | null
  zoom: number
}

export function Viewport({ study, series, onError, onIndexChange }: ViewportProps) {
  const elementRef = useRef<HTMLDivElement>(null)
  const onIndexChangeRef = useRef(onIndexChange)
  const [overlay, setOverlay] = useState<OverlayState>({ index: 0, windowWidth: null, windowCenter: null, zoom: 1 })
  const [loadedSeries, setLoadedSeries] = useState<Series | null>(null)
  const loading = loadedSeries !== series
  const count = series.images.length

  useEffect(() => {
    onIndexChangeRef.current = onIndexChange
  }, [onIndexChange])

  useEffect(() => {
    const element = elementRef.current!
    mountViewport(element)

    const update = () => {
      const viewport = getViewport()
      if (!viewport) return
      const voi = viewport.getProperties().voiRange
      const index = viewport.getCurrentImageIdIndex()
      onIndexChangeRef.current(index)
      setOverlay({
        index,
        windowWidth: voi ? Math.round(voi.upper - voi.lower) : null,
        windowCenter: voi ? Math.round((voi.upper + voi.lower) / 2) : null,
        zoom: viewport.getZoom(),
      })
    }
    const events = [Enums.Events.STACK_NEW_IMAGE, Enums.Events.VOI_MODIFIED, Enums.Events.CAMERA_MODIFIED]
    for (const event of events) element.addEventListener(event, update)

    const resizeObserver = new ResizeObserver(() => resizeViewport())
    resizeObserver.observe(element)

    return () => {
      resizeObserver.disconnect()
      for (const event of events) element.removeEventListener(event, update)
      unmountViewport()
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    showStack(series.images.map((image) => image.imageId))
      .catch((error: unknown) => {
        if (!cancelled) onError(`Could not display this series: ${describeError(error)}`)
      })
      .finally(() => {
        if (!cancelled) setLoadedSeries(series)
      })
    return () => {
      cancelled = true
    }
  }, [series, onError])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="relative min-h-0 flex-1 bg-black" onContextMenu={(event) => event.preventDefault()}>
        <div ref={elementRef} className="absolute inset-0" />

        <div className="pointer-events-none absolute inset-0 p-3 font-mono text-xs leading-5 text-amber-100/90 [text-shadow:0_1px_2px_#000]">
          <div className="absolute left-3 top-3">
            <div className="font-semibold">{study.patientName}</div>
            {study.patientId && <div>ID: {study.patientId}</div>}
            <div>{study.studyDate}</div>
          </div>
          <div className="absolute right-3 top-3 text-right">
            <div>{series.modality}</div>
            <div className="max-w-56 truncate">{series.description || `Series ${series.seriesNumber}`}</div>
          </div>
          <div className="absolute bottom-3 left-3">
            <div>
              Im: {overlay.index + 1} / {count}
            </div>
            {overlay.windowWidth !== null && (
              <div>
                W: {overlay.windowWidth} L: {overlay.windowCenter}
              </div>
            )}
            <div>Zoom: {overlay.zoom.toFixed(2)}×</div>
          </div>
          <div className="absolute bottom-3 right-3 text-right text-amber-100/60">Not for diagnostic use</div>
        </div>

        {loading && (
          <div className="absolute inset-0 grid place-items-center bg-black/40 text-sm text-slate-200">
            Loading images…
          </div>
        )}
      </div>

      {count > 1 && (
        <div className="flex items-center gap-3 border-t border-slate-800 bg-slate-900 px-4 py-2">
          <input
            type="range"
            min={0}
            max={count - 1}
            value={overlay.index}
            onChange={(event) => void setImageIndex(Number(event.target.value))}
            className="w-full accent-sky-500"
            aria-label="Slice"
          />
          <span className="w-20 shrink-0 text-right font-mono text-xs text-slate-400">
            {overlay.index + 1} / {count}
          </span>
        </div>
      )}
    </div>
  )
}

function describeError(error: unknown) {
  if (error instanceof Error) return error.message
  if (typeof error === 'object' && error && 'error' in error) return String((error as { error: unknown }).error)
  return String(error)
}
