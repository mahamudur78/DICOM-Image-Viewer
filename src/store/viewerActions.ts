// Viewer actions with Cornerstone side effects, and the bridge that keeps
// Cornerstone (tools, sync, reference lines, slab) in step with the stores.
import { useEffect } from 'react'
import { viewportIdAt } from '../cornerstone/constants'
import {
  estimateVolumeBytes,
  isVolumeCached,
  mprUnsupportedReason,
  setSlab as applySlab,
  supportsWebGL2,
  volumeMemoryBudget,
} from '../cornerstone/mpr'
import { setSliceSync, setVoiSync } from '../cornerstone/sync'
import { DEFAULT_TOOL, setPrimaryTool, setReferenceLines, setScaleBar, type ViewMode } from '../cornerstone/tools'
import { forgetRememberedIndexes, rememberIndex, resetView, setActiveSource } from '../cornerstone/viewer'
import { viewportKind } from '../cornerstone/viewportRegistry'
import { resetVr } from '../cornerstone/volume3d'
import { applyModalityDefaults } from '../cornerstone/display'
import { setFilter } from './viewportDisplayStore'
import { hangingOrder } from '../dicom/hangingProtocol'
import type { SourceFile } from '../dicom/collectFiles'
import { loadFiles, releaseLoadedImages } from '../dicom/loadFiles'
import { askPassword, showIssues } from '../dialogs/dialogStore'
import type { DisplaySet, Series, Study } from '../dicom/types'
import { t } from '../i18n'
import { notify } from '../notifications/toastStore'
import { clearDocumentThumbnails } from '../thumbnails/documentThumbnails'
import { clearOverlayBitmaps } from '../cornerstone/overlayPlanes'
import { useSettings } from './settingsStore'
import {
  beginLoading,
  closeVolumeView,
  selectActiveDisplaySet,
  selectCurrentDisplaySet,
  selectMode,
  selectTargetViewportId,
  setLayout,
  setLoadingProgress,
  showInCell,
  showStudies,
  showVolumeView,
  useViewer,
  type VolumeView,
} from './viewerStore'

/** Reads files locally and shows them, replacing the current study. */
export async function openFiles(files: SourceFile[]) {
  if (files.length === 0) return
  // Unmount every viewport before releasing the images they display.
  beginLoading(files.length)
  await new Promise((resolve) => setTimeout(resolve)) // let React commit the unmount
  releaseLoadedImages()
  clearDocumentThumbnails()
  clearOverlayBitmaps()
  forgetRememberedIndexes()

  const result = await loadFiles(files, { onProgress: setLoadingProgress, askPassword })
  const displaySets = hangingOrder(result.studies)
  const details = { label: t('messages.details'), run: () => showIssues(result.issues) }
  if (displaySets.length === 0) {
    useViewer.setState({ loading: null })
    notify(t('messages.noImages'), 'error', result.issues.length ? details : undefined)
    return
  }
  showStudies(result.studies, displaySets)
  // Duplicates are listed in the details but are not a failure on their own.
  const failed = result.issues.filter((issue) => issue.reason !== 'duplicate').length
  if (failed > 0) notify(t('messages.skippedFiles', { count: failed }), 'warning', details)
}

/**
 * Opens MPR or 3D for a series after checking it can become a volume, the
 * browser supports WebGL2, and the user accepts a large memory footprint.
 */
export function openVolumeView(mode: VolumeView['mode'], displaySet: DisplaySet | null | undefined) {
  const name = mode === 'mpr' ? 'MPR' : '3D'
  if (!displaySet) return notify(t('messages.selectSeries'))
  if (!supportsWebGL2()) return notify(t('messages.needsWebgl2', { name }), 'error')
  const reason = mprUnsupportedReason(displaySet.series)
  if (reason) return notify(t('messages.volumeUnavailable', { name, reason: t(reason) }))

  const bytes = estimateVolumeBytes(displaySet.series)
  if (!isVolumeCached(displaySet.series) && bytes > volumeMemoryBudget()) {
    const mb = Math.round(bytes / 1024 / 1024)
    const proceed = window.confirm(t('messages.volumeMemory', { mb, name }))
    if (!proceed) return
  }
  showVolumeView({ mode, displaySet }, DEFAULT_TOOL[mode])
}

/** Toolbar MPR/3D buttons: opening a mode, or closing it when it is already open. */
export function changeMode(mode: ViewMode) {
  const state = useViewer.getState()
  if (mode === selectMode(state) || mode === 'grid') return closeVolumeView(DEFAULT_TOOL.grid)
  openVolumeView(mode, state.volumeView?.displaySet ?? selectActiveDisplaySet(state))
}

/** Sidebar click: shows the series in the active cell, or in the open MPR/3D view. */
export function selectSeries(study: Study, series: Series) {
  const { volumeView, activeCell } = useViewer.getState()
  if (volumeView) openVolumeView(volumeView.mode, { study, series })
  else showInCell(activeCell, { study, series })
}

/**
 * Resets the target viewport: camera and preset for 3D; for 2D the camera,
 * window, colormap and image filter, then the modality's defaults (PET).
 */
export function resetTargetViewport() {
  const state = useViewer.getState()
  const viewportId = selectTargetViewportId(state)
  if (!viewportId) return
  if (viewportKind(viewportId) === 'volume3d') return resetVr(viewportId, state.preset)
  resetView(viewportId)
  setFilter(viewportId, null)
  const modality = selectCurrentDisplaySet(state)?.series.modality
  if (modality) applyModalityDefaults(viewportId, modality)
}

/** Applies store changes to Cornerstone. Mount once, in App. */
export function useCornerstoneBridge() {
  const ready = useViewer((s) => s.ready)
  const mode = useViewer(selectMode)
  const activeTool = useViewer((s) => s.activeTool)
  const slab = useViewer((s) => s.slab)
  const cells = useViewer((s) => s.cells)
  const layout = useViewer((s) => s.layout)
  const maximizedCell = useViewer((s) => s.maximizedCell)
  const activeViewportId = useViewer((s) => (s.cells[s.activeCell] ? viewportIdAt(s.activeCell) : null))
  const links = useSettings((s) => s.links)
  const scaleBar = useSettings((s) => s.display.scaleBar)

  useEffect(() => {
    if (ready) setPrimaryTool(activeTool, mode)
  }, [ready, activeTool, mode])

  // The active viewport drives reference lines and sync. Re-run whenever
  // viewports may have (re)mounted: new series, layout or maximize changes.
  useEffect(() => {
    if (!ready) return
    const source = mode === 'grid' ? (setActiveSource(activeViewportId) ?? null) : null
    setReferenceLines(links.referenceLines ? source : null)
  }, [ready, mode, links.referenceLines, activeViewportId, cells, layout, maximizedCell])

  useEffect(() => {
    if (mode === 'mpr') applySlab(slab.mode, slab.thickness)
  }, [mode, slab])

  // Viewports that mount later join the tool group with the tool already enabled.
  useEffect(() => {
    if (ready) setScaleBar(scaleBar)
  }, [ready, scaleBar])

  useEffect(() => {
    if (!ready) return
    setSliceSync(links.sliceSync)
    setVoiSync(links.voiSync)
  }, [ready, links.sliceSync, links.voiSync])
}

/**
 * Shows the image a report or key object refers to, next to the cell that
 * refers to it (switching to a 1×2 layout when only one cell is visible).
 */
export function showReferencedImage(fromCell: number, sopInstanceUID: string, frame?: number) {
  const { studies, layout, maximizedCell } = useViewer.getState()
  for (const study of studies) {
    for (const series of study.series) {
      const index = series.images.findIndex(
        (image) => image.sopInstanceUID === sopInstanceUID && (!frame || image.frame === frame || image.frame === 0),
      )
      if (index < 0 || series.kind !== 'image') continue
      const singleCell = layout.rows * layout.cols === 1 || maximizedCell !== null
      if (singleCell) setLayout({ rows: 1, cols: 2 })
      const target = fromCell === 0 ? 1 : 0
      rememberIndex(viewportIdAt(target), series.id, index)
      showInCell(target, { study, series })
      return
    }
  }
  notify(t('sr.imageNotLoaded'))
}
