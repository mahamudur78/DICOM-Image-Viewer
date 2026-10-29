// Series in their own browser windows: the main window sends the files, and
// every window follows the others' slice position and window/level when linked.
import { metaData } from '@cornerstonejs/core'
import { onWindowMessage, postWindowMessage, thisWindowId, type WindowMessage } from '../app/windowChannel'
import { viewportIdAt } from '../cornerstone/constants'
import { getViewport, setImageIndex, setWindow } from '../cornerstone/viewer'
import type { DisplaySet } from '../dicom/types'
import { t } from '../i18n'
import { notify } from '../notifications/toastStore'
import { useSettings } from '../store/settingsStore'
import { isCellLinked, useViewer } from '../store/viewerStore'
import { dot, isParallel, nearestSlice, normalOf } from './planes'

/** Series waiting for the window opened for them to say hello. */
const pending = new Map<string, DisplaySet>()

/** Changes received from another window are not sent back for a moment (no echo). */
let quietUntil = 0
const quiet = () => performance.now() < quietUntil

export function openSeriesInNewWindow(displaySet: DisplaySet) {
  if (typeof BroadcastChannel !== 'function') return notify(t('windows.unsupported'), 'error')
  const id = Math.random().toString(36).slice(2)
  pending.set(id, displaySet)
  const opened = window.open(`${location.pathname}?window=${id}`, `dicomlens-${id}`)
  if (!opened) {
    pending.delete(id)
    notify(t('windows.blocked'), 'error')
  }
}

let installed = false

/** Answers new windows and applies other windows' changes. Call once Cornerstone is ready. */
export function installWindowSync() {
  if (installed) return
  installed = true
  onWindowMessage((message: WindowMessage) => {
    if (message.type === 'hello') {
      const displaySet = pending.get(message.windowId)
      if (!displaySet) return
      pending.delete(message.windowId)
      const files = [...new Set(displaySet.series.images.map((image) => image.file))]
      postWindowMessage({ type: 'files', windowId: message.windowId, files, seriesId: displaySet.series.id })
    } else if (message.type === 'slice' && message.from !== thisWindowId) {
      if (useSettings.getState().links.sliceSync) applySlice(message)
    } else if (message.type === 'voi' && message.from !== thisWindowId) {
      if (useSettings.getState().links.voiSync) applyVoi(message.lower, message.upper)
    }
  })
}

/** Visible, linked stack viewports of the grid. */
function linkedViewports() {
  const state = useViewer.getState()
  if (state.volumeView) return []
  return Array.from({ length: state.layout.rows * state.layout.cols }, (_, cell) => cell).flatMap((cell) => {
    const series = state.cells[cell]?.series
    const viewportId = viewportIdAt(cell)
    return series?.kind === 'image' && isCellLinked(state, cell) && getViewport(viewportId)?.getCurrentImageId?.() ? [{ viewportId, series }] : []
  })
}

type Plane = { imagePositionPatient?: number[]; rowCosines?: number[]; columnCosines?: number[]; frameOfReferenceUID?: string }

function applySlice(message: Extract<WindowMessage, { type: 'slice' }>) {
  quietUntil = performance.now() + 400
  for (const { viewportId, series } of linkedViewports()) {
    const planes = series.images.map((image) => metaData.get('imagePlaneModule', image.imageId) as Plane | undefined)
    const first = planes[0]
    if (!first?.rowCosines || !first.columnCosines || first.frameOfReferenceUID !== message.frameOfReferenceUID) continue
    if (!isParallel(normalOf({ row: first.rowCosines, column: first.columnCosines }), message.normal)) continue
    const positions = planes.map((p) => p?.imagePositionPatient ?? [NaN, NaN, NaN])
    const { index } = nearestSlice(positions, message.normal, dot(message.position, message.normal))
    if (index >= 0 && index !== getViewport(viewportId)?.getCurrentImageIdIndex()) void setImageIndex(viewportId, index)
  }
}

function applyVoi(lower: number, upper: number) {
  quietUntil = performance.now() + 400
  for (const { viewportId } of linkedViewports()) setWindow(viewportId, upper - lower, (upper + lower) / 2)
}

/** Tells other windows where the active viewport's slice is. */
export function broadcastSlice(frameOfReferenceUID: string | undefined, position: number[], normal: number[]) {
  if (!frameOfReferenceUID || quiet()) return
  postWindowMessage({ type: 'slice', from: thisWindowId, frameOfReferenceUID, position, normal })
}

export function broadcastVoi(lower: number, upper: number) {
  if (quiet() || !useSettings.getState().links.voiSync) return
  postWindowMessage({ type: 'voi', from: thisWindowId, lower, upper })
}
