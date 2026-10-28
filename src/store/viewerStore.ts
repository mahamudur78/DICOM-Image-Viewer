import { create } from 'zustand'
import { defaultLayoutFor, type Layout } from '../components/layouts'
import {
  MAX_VIEWPORTS,
  MPR_AXIAL_ID,
  MPR_VR_VIEWPORT_ID,
  VR_VIEWPORT_ID,
  defaultPresetFor,
  viewportIdAt,
} from '../cornerstone/constants'
import type { SlabMode } from '../cornerstone/mpr'
import type { PrimaryTool, ViewMode } from '../cornerstone/tools'
import { sortImages } from '../dicom/parse'
import type { DisplaySet, Series, SortMode, Study } from '../dicom/types'

/** MPR or 3D view of one series, replacing the stack grid while open. */
export interface VolumeView {
  mode: Exclude<ViewMode, 'grid'>
  displaySet: DisplaySet
}

export interface Slab {
  mode: SlabMode
  thickness: number
}

/** Side panels; later phases add measurements, segmentation, reports, … */
export type PanelId = 'tags'

/**
 * Session state of the viewer: what is loaded and how it is laid out.
 * Only ids and plain data live here; Cornerstone objects stay in src/cornerstone.
 * Preferences that survive a reload are in the settings store.
 */
export interface ViewerState {
  ready: boolean
  studies: Study[]
  /** Display set per grid cell (always MAX_VIEWPORTS long). */
  cells: (DisplaySet | null)[]
  /** Image index shown per grid cell. */
  cellIndexes: number[]
  layout: Layout
  activeCell: number
  maximizedCell: number | null
  /** Progress while reading files, or null. */
  loading: { done: number; total: number } | null
  activeTool: PrimaryTool
  panel: PanelId | null
  volumeView: VolumeView | null
  mprViewportId: string
  mprWith3d: boolean
  slab: Slab
  /** 3D rendering preset. */
  preset: string
  /** Header, toolbar and series list hidden: only the images. */
  distractionFree: boolean
}

const EMPTY_CELLS: (DisplaySet | null)[] = Array(MAX_VIEWPORTS).fill(null)

export const INITIAL_VIEWER_STATE: ViewerState = {
  ready: false,
  studies: [],
  cells: EMPTY_CELLS,
  cellIndexes: Array(MAX_VIEWPORTS).fill(0),
  layout: defaultLayoutFor(1),
  activeCell: 0,
  maximizedCell: null,
  loading: null,
  activeTool: 'windowLevel',
  panel: null,
  volumeView: null,
  mprViewportId: MPR_AXIAL_ID,
  mprWith3d: false,
  slab: { mode: 'mip', thickness: 0 },
  preset: defaultPresetFor('CT'),
  distractionFree: false,
}

export const useViewer = create<ViewerState>()(() => INITIAL_VIEWER_STATE)

// --- selectors ---------------------------------------------------------------

export const selectMode = (state: ViewerState): ViewMode => state.volumeView?.mode ?? 'grid'

export const selectActiveDisplaySet = (state: ViewerState) => state.cells[state.activeCell]

/** Viewport that toolbar actions and keyboard shortcuts apply to. */
export function selectTargetViewportId(state: ViewerState): string | null {
  const mode = selectMode(state)
  if (mode === '3d') return VR_VIEWPORT_ID
  if (mode === 'mpr') return state.mprViewportId
  return state.cells[state.activeCell] ? viewportIdAt(state.activeCell) : null
}

/** Series the toolbar describes: the volume view's, or the active cell's. */
export const selectCurrentDisplaySet = (state: ViewerState) =>
  state.volumeView?.displaySet ?? state.cells[state.activeCell]

// --- plain state changes (Cornerstone side effects live in viewerActions.ts) ---

const set = useViewer.setState

/** Clears the loaded study before new files are read. */
export function beginLoading(total: number) {
  set({ cells: EMPTY_CELLS, volumeView: null, studies: [], loading: { done: 0, total } })
}

export const setLoadingProgress = (done: number, total: number) => set({ loading: { done, total } })

export function showStudies(studies: Study[], displaySets: DisplaySet[]) {
  set({
    loading: null,
    studies,
    cells: EMPTY_CELLS.map((_, cell) => displaySets[cell] ?? null),
    layout: defaultLayoutFor(displaySets.length),
    activeCell: 0,
    maximizedCell: null,
  })
}

export function showInCell(cell: number, displaySet: DisplaySet) {
  set((state) => ({ cells: state.cells.map((existing, i) => (i === cell ? displaySet : existing)), activeCell: cell }))
}

export function showSeriesInCell(cell: number, seriesId: string) {
  for (const study of useViewer.getState().studies) {
    const series = study.series.find((s) => s.id === seriesId)
    if (series) return showInCell(cell, { study, series })
  }
}

export function setLayout(layout: Layout) {
  set((state) => ({
    layout,
    maximizedCell: null,
    activeCell: state.activeCell >= layout.rows * layout.cols ? 0 : state.activeCell,
  }))
}

export const setActiveCell = (activeCell: number) => set({ activeCell })

export const toggleMaximize = (cell: number) =>
  set((state) => ({ maximizedCell: state.maximizedCell === cell ? null : cell }))

export function setCellIndex(cell: number, index: number) {
  set((state) =>
    state.cellIndexes[cell] === index ? state : { cellIndexes: state.cellIndexes.map((v, i) => (i === cell ? index : v)) },
  )
}

export const setActiveTool = (activeTool: PrimaryTool) => set({ activeTool })

export const togglePanel = (panel: PanelId) => set((state) => ({ panel: state.panel === panel ? null : panel }))
export const closePanel = () => set({ panel: null })

export const setMprViewportId = (mprViewportId: string) => set({ mprViewportId })

export function toggleMprWith3d() {
  set((state) => ({
    mprWith3d: !state.mprWith3d,
    mprViewportId: state.mprViewportId === MPR_VR_VIEWPORT_ID ? MPR_AXIAL_ID : state.mprViewportId,
  }))
}

export const setSlab = (slab: Slab) => set({ slab })
export const setPreset = (preset: string) => set({ preset })

/** Shows a series as MPR or 3D (checks are done by the caller). */
export function showVolumeView(view: VolumeView, defaultTool: PrimaryTool) {
  set((state) => {
    const newSeries = view.displaySet.series !== state.volumeView?.displaySet.series
    return {
      volumeView: view,
      activeTool: view.mode !== selectMode(state) ? defaultTool : state.activeTool,
      ...(newSeries && {
        slab: { ...state.slab, thickness: 0 },
        preset: defaultPresetFor(view.displaySet.series.modality),
      }),
    }
  })
}

export const closeVolumeView = (gridTool: PrimaryTool) => set({ volumeView: null, activeTool: gridTool })


/** File of the image the tag panel describes: the shown image, or the volume's middle slice. */
export function selectCurrentFile(state: ViewerState): File | null {
  const { volumeView, cells, cellIndexes, activeCell } = state
  if (volumeView) {
    const images = volumeView.displaySet.series.images
    return images[Math.floor(images.length / 2)]?.file ?? null
  }
  const images = cells[activeCell]?.series.images
  return images?.[cellIndexes[activeCell]]?.file ?? images?.[0]?.file ?? null
}

/**
 * Re-sorts a series' images. The series object is replaced everywhere it is
 * referenced (study list, grid cells, MPR/3D view) so every view updates.
 */
export function setSeriesSort(seriesId: string, mode: SortMode) {
  set((state) => {
    const replacements = new Map<Series, Series>()
    const studies = state.studies.map((study) => {
      const series = study.series.map((s) => {
        if (s.id !== seriesId || s.sortMode === mode) return s
        const sorted = { ...s, sortMode: mode, images: sortImages(s.images, mode) }
        replacements.set(s, sorted)
        return sorted
      })
      return series.some((s, i) => s !== study.series[i]) ? { ...study, series } : study
    })
    if (replacements.size === 0) return state
    const studyOf = new Map(studies.flatMap((study) => study.series.map((s) => [s, study] as const)))
    const swap = (displaySet: DisplaySet | null) => {
      const series = displaySet && replacements.get(displaySet.series)
      return series ? { study: studyOf.get(series)!, series } : displaySet
    }
    return {
      studies,
      cells: state.cells.map(swap),
      volumeView: state.volumeView && { ...state.volumeView, displaySet: swap(state.volumeView.displaySet)! },
    }
  })
}

export const setDistractionFree = (distractionFree: boolean) => set({ distractionFree })
