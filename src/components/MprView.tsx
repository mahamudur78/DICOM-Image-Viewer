import { Enums, utilities } from '@cornerstonejs/core'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  MPR_VIEWPORTS,
  getMprViewport,
  mountMprViewport,
  showVolume,
  unmountMprViewport,
} from '../cornerstone/mpr'
import { getOrientationMarkers, type OrientationMarkers } from '../cornerstone/orientation'
import { resizeViewports } from '../cornerstone/viewer'
import { MPR_VR_VIEWPORT_ID } from '../cornerstone/constants'
import { crosshairCenter } from '../cornerstone/mpr'
import { useCursor3D } from '../comparison/cursor3d'
import type { DisplaySet } from '../dicom/types'
import { setMprViewportId, useViewer } from '../store/viewerStore'
import { useContextMenuTrigger } from './contextMenuTrigger'
import { useVolume } from './useVolume'
import { VolumeProgress } from './VolumeProgress'
import { CprOverlay } from './CprOverlay'
import { FusionLayer, ObjectLayers } from './FusionLayer'
import { FUSED_ROW, PET_ROW, usePlaneSync } from '../functional/petctViews'
import { PetCtViewport, RotatingMip } from './PetCtRows'
import { VrViewport } from './VrViewport'

/**
 * Axial, sagittal and coronal reconstructions of one series, optionally with
 * a 3D cell (2×2), or the PET/CT layout.
 */
export function MprView() {
  const displaySet = useViewer((s) => s.volumeView!.displaySet)
  const pet = useViewer((s) => s.volumeView!.petct)
  const { series } = displaySet
  const { volumeId, progress } = useVolume(series)
  if (pet) return <PetCtView volumeId={volumeId} progress={progress} pet={pet} />
  return <MprGrid volumeId={volumeId} progress={progress} />
}

/** CT row (crosshairs), PET row, fusion row in three planes, and a rotating MIP. */
function PetCtView({ volumeId, progress, pet }: { volumeId: string | null; progress: number; pet: DisplaySet }) {
  const displaySet = useViewer((s) => s.volumeView!.displaySet)
  const activeViewportId = useViewer((s) => s.mprViewportId)
  const { series } = displaySet
  const petVolume = useVolume(pet.series)
  usePlaneSync()

  useEffect(() => {
    if (!volumeId) return
    void showVolume(volumeId, series.images[Math.floor(series.images.length / 2)].imageId)
  }, [volumeId, series])

  return (
    <div data-testid="petct-layout" className="relative grid h-full w-full grid-cols-[1fr_1fr_1fr_0.8fr] grid-rows-3 gap-px bg-slate-800">
      {MPR_VIEWPORTS.map(({ id, label, orientation }, i) => (
        <MprViewport
          key={id}
          viewportId={id}
          label={label}
          orientation={orientation}
          displaySet={displaySet}
          active={id === activeViewportId}
          onActivate={() => setMprViewportId(id)}
          fusion={false}
          gridArea={{ gridRow: 1, gridColumn: i + 1 }}
        />
      ))}
      <div style={{ gridRow: '1 / span 3', gridColumn: 4 }} className="grid">
        <RotatingMip volumeId={petVolume.volumeId} />
      </div>
      {PET_ROW.map((v, i) => (
        <div key={v.id} style={{ gridRow: 2, gridColumn: i + 1 }} className="grid min-h-0">
          <PetCtViewport viewportId={v.id} label={v.label} orientation={v.orientation} volumeId={petVolume.volumeId} kind="pet" />
        </div>
      ))}
      {FUSED_ROW.map((v, i) => (
        <div key={v.id} style={{ gridRow: 3, gridColumn: i + 1 }} className="grid min-h-0">
          <PetCtViewport viewportId={v.id} label={v.label} orientation={v.orientation} volumeId={volumeId} kind="fused" />
        </div>
      ))}
      <VolumeProgress volumeId={volumeId} progress={Math.min(progress, petVolume.progress)} />
    </div>
  )
}

function MprGrid({ volumeId, progress }: { volumeId: string | null; progress: number }) {
  const displaySet = useViewer((s) => s.volumeView!.displaySet)
  const activeViewportId = useViewer((s) => s.mprViewportId)
  const with3d = useViewer((s) => s.mprWith3d)
  const preset = useViewer((s) => s.preset)
  const { series } = displaySet

  useEffect(() => {
    if (!volumeId) return
    void showVolume(volumeId, series.images[Math.floor(series.images.length / 2)].imageId)
  }, [volumeId, series])

  return (
    <div
      className={`relative grid h-full w-full gap-px bg-slate-800 ${
        with3d ? 'grid-cols-2 grid-rows-2' : 'grid-rows-3 lg:grid-cols-3 lg:grid-rows-1'
      }`}
    >
      {MPR_VIEWPORTS.map(({ id, label, orientation }) => (
        <MprViewport
          key={id}
          viewportId={id}
          label={label}
          orientation={orientation}
          displaySet={displaySet}
          active={id === activeViewportId}
          onActivate={() => setMprViewportId(id)}
        />
      ))}
      {with3d && (
        <VrViewport
          viewportId={MPR_VR_VIEWPORT_ID}
          volumeId={volumeId}
          preset={preset}
          displaySet={displaySet}
          active={activeViewportId === MPR_VR_VIEWPORT_ID}
          onActivate={() => setMprViewportId(MPR_VR_VIEWPORT_ID)}
        />
      )}
      <VolumeProgress volumeId={volumeId} progress={progress} />
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
  /** Whether the MPR fusion is drawn on this view (not on the PET/CT layout's CT row). */
  fusion?: boolean
  gridArea?: React.CSSProperties
}

interface MprOverlay {
  slice: string
  windowWidth: number | null
  windowCenter: number | null
  slab: number
  markers: OrientationMarkers | null
}

function MprViewport({ viewportId, label, orientation, displaySet, active, onActivate, fusion = true, gridArea }: MprViewportProps) {
  const { t } = useTranslation()
  const contextMenu = useContextMenuTrigger()
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
      // "MPR + 3D": the 3D view marks where the three planes cross.
      if (useViewer.getState().mprWith3d) {
        const center = crosshairCenter()
        if (center) useCursor3D.setState({ mprCenter: center })
      }
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
      style={gridArea}
      data-viewport-id={viewportId}
      onPointerDownCapture={(event) => {
        onActivate()
        contextMenu.onPointerDownCapture(event)
      }}
      onPointerUpCapture={contextMenu.onPointerUpCapture}
      onWheelCapture={active ? undefined : onActivate}
      onContextMenu={contextMenu.onContextMenu}
    >
      <div ref={elementRef} className="absolute inset-0" />
      <FusionLayer viewportId={viewportId} fusionKey={fusion ? undefined : null} />
      <ObjectLayers viewportId={viewportId} seriesId={displaySet.series.id} />
      <CprOverlay viewportId={viewportId} />
      <div className="pointer-events-none absolute inset-0 font-mono text-[11px] leading-[1.4] text-slate-100 [text-shadow:0_1px_2px_#000] sm:text-xs">
        <div className="absolute left-2 top-2 max-w-[40%]">
          <div className="font-semibold text-sky-300">{t(label)}</div>
          <div className="truncate @max-xs:hidden">{displaySet.study.patientName || t('viewport.anonymous')}</div>
        </div>
        <div className="absolute right-2 top-2 max-w-[40%] text-right @max-xs:hidden">
          <div className="truncate">{displaySet.series.description || t('viewport.seriesNumber', { number: displaySet.series.seriesNumber })}</div>
          {overlay.slab > 1 && <div className="text-amber-300">{t('viewport.slab', { mm: overlay.slab.toFixed(0) })}</div>}
        </div>
        <div className="absolute bottom-2 left-2">
          {overlay.windowWidth !== null && (
            <div>{t('viewport.window', { width: overlay.windowWidth, center: overlay.windowCenter })}</div>
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
