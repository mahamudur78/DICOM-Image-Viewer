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
import { lockSync, setVoiSync, setZoomPanSync, unlockSync } from '../cornerstone/sync'
import { DEFAULT_TOOL, setPrimaryTool, setScaleBar, type ViewMode } from '../cornerstone/tools'
import { forgetRememberedIndexes, rememberIndex, resetView, setActiveSource } from '../cornerstone/viewer'
import { forgetAllViewStates, forgetViewState } from '../cornerstone/viewState'
import { viewportKind } from '../cornerstone/viewportRegistry'
import { resetVr } from '../cornerstone/volume3d'
import { applyModalityDefaults } from '../cornerstone/display'
import { setFilter } from './viewportDisplayStore'
import { BUILT_IN_RULES, applyHangingRules, hangingOrder, ruleFromGrid } from '../dicom/hangingProtocol'
import { findPriorMatch, mergeStudies } from '../comparison/priors'
import { askForm } from '../dialogs/dialogStore'
import type { SourceFile } from '../dicom/collectFiles'
import { loadFiles, releaseLoadedImages } from '../dicom/loadFiles'
import { askPassword, showIssues } from '../dialogs/dialogStore'
import { clearCursor3D } from '../comparison/cursor3d'
import type { DisplaySet, Series, Study } from '../dicom/types'
import { t } from '../i18n'
import { phaseSeries } from '../functional/series'
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
  setActiveCell,
  setStudies,
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
  forgetAllViewStates()

  const result = await loadFiles(files, { onProgress: setLoadingProgress, askPassword })
  const displaySets = hangingOrder(result.studies)
  const details = { label: t('messages.details'), run: () => showIssues(result.issues) }
  if (displaySets.length === 0) {
    useViewer.setState({ loading: null })
    notify(t('messages.noImages'), 'error', result.issues.length ? details : undefined)
    return
  }
  clearCursor3D()
  const hung = applyHangingRules(hangingRules(), result.studies)
  if (hung) {
    showStudies(result.studies, [...hung.cells, ...hung.rest], hung.layout)
    // A protocol with a prior compares like "Compare with prior": slices locked together.
    if (hung.rule.needsPrior) useViewer.setState({ syncLocked: true })
  } else showStudies(result.studies, displaySets)
  // Duplicates are listed in the details but are not a failure on their own.
  const failed = result.issues.filter((issue) => issue.reason !== 'duplicate').length
  if (failed > 0) notify(t('messages.skippedFiles', { count: failed }), 'warning', details)
}

const hangingRules = () => [...useSettings.getState().hangingRules, ...BUILT_IN_RULES]

/**
 * Adds files to the open studies (e.g. a prior study of the same patient)
 * without changing the grid. Instances already open are skipped.
 */
export async function addFiles(files: SourceFile[]) {
  const { studies } = useViewer.getState()
  if (files.length === 0) return
  if (studies.length === 0) return openFiles(files)
  const loadedInstances = new Set(studies.flatMap((study) => study.series.flatMap((series) => series.images.map((image) => image.sopInstanceUID))))
  useViewer.setState({ loading: { done: 0, total: files.length } })
  const result = await loadFiles(files, { onProgress: setLoadingProgress, askPassword, loadedInstances })
  const details = { label: t('messages.details'), run: () => showIssues(result.issues) }
  setStudies(mergeStudies(studies, result.studies))
  const added = result.studies.reduce((count, study) => count + study.series.length, 0)
  if (added === 0) notify(t('messages.nothingAdded'), 'info', result.issues.length ? details : undefined)
  else notify(t('messages.seriesAdded', { count: added }), 'success')
}

/** Puts the active series next to its counterpart in the patient's previous study, slices locked together. */
export function compareWithPrior() {
  const state = useViewer.getState()
  const current = selectActiveDisplaySet(state)
  if (!current) return notify(t('messages.selectSeries'))
  const prior = findPriorMatch(state.studies, current)
  if (!prior) return notify(t('compare.noPrior'), 'info')
  if (state.volumeView) closeVolumeView(DEFAULT_TOOL.grid)
  if (state.layout.rows * state.layout.cols < 2 || state.maximizedCell !== null) setLayout({ rows: 1, cols: 2 })
  showInCell(1, prior)
  showInCell(0, current)
  setActiveCell(0)
  useViewer.setState({ syncLocked: true, unlinkedCells: [] })
}

/** A window opened for one series shows just that series. */
export function showOnlySeries(seriesId: string) {
  for (const study of useViewer.getState().studies) {
    const series = study.series.find((s) => s.id === seriesId)
    if (!series) continue
    setLayout({ rows: 1, cols: 1 })
    showInCell(0, { study, series })
    return
  }
}

/** Lays the grid out again by the first hanging protocol that matches. */
export function reapplyHanging() {
  const { studies } = useViewer.getState()
  const hung = applyHangingRules(hangingRules(), studies)
  if (!hung) return notify(t('hanging.noMatch'), 'info')
  showStudies(studies, [...hung.cells, ...hung.rest], hung.layout)
  notify(t('hanging.applied', { name: hung.rule.name }), 'success')
}

/** Saves the current grid as a hanging protocol for studies like this one. */
export async function saveHangingRule() {
  const { studies, layout, cells, activeCell } = useViewer.getState()
  const current = cells[activeCell]?.study ?? studies[0]
  if (!current) return
  const values = await askForm('hanging.saveTitle', [{ name: 'name', label: 'hanging.name', type: 'text', value: current.description || current.series[0]?.modality || '', required: true }], 'dialogs.apply')
  if (!values?.name.trim()) return
  const rule = ruleFromGrid(values.name.trim(), layout, cells, current)
  if (!rule) return
  useSettings.getState().addHangingRule(rule)
  notify(t('hanging.saved', { name: rule.name }), 'success')
}

/**
 * Opens MPR or 3D for a series after checking it can become a volume, the
 * browser supports WebGL2, and the user accepts a large memory footprint.
 */
export function openVolumeView(mode: VolumeView['mode'], chosen: DisplaySet | null | undefined) {
  const name = mode === 'mpr' ? 'MPR' : '3D'
  if (!chosen) return notify(t('messages.selectSeries'))
  // A dynamic series (4D) opens one phase at a time; the same view keeps its phases when switching mode.
  const current = useViewer.getState().volumeView?.phases
  const phases = current?.series.includes(chosen.series) ? current : phaseSeries(chosen.series).length ? { series: phaseSeries(chosen.series), index: 0 } : undefined
  const displaySet = phases ? { study: chosen.study, series: phases.series[phases.index] } : chosen
  if (!supportsWebGL2()) return notify(t('messages.needsWebgl2', { name }), 'error')
  const reason = mprUnsupportedReason(displaySet.series)
  if (reason) return notify(t('messages.volumeUnavailable', { name, reason: t(reason) }))

  const bytes = estimateVolumeBytes(displaySet.series)
  if (!isVolumeCached(displaySet.series) && bytes > volumeMemoryBudget()) {
    const mb = Math.round(bytes / 1024 / 1024)
    const proceed = window.confirm(t('messages.volumeMemory', { mb, name }))
    if (!proceed) return
  }
  showVolumeView({ mode, displaySet, ...(phases && { phases }) }, DEFAULT_TOOL[mode])
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
  const displaySet = selectCurrentDisplaySet(state)
  if (displaySet) forgetViewState(displaySet.series.id)
  const modality = displaySet?.series.modality
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
  const unlinkedCells = useViewer((s) => s.unlinkedCells)
  const syncLocked = useViewer((s) => s.syncLocked)
  const scaleBar = useSettings((s) => s.display.scaleBar)

  useEffect(() => {
    if (ready) setPrimaryTool(activeTool, mode)
  }, [ready, activeTool, mode])

  // The active viewport drives reference lines and sync. Re-run whenever
  // viewports may have (re)mounted: new series, layout or maximize changes.
  useEffect(() => {
    if (!ready) return
    if (mode === 'grid') setActiveSource(activeViewportId)
  }, [ready, mode, activeViewportId, cells, layout, maximizedCell, unlinkedCells])

  useEffect(() => {
    if (mode === 'mpr') applySlab(slab.mode, slab.thickness)
  }, [mode, slab])

  // Viewports that mount later join the tool group with the tool already enabled.
  useEffect(() => {
    if (ready) setScaleBar(scaleBar)
  }, [ready, scaleBar])

  useEffect(() => {
    if (!ready) return
    setVoiSync(links.voiSync)
    setZoomPanSync(links.zoomPanSync)
  }, [ready, links.voiSync, links.zoomPanSync])

  // Locking records the offsets at that moment; a new study or layout ends the lock.
  useEffect(() => {
    if (!ready || !syncLocked) return
    // Viewports that were just given a series may still be loading it: try for a few seconds.
    let tries = 0
    let timer = 0
    const attempt = () => {
      if (lockSync(viewportIdAt(useViewer.getState().activeCell)) > 0) {
        // A lock is a kind of slice sync.
        if (!useSettings.getState().links.sliceSync) useSettings.getState().toggleLink('sliceSync')
        return
      }
      if (++tries < 20) timer = window.setTimeout(attempt, 300)
      else {
        useViewer.setState({ syncLocked: false })
        notify(t('sync.lockNothing'), 'info')
      }
    }
    attempt()
    return () => {
      window.clearTimeout(timer)
      unlockSync()
    }
  }, [ready, syncLocked, cells, layout])
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
