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
import { DEFAULT_TOOL, setPrimaryTool, setReferenceLines, type ViewMode } from '../cornerstone/tools'
import { forgetRememberedIndexes, resetView, setActiveSource } from '../cornerstone/viewer'
import { viewportKind } from '../cornerstone/viewportRegistry'
import { resetVr } from '../cornerstone/volume3d'
import { hangingOrder } from '../dicom/hangingProtocol'
import { loadFiles, releaseLoadedImages } from '../dicom/loadFiles'
import type { DisplaySet, Series, Study } from '../dicom/types'
import { t } from '../i18n'
import { notify } from '../notifications/toastStore'
import { useSettings } from './settingsStore'
import {
  beginLoading,
  closeVolumeView,
  selectActiveDisplaySet,
  selectMode,
  selectTargetViewportId,
  setLoadingProgress,
  showInCell,
  showStudies,
  showVolumeView,
  useViewer,
  type VolumeView,
} from './viewerStore'

/** Reads files locally and shows them, replacing the current study. */
export async function openFiles(files: File[]) {
  if (files.length === 0) return
  // Unmount every viewport before releasing the images they display.
  beginLoading(files.length)
  await new Promise((resolve) => setTimeout(resolve)) // let React commit the unmount
  releaseLoadedImages()
  forgetRememberedIndexes()

  const result = await loadFiles(files, setLoadingProgress)
  const displaySets = hangingOrder(result.studies)
  if (displaySets.length === 0) {
    useViewer.setState({ loading: null })
    notify(t('messages.noImages'), 'error')
    return
  }
  showStudies(result.studies, displaySets)
  if (result.skipped > 0) notify(t('messages.skippedFiles', { count: result.skipped }))
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

/** Resets the target viewport: camera and window for 2D, camera and preset for 3D. */
export function resetTargetViewport() {
  const state = useViewer.getState()
  const viewportId = selectTargetViewportId(state)
  if (!viewportId) return
  if (viewportKind(viewportId) === 'volume3d') resetVr(viewportId, state.preset)
  else resetView(viewportId)
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

  useEffect(() => {
    if (!ready) return
    setSliceSync(links.sliceSync)
    setVoiSync(links.voiSync)
  }, [ready, links.sliceSync, links.voiSync])
}
