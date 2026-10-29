// Linking viewports. Window/level and zoom/pan use Cornerstone synchronizers;
// slices and cine frames use our own sync below, which also works across
// frames of reference once "locked" (comparing with a prior study).
import { Enums, getRenderingEngine, metaData, type Types } from '@cornerstonejs/core'
import { SynchronizerManager, synchronizers, type Synchronizer } from '@cornerstonejs/tools'
import { broadcastSlice } from '../comparison/multiWindow'
import { dot, isParallel, nearestSlice, normalOf, type Vec3 } from '../comparison/planes'
import type { Series } from '../dicom/types'
import { useSettings } from '../store/settingsStore'
import { cellOfViewport, isCellLinked, useViewer } from '../store/viewerStore'
import { viewportIdAt } from './constants'
import { getViewport, setImageIndex } from './viewer'

const VOI_SYNC_ID = 'voi-sync'
const ZOOM_PAN_SYNC_ID = 'zoom-pan-sync'

/** VOI sync copies window/level and invert; zoom/pan sync the relative zoom and pan. */
export function createSynchronizers() {
  SynchronizerManager.destroySynchronizer(VOI_SYNC_ID)
  SynchronizerManager.destroySynchronizer(ZOOM_PAN_SYNC_ID)
  synchronizers.createVOISynchronizer(VOI_SYNC_ID, { syncInvertState: true, syncColormap: false }).setEnabled(false)
  // Cornerstone's presentation synchronizer (5.13) passes its options as the
  // selector and so copies nothing; this one copies relative zoom and pan.
  SynchronizerManager.createSynchronizer(ZOOM_PAN_SYNC_ID, Enums.Events.CAMERA_MODIFIED, (_sync, source, target) => {
    const engine = getRenderingEngine(target.renderingEngineId)
    const from = engine?.getViewport(source.viewportId) as Types.IStackViewport | undefined
    const to = engine?.getViewport(target.viewportId) as Types.IStackViewport | undefined
    if (!from || !to) return
    to.setViewPresentation(from.getViewPresentation({ zoom: true, pan: true }))
    to.render()
  }).setEnabled(false)
}

function all(): Synchronizer[] {
  return [VOI_SYNC_ID, ZOOM_PAN_SYNC_ID]
    .map((id) => SynchronizerManager.getSynchronizer(id))
    .filter((s): s is Synchronizer => !!s)
}

/**
 * Only the active viewport drives the others, and only linked cells take part.
 * If every viewport were a source, a coarser series (e.g. 5 mm vs 2.5 mm)
 * would snap to its nearest slice and sync that position back.
 */
export function setSyncSource(renderingEngineId: string, viewportIds: string[], sourceViewportId: string | null) {
  const state = useViewer.getState()
  const linked = (viewportId: string) => isCellLinked(state, cellOfViewport(viewportId))
  for (const synchronizer of all()) {
    for (const viewportId of viewportIds) synchronizer.remove({ renderingEngineId, viewportId })
    if (!sourceViewportId || !linked(sourceViewportId)) continue
    for (const viewportId of viewportIds.filter(linked)) {
      if (viewportId === sourceViewportId) synchronizer.addSource({ renderingEngineId, viewportId })
      else synchronizer.addTarget({ renderingEngineId, viewportId })
    }
  }
}

export function setVoiSync(enabled: boolean) {
  SynchronizerManager.getSynchronizer(VOI_SYNC_ID)?.setEnabled(enabled)
}

export function setZoomPanSync(enabled: boolean) {
  SynchronizerManager.getSynchronizer(ZOOM_PAN_SYNC_ID)?.setEnabled(enabled)
}

// --- slice and cine sync ------------------------------------------------------------

interface Plane {
  position: number[]
  normal: number[]
  frameOfReferenceUID?: string
}

function planeOf(imageId: string | undefined): Plane | null {
  if (!imageId) return null
  const module = metaData.get('imagePlaneModule', imageId) as
    | { imagePositionPatient?: number[]; rowCosines?: number[]; columnCosines?: number[]; frameOfReferenceUID?: string; usingDefaultValues?: boolean }
    | undefined
  if (!module?.imagePositionPatient || !module.rowCosines || !module.columnCosines) return null
  // Images drawn on a default plane have no real position.
  if (module.frameOfReferenceUID === undefined && module.imagePositionPatient.every((v) => v === 0)) return null
  return { position: module.imagePositionPatient, normal: normalOf({ row: module.rowCosines, column: module.columnCosines }), frameOfReferenceUID: module.frameOfReferenceUID }
}

/** Positions of a series' images, computed once per series. */
const positionCache = new WeakMap<Series, (number[] | null)[]>()
function positionsOf(series: Series) {
  let positions = positionCache.get(series)
  if (!positions) {
    positions = series.images.map((image) => planeOf(image.imageId)?.position ?? null)
    positionCache.set(series, positions)
  }
  return positions
}

/** While locked: a common normal and each series' position along it at lock time. */
let lock: { normal: number[]; shifts: Map<string, number> } | null = null

interface LinkedCell {
  viewportId: string
  series: Series
}

/** Visible, linked grid cells showing an image stack, other than the source. */
function linkedTargets(sourceViewportId: string): LinkedCell[] {
  const state = useViewer.getState()
  const { layout, maximizedCell, cells } = state
  if (maximizedCell !== null) return []
  const out: LinkedCell[] = []
  for (let cell = 0; cell < layout.rows * layout.cols; cell++) {
    const viewportId = viewportIdAt(cell)
    const series = cells[cell]?.series
    // Only viewports already showing their stack (a fresh one reports index 0).
    if (viewportId === sourceViewportId || !series || series.kind !== 'image' || !isCellLinked(state, cell) || !getViewport(viewportId)?.getCurrentImageId?.()) continue
    out.push({ viewportId, series })
  }
  return out
}

function sourceCell(viewportId: string) {
  const state = useViewer.getState()
  const cell = cellOfViewport(viewportId)
  if (cell < 0 || cell !== state.activeCell || !isCellLinked(state, cell)) return null
  const series = state.cells[cell]?.series
  return series?.kind === 'image' ? series : null
}

/**
 * The active viewport showed a new image: linked viewports follow. Slices
 * match by position along the normal (the same frame of reference, or any
 * once locked); other stacks follow by frame fraction when cine sync is on.
 */
export function syncFromViewport(viewportId: string) {
  const { sliceSync, cineSync } = useSettings.getState().links
  if (!sliceSync && !cineSync) return
  const series = sourceCell(viewportId)
  const viewport = getViewport(viewportId)
  if (!series || !viewport) return
  const index = viewport.getCurrentImageIdIndex()
  const source = planeOf(series.images[index]?.imageId)
  if (sliceSync && source) broadcastSlice(source.frameOfReferenceUID, source.position, source.normal)

  for (const target of linkedTargets(viewportId)) {
    const byPosition = sliceSync && source ? positionIndex(source, series, target.series) : null
    const targetIndex = byPosition ?? (cineSync ? fractionIndex(index, series, target.series) : null)
    const current = getViewport(target.viewportId)?.getCurrentImageIdIndex()
    if (targetIndex !== null && targetIndex >= 0 && targetIndex !== current) void setImageIndex(target.viewportId, targetIndex)
  }
}

function positionIndex(source: Plane, sourceSeries: Series, targetSeries: Series): number | null {
  const first = positionsOf(targetSeries).findIndex(Boolean)
  const targetPlane = first >= 0 ? planeOf(targetSeries.images[first].imageId) : null
  if (!targetPlane || targetSeries.images.length < 2) return null
  if (lock) {
    const shiftSource = lock.shifts.get(sourceSeries.id)
    const shiftTarget = lock.shifts.get(targetSeries.id)
    if (shiftSource === undefined || shiftTarget === undefined || !isParallel(source.normal, lock.normal) || !isParallel(targetPlane.normal, lock.normal)) return null
    const distance = dot(source.position, lock.normal) - shiftSource + shiftTarget
    return nearestSlice(positionsOf(targetSeries).map((p) => p ?? [NaN, NaN, NaN]), lock.normal, distance).index
  }
  if (!source.frameOfReferenceUID || source.frameOfReferenceUID !== targetPlane.frameOfReferenceUID) return null
  if (!isParallel(source.normal, targetPlane.normal)) return null
  return nearestSlice(positionsOf(targetSeries).map((p) => p ?? [NaN, NaN, NaN]), source.normal, dot(source.position, source.normal)).index
}

function fractionIndex(index: number, source: Series, target: Series) {
  if (source.images.length < 2 || target.images.length < 2) return null
  return Math.round((index / (source.images.length - 1)) * (target.images.length - 1))
}

/**
 * Locks slice sync at the current positions: from now on linked viewports
 * keep their present offset, even across frames of reference (a prior study
 * positioned differently). Returns how many viewports joined the lock.
 */
export function lockSync(sourceViewportId: string) {
  const series = sourceCell(sourceViewportId)
  const viewport = getViewport(sourceViewportId)
  const source = series && viewport?.getCurrentImageId?.() ? planeOf(series.images[viewport.getCurrentImageIdIndex()]?.imageId) : null
  if (!series || !source) return 0
  const shifts = new Map([[series.id, dot(source.position, source.normal)]])
  for (const target of linkedTargets(sourceViewportId)) {
    const index = getViewport(target.viewportId)?.getCurrentImageIdIndex() ?? 0
    const plane = planeOf(target.series.images[index]?.imageId)
    if (plane && isParallel(plane.normal, source.normal)) shifts.set(target.series.id, dot(plane.position, source.normal))
  }
  lock = { normal: source.normal as Vec3 as number[], shifts }
  return shifts.size - 1
}

export function unlockSync() {
  lock = null
}
