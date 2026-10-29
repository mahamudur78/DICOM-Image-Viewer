import { Enums } from '@cornerstonejs/core'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { applyModalityDefaults } from '../cornerstone/display'
import { broadcastVoi } from '../comparison/multiWindow'
import { syncFromViewport } from '../cornerstone/sync'
import { viewportChanged } from '../cornerstone/viewportChanges'
import { restoreViewState, saveViewState } from '../cornerstone/viewState'
import { DOUBLE_CLICK_TOOLS } from '../cornerstone/tools'
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
import { notify } from '../notifications/toastStore'
import { useSettings } from '../store/settingsStore'
import { filterElementId, useViewportDisplay } from '../store/viewportDisplayStore'
import { cellOfViewport, useViewer } from '../store/viewerStore'
import { CineControls } from './CineControls'
import { ComparisonLayer } from './ComparisonLayer'
import { FusionLayer } from './FusionLayer'
import { DicomOverlayLayer } from './DicomOverlayLayer'
import { useContextMenuTrigger } from './contextMenuTrigger'
import { useCinePlayback } from './useCinePlayback'
import { ImageScrollbar } from './ImageScrollbar'
import { formatPixelValue, usePixelValue } from './usePixelValue'

interface ViewportProps {
  viewportId: string
  displaySet: DisplaySet
  active: boolean
  onActivate: () => void
  onToggleMaximize: () => void
  onIndexChange: (index: number) => void
}

interface OverlayState {
  index: number
  windowWidth: number | null
  windowCenter: number | null
  zoom: number
  size: string
  markers: OrientationMarkers | null
  /** Unit of PET values: SUVbw once the loader has scaled them, else the stored unit. */
  unit: string
}

const INITIAL_OVERLAY: OverlayState = {
  index: 0,
  windowWidth: null,
  windowCenter: null,
  zoom: 1,
  size: '',
  markers: null,
  unit: '',
}

export function Viewport({
  viewportId,
  displaySet,
  active,
  onActivate,
  onToggleMaximize,
  onIndexChange,
}: ViewportProps) {
  const { t } = useTranslation()
  const contextMenu = useContextMenuTrigger()
  const { study, series } = displaySet
  const elementRef = useRef<HTMLDivElement | null>(null)
  const [element, setElement] = useState<HTMLDivElement | null>(null)
  const display = useSettings((s) => s.display)
  const filter = useViewportDisplay((s) => s.filters[viewportId])
  const unlinked = useViewer((s) => s.unlinkedCells.includes(cellOfViewport(viewportId)))
  const reading = usePixelValue(viewportId, element, display.pixelValue && display.overlayText)
  const onIndexChangeRef = useRef(onIndexChange)
  const seriesRef = useRef(series)
  const [overlay, setOverlay] = useState<OverlayState>(INITIAL_OVERLAY)
  const [loadedSeries, setLoadedSeries] = useState<DisplaySet['series'] | null>(null)
  const loading = loadedSeries !== series
  const count = series.images.length
  useCinePlayback(viewportId, elementRef, series)

  useEffect(() => {
    onIndexChangeRef.current = onIndexChange
    seriesRef.current = series
  }, [onIndexChange, series])

  useEffect(() => {
    const element = elementRef.current!
    mountViewport(viewportId, element)

    let shownIndex = -1
    // Window changes on the same image are the user's, and other windows follow them.
    let lastVoi: { imageId: string; lower: number; upper: number } | null = null
    const update = () => {
      const viewport = getViewport(viewportId)
      if (!viewport) return
      const voi = viewport.getProperties().voiRange
      const imageId = viewport.getCurrentImageId()
      if (voi && imageId) {
        const changed = lastVoi?.imageId === imageId && (lastVoi.lower !== voi.lower || lastVoi.upper !== voi.upper)
        lastVoi = { imageId, lower: voi.lower, upper: voi.upper }
        if (changed && useViewer.getState().activeCell === cellOfViewport(viewportId)) broadcastVoi(voi.lower, voi.upper)
      }
      const image = viewport.getCornerstoneImage()
      const index = viewport.getCurrentImageIdIndex()
      if (index !== shownIndex) {
        shownIndex = index
        syncFromViewport(viewportId)
      }
      viewportChanged()
      rememberIndex(viewportId, seriesRef.current.id, index)
      onIndexChangeRef.current(index)
      setOverlay({
        index,
        windowWidth: voi ? Math.round(voi.upper - voi.lower) : null,
        windowCenter: voi ? Math.round((voi.upper + voi.lower) / 2) : null,
        zoom: viewport.getZoom(),
        size: image ? `${image.columns} × ${image.rows}` : '',
        markers: seriesRef.current.hasOrientation ? getOrientationMarkers(viewport) : null,
        unit: petUnit(image),
      })
    }
    const events = [Enums.Events.STACK_NEW_IMAGE, Enums.Events.VOI_MODIFIED, Enums.Events.CAMERA_MODIFIED]
    for (const event of events) element.addEventListener(event, update)

    const resizeObserver = new ResizeObserver(() => resizeViewports())
    resizeObserver.observe(element)

    return () => {
      resizeObserver.disconnect()
      for (const event of events) element.removeEventListener(event, update)
      saveViewState(viewportId, seriesRef.current.id, seriesRef.current.images[0]?.imageId)
      unmountViewport(viewportId)
    }
  }, [viewportId])

  useEffect(() => {
    let cancelled = false
    showStack(
      viewportId,
      series.id,
      series.images.map((image) => image.imageId),
    )
      .then(() => {
        if (cancelled) return
        applyModalityDefaults(viewportId, series.modality)
        restoreViewState(viewportId, series.id)
      })
      .catch((error: unknown) => {
        if (!cancelled) notify(t('messages.displayFailed', { error: describeError(error) }), 'error')
      })
      .finally(() => {
        if (!cancelled) setLoadedSeries(series)
      })
    return () => {
      cancelled = true
      saveViewState(viewportId, series.id, series.images[0]?.imageId)
    }
  }, [viewportId, series, t])

  // Image filters are CSS filters on the Cornerstone canvas (annotations stay sharp).
  useEffect(() => {
    const canvas = element?.querySelector('canvas')
    if (canvas) canvas.style.filter = filter ? `url(#${filterElementId(filter)})` : ''
  }, [element, filter])

  const { markers } = overlay
  const unit = series.modality === 'CT' ? 'HU' : series.modality === 'PT' ? overlay.unit : ''

  return (
    <div
      className={`@container relative h-full w-full overflow-hidden bg-black outline-1 -outline-offset-1 ${
        active ? 'z-10 outline-2 outline-sky-500' : 'outline-slate-800'
      }`}
      data-viewport-id={viewportId}
      onPointerDownCapture={(event) => {
        onActivate()
        contextMenu.onPointerDownCapture(event)
      }}
      onPointerUpCapture={contextMenu.onPointerUpCapture}
      onWheelCapture={active ? undefined : onActivate}
      onDoubleClick={() => {
        // These tools finish drawing (or edit text) with a double-click.
        if (!DOUBLE_CLICK_TOOLS.includes(useViewer.getState().activeTool)) onToggleMaximize()
      }}
      onContextMenu={contextMenu.onContextMenu}
    >
      <div
        ref={(node) => {
          elementRef.current = node
          setElement(node)
        }}
        className="absolute inset-0"
      />
      {!loading && <FusionLayer viewportId={viewportId} />}
      {display.dicomOverlays && <DicomOverlayLayer viewportId={viewportId} element={element} />}
      {!loading && <ComparisonLayer viewportId={viewportId} />}
      {unlinked && (
        <div className="pointer-events-none absolute left-1/2 top-7 -translate-x-1/2 rounded bg-slate-900/70 px-1.5 text-[10px] font-semibold text-amber-300">
          {t('sync.unlinked')}
        </div>
      )}

      {display.overlayText && (
      <div data-testid="overlay-text" className="pointer-events-none absolute inset-0 font-mono text-[11px] leading-[1.4] text-slate-100 [text-shadow:0_1px_2px_#000] sm:text-xs">
        {/* Small cells (e.g. 2×2 on a phone) show only the essentials. */}
        <div className="absolute left-2 top-2 max-w-[40%]">
          {display.cornerPatient &&
            (display.privacy ? (
              <div className="font-semibold text-slate-400">{t('viewport.hiddenPatient')}</div>
            ) : (
              <>
                <div className="truncate font-semibold">{study.patientName || t('viewport.anonymous')}</div>
                {study.patientId && <div className="truncate @max-xs:hidden">{study.patientId}</div>}
              </>
            ))}
          {display.cornerImageSize && overlay.size && <div className="@max-xs:hidden">{overlay.size}</div>}
        </div>
        <div className="absolute right-5 top-2 max-w-[40%] text-right @max-xs:hidden">
          {display.cornerStudy && (
            <>
              <div className="truncate">{study.studyDate}</div>
              <div>
                {series.modality} · #{series.seriesNumber}
              </div>
              {series.description && <div className="truncate">{series.description}</div>}
            </>
          )}
          {series.suvError && (
            <div className="text-amber-300" title={series.suvError}>
              {t('viewport.suvUnavailable')}
            </div>
          )}
        </div>
        {/* Narrow enough to stay clear of the cine controls in the middle; long values wrap. */}
        <div className="absolute bottom-2 left-2 max-w-[calc(50%-6rem)] break-words">
          {display.cornerZoom && <div>{t('viewport.zoom', { zoom: overlay.zoom.toFixed(2) })}</div>}
          {display.cornerWindow && overlay.windowWidth !== null && (
            <div>{t('viewport.window', { width: overlay.windowWidth, center: overlay.windowCenter })}</div>
          )}
          {reading && (
            <div data-testid="pixel-value" className="@max-xs:hidden">
              {formatPixelValue(reading, unit)}
            </div>
          )}
          {filter && <div className="text-sky-300 @max-xs:hidden">{t(`filters.${filter.type}`)}</div>}
        </div>
        {display.cornerSlice && (
          <div className="absolute bottom-2 right-5 text-right">
            {overlay.index + 1} / {count}
          </div>
        )}

        {display.orientationMarkers && markers && (
          <div className="text-sm font-semibold text-amber-200/90">
            <span className="absolute left-1/2 top-2 -translate-x-1/2">{markers.top}</span>
            <span className={`absolute left-1/2 -translate-x-1/2 ${count > 1 ? 'bottom-11 @max-xs:bottom-16' : 'bottom-2 @max-xs:bottom-10'}`}>
              {markers.bottom}
            </span>
            <span className="absolute left-2 top-1/2 -translate-y-1/2">{markers.left}</span>
            <span className="absolute right-5 top-1/2 -translate-y-1/2">{markers.right}</span>
          </div>
        )}
      </div>
      )}

      {count > 1 && <CineControls viewportId={viewportId} series={series} />}

      {count > 1 && (
        <ImageScrollbar count={count} index={overlay.index} onChange={(index) => void setImageIndex(viewportId, index)} />
      )}

      {loading && (
        <div className="absolute inset-0 grid place-items-center bg-black/40 text-sm text-slate-200">
          {t('viewport.loadingImages')}
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

/** SUVbw when the loader scaled a PET image to SUV, else Bq/ml (the usual stored unit). */
function petUnit(image: unknown) {
  const preScale = (image as { preScale?: { scaled?: boolean; scalingParameters?: { suvbw?: number } } } | undefined)?.preScale
  return preScale?.scaled && preScale.scalingParameters?.suvbw ? 'SUVbw' : 'Bq/ml'
}
