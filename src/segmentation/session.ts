// The segmentation being edited: which overlay and segment, the tool's
// settings, undo history, and what each tool does with the pointer.
import { create } from 'zustand'
import { cache, getRenderingEngine, type Types } from '@cornerstonejs/core'
import { RENDERING_ENGINE_ID } from '../cornerstone/constants'
import { confirmVolumeMemory, loadVolume, volumeIdFor } from '../cornerstone/mpr'
import type { DisplaySet, Series } from '../dicom/types'
import { objectKeysOf, overlayGrid, startObjectOverlay, updateFusion, useFusion, type FusionSetting } from '../functional/fusionStore'
import { SEGMENT_COLORS, MAX_SEGMENTS, type Segment } from '../objects/labels'
import { useViewer } from '../store/viewerStore'
import { sample, worldToIndex, type VolumeGrid } from '../volume/grid'
import {
  History,
  Recorder,
  circlePolygon,
  floodFill,
  scissors,
  sliceAxis,
  stroke,
  valuesFrom,
  type Grid,
  type ValueAt,
} from './edit'
import { setSegmentHandler, useSegmentTool, type PointerInput, type SegmentToolKind } from './tool'

export interface EditorState {
  /** Fusion key of the segmentation being edited. */
  key: string | null
  /** Bit of the active segment. */
  bit: number
  /** Scissors and contours erase instead of filling. */
  erase: boolean
  /** Scissors: the drawing's slice only, or the whole depth. */
  depth: 'slice' | 'volume'
  /** Region growing: this slice or the whole volume. */
  fillScope: 'slice' | 'volume'
  lower: number
  upper: number
  /** Changes with every edit, so results can refresh. */
  revision: number
}

export const useEditor = create<EditorState>()(() => ({ key: null, bit: 0, erase: false, depth: 'slice', fillScope: 'volume', lower: 100, upper: 3000, revision: 0 }))

const histories = new Map<string, History>()
export const historyOf = (key: string) => {
  let history = histories.get(key)
  if (!history) histories.set(key, (history = new History()))
  return history
}

/** The base series id of an overlay key ("obj:<base>|<object>"). */
export const baseIdOf = (key: string) => key.slice(4, key.indexOf('|'))

export function baseSeriesOf(key: string): DisplaySet | null {
  const id = baseIdOf(key)
  for (const study of useViewer.getState().studies) {
    const series = study.series.find((s) => s.id === id)
    if (series) return { study, series }
  }
  return null
}

export function labelGridOf(key: string): Grid | null {
  const setting = useFusion.getState().settings[key]
  return setting?.volumeId ? (overlayGrid(setting.volumeId) as Grid | null) : null
}

// --- image values ------------------------------------------------------------------------------

const imageGrids = new Map<string, Promise<VolumeGrid | null>>()

/** The base series as a loaded volume (for thresholds, region growing and statistics). */
export function imageGridOf(series: Series): Promise<VolumeGrid | null> {
  let pending = imageGrids.get(series.id)
  if (!pending) {
    const volumeId = volumeIdFor(series)
    pending = new Promise((resolve) => {
      let done = false
      const finish = () => {
        if (done) return
        done = true
        // Read once the last slice is in.
        setTimeout(() => resolve(overlayGrid(volumeId)), 0)
      }
      void loadVolume(series, (progress) => progress >= 1 && finish()).then(() => {
        const volume = cache.getVolume(volumeId) as unknown as { loadStatus?: { loaded?: boolean } } | undefined
        if (volume?.loadStatus?.loaded) finish()
      })
    })
    imageGrids.set(series.id, pending)
  }
  return pending
}

const valueCache = new Map<string, { grid: VolumeGrid; image: VolumeGrid; at: ValueAt }>()

/** Image values under the label grid's voxels (null until the image volume is loaded). */
export async function valuesOf(key: string): Promise<ValueAt | null> {
  const labels = labelGridOf(key)
  const base = baseSeriesOf(key)
  if (!labels || !base) return null
  const image = await imageGridOf(base.series)
  if (!image) return null
  const cached = valueCache.get(key)
  if (cached?.grid === labels && cached.image === image) return cached.at
  const at = valuesFrom(labels, image, (grid, world) => sample(grid, world))
  valueCache.set(key, { grid: labels, image, at })
  return at
}

// --- segmentations and segments -------------------------------------------------------------------

let created = 0

/** A new, empty segmentation on the volume of a series. */
export async function createSegmentation(base: DisplaySet) {
  if (!confirmVolumeMemory(base.series, 'Segmentation')) return null
  const image = await imageGridOf(base.series)
  if (!image) return null
  created++
  const series: Series = {
    id: `segmentation-${created}-${Date.now().toString(36)}`,
    seriesInstanceUID: '',
    seriesNumber: 0,
    description: `Segmentation ${created}`,
    modality: 'SEG',
    kind: 'seg',
    hasOrientation: true,
    isLocalizer: false,
    frameRate: null,
    frameTimeVector: null,
    sortMode: 'instance',
    images: [],
  }
  const grid: Grid = { dimensions: [...image.dimensions] as [number, number, number], spacing: [...image.spacing] as [number, number, number], origin: [...image.origin], direction: [...image.direction], scalars: new Float32Array(image.scalars.length) }
  const key = startObjectOverlay(base, { study: base.study, series }, grid, {
    mode: 'labels',
    segments: [{ bit: 0, number: 1, label: 'Segment 1', color: SEGMENT_COLORS[0], visible: true }],
    style: { opacity: 0.45 },
  })
  useEditor.setState({ key, bit: 0 })
  return key
}

export const segmentsOf = (key: string) => useFusion.getState().settings[key]?.segments ?? []

export function addSegment(key: string, label?: string) {
  const segments = segmentsOf(key)
  const used = new Set(segments.map((s) => s.bit))
  const bit = [...Array(MAX_SEGMENTS).keys()].find((b) => !used.has(b))
  if (bit === undefined) return null
  const number = Math.max(0, ...segments.map((s) => s.number)) + 1
  const segment: Segment & { visible: boolean } = { bit, number, label: label ?? `Segment ${number}`, color: SEGMENT_COLORS[bit % SEGMENT_COLORS.length], visible: true }
  updateFusion(key, { segments: [...segments, segment] })
  useEditor.setState({ bit })
  return bit
}

export function changeSegment(key: string, bit: number, change: Partial<Segment & { visible: boolean }>) {
  updateFusion(key, { segments: segmentsOf(key).map((s) => (s.bit === bit ? { ...s, ...change } : s)) })
}

/** Removes a segment and its voxels (undoable). */
export function removeSegment(key: string, bit: number) {
  const grid = labelGridOf(key)
  if (grid) {
    const recorder = new Recorder(grid)
    for (let i = 0; i < grid.scalars.length; i++) if (Math.floor(grid.scalars[i] / 2 ** bit) % 2 === 1) recorder.setBit(i, bit, false)
    historyOf(key).push(recorder.finish())
  }
  const rest = segmentsOf(key).filter((s) => s.bit !== bit)
  updateFusion(key, { segments: rest })
  if (useEditor.getState().bit === bit) useEditor.setState({ bit: rest[0]?.bit ?? 0 })
  changed(key)
}

/** Segmentations (label overlays) shown over a series. */
export function labelOverlaysOf(seriesId: string): [string, FusionSetting][] {
  const settings = useFusion.getState().settings
  return objectKeysOf(settings, seriesId)
    .map((key) => [key, settings[key]] as [string, FusionSetting])
    .filter(([, s]) => s.mode === 'labels')
}

/** Redraws the overlay and refreshes results after an edit. */
export function changed(key: string) {
  updateFusion(key, {})
  useEditor.setState((s) => ({ revision: s.revision + 1 }))
}

export function undo() {
  const { key } = useEditor.getState()
  const grid = key && labelGridOf(key)
  if (key && grid && historyOf(key).undo(grid)) changed(key)
}

export function redo() {
  const { key } = useEditor.getState()
  const grid = key && labelGridOf(key)
  if (key && grid && historyOf(key).redo(grid)) changed(key)
}

/** Runs an edit on the active segment, recording it for undo. */
export function edit(run: (grid: Grid, bit: number, recorder: Recorder) => void) {
  const { key, bit } = useEditor.getState()
  const grid = key && labelGridOf(key)
  if (!key || !grid) return false
  const recorder = new Recorder(grid)
  run(grid, bit, recorder)
  historyOf(key).push(recorder.finish())
  changed(key)
  return true
}

// --- the pointer -------------------------------------------------------------------------------

const viewportOf = (id: string) => getRenderingEngine(RENDERING_ENGINE_ID)?.getViewport(id) as Types.IViewport | undefined

interface Gesture {
  kind: SegmentToolKind
  start: PointerInput
  last: PointerInput
  recorder: Recorder | null
  canvas: [number, number][]
  world: number[][]
}

let gesture: Gesture | null = null
let redraw = 0

/** Brush strokes redraw at most once a frame. */
function scheduleRedraw(key: string) {
  if (redraw) return
  redraw = requestAnimationFrame(() => {
    redraw = 0
    updateFusion(key, {})
  })
}

function brushOptions(kind: SegmentToolKind, input: PointerInput, values: ValueAt | null) {
  const { lower, upper } = useEditor.getState()
  return {
    radius: useSegmentTool.getState().radius,
    normal: input.normal,
    erase: kind === 'eraser',
    // Until the image values are loaded the threshold brush paints nothing.
    ...(kind === 'threshold' && { accept: values ? (index: number) => values(index) >= lower && values(index) <= upper : () => false }),
  }
}

let currentValues: ValueAt | null = null

const handler = {
  down(input: PointerInput) {
    const { key, bit } = useEditor.getState()
    const grid = key && labelGridOf(key)
    if (!key || !grid || !segmentsOf(key).some((s) => s.bit === bit)) return
    const kind = useSegmentTool.getState().kind
    gesture = { kind, start: input, last: input, recorder: new Recorder(grid), canvas: [input.canvas], world: [input.world] }
    // Values are needed by the threshold brush and region growing; they load in the background.
    void valuesOf(key).then((values) => (currentValues = values))
    if (kind === 'brush' || kind === 'eraser' || kind === 'threshold') {
      stroke(grid, bit, input.world, input.world, brushOptions(kind, input, currentValues), gesture.recorder!)
      scheduleRedraw(key)
    }
    if (kind === 'fill') {
      void valuesOf(key).then((values) => {
        if (!values) return
        const { lower, upper, fillScope } = useEditor.getState()
        const recorder = new Recorder(grid)
        const seed = worldToIndex(grid, input.world)
        floodFill(grid, bit, seed, values, { lower, upper, ...(fillScope === 'slice' && { sliceAxis: sliceAxis(grid, input.normal) }) }, recorder)
        historyOf(key).push(recorder.finish())
        changed(key)
      })
      gesture = null
    }
  },
  drag(input: PointerInput) {
    const { key, bit } = useEditor.getState()
    const grid = key && labelGridOf(key)
    if (!gesture || !key || !grid) return
    const { kind } = gesture
    if (kind === 'brush' || kind === 'eraser' || kind === 'threshold') {
      stroke(grid, bit, gesture.last.world, input.world, brushOptions(kind, input, currentValues), gesture.recorder!)
      scheduleRedraw(key)
    } else {
      gesture.canvas.push(input.canvas)
      gesture.world.push(input.world)
      const points = kind === 'rect' ? rectangle(gesture.start.canvas, input.canvas) : kind === 'circle' ? circle(gesture.start.canvas, input.canvas) : gesture.canvas
      useSegmentTool.setState({ path: { viewportId: input.viewportId, points, closed: true } })
    }
    gesture.last = input
  },
  up(input: PointerInput) {
    const current = gesture
    gesture = null
    useSegmentTool.setState({ path: null })
    const { key, bit, erase, depth } = useEditor.getState()
    const grid = key && labelGridOf(key)
    if (!current || !key || !grid) return
    const { kind } = current
    if (kind === 'rect' || kind === 'circle' || kind === 'free' || kind === 'contour') {
      const viewport = viewportOf(input.viewportId)
      if (!viewport) return
      const toWorld = (p: [number, number]) => [...viewport.canvasToWorld(p)]
      const polygon =
        kind === 'rect'
          ? rectangle(current.start.canvas, input.canvas).map(toWorld)
          : kind === 'circle'
            ? circlePolygon(current.start.world, input.world, input.normal)
            : current.world
      const options = { normal: input.normal, erase: erase !== (kind === 'contour' && input.shift), depth: kind === 'contour' ? ('slice' as const) : depth }
      scissors(grid, bit, polygon, options, current.recorder!)
    }
    historyOf(key).push(current.recorder!.finish())
    changed(key)
  },
}

const rectangle = (a: [number, number], b: [number, number]): [number, number][] => [a, [b[0], a[1]], b, [a[0], b[1]]]
const circle = (center: [number, number], edge: [number, number]): [number, number][] => {
  const r = Math.hypot(edge[0] - center[0], edge[1] - center[1])
  return Array.from({ length: 48 }, (_, s) => [center[0] + r * Math.cos((s / 48) * 2 * Math.PI), center[1] + r * Math.sin((s / 48) * 2 * Math.PI)])
}

/** Connects the segment tool to this editor (once the panel has loaded it). */
export function installEditor() {
  setSegmentHandler(handler)
}

/** Loads the image values of a segmentation ahead of the first threshold brush stroke. */
export async function prepareValues(key: string) {
  currentValues = await valuesOf(key)
  return currentValues !== null
}
