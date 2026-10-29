// Which series is fused over which viewport, how it looks and how it is
// registered. Grid cells are keyed by their viewport id; "mpr" covers the
// three MPR views (and the PET/CT layout's fusion row).
import { Enums, cache, eventTarget, metaData } from '@cornerstonejs/core'
import { create } from 'zustand'
import { loadVolume } from '../cornerstone/mpr'
import { volumeGrid } from '../cornerstone/volume3dTools'
import type { DisplaySet } from '../dicom/types'
import { indexToWorld, type VolumeGrid } from '../volume/grid'
import { IDENTITY, type OverlayStyle, type Registration } from './fusion'

export interface FusionSetting {
  overlay: DisplaySet
  volumeId: string | null
  /** Fraction of the overlay volume loaded. */
  progress: number
  style: OverlayStyle
  registration: Registration
  visible: boolean
}

export const MPR_KEY = 'mpr'

export const useFusion = create<{ settings: Record<string, FusionSetting> }>()(() => ({ settings: {} }))

/** The fusion of a viewport: its own, or the MPR one for MPR viewports. */
export function fusionKeyOf(viewportId: string) {
  return viewportId.startsWith('viewport-') ? viewportId : MPR_KEY
}

export function updateFusion(key: string, change: Partial<FusionSetting>) {
  useFusion.setState((s) => (s.settings[key] ? { settings: { ...s.settings, [key]: { ...s.settings[key], ...change } } } : s))
}

export function removeFusion(key: string) {
  useFusion.setState((s) => {
    const settings = { ...s.settings }
    delete settings[key]
    return { settings }
  })
}

// --- the overlay volume as a grid (refreshed while it streams in) ---------------------------------

const grids = new Map<string, { grid: VolumeGrid; at: number }>()

export function overlayGrid(volumeId: string): VolumeGrid | null {
  const volume = cache.getVolume(volumeId)
  if (!volume) return null
  const loaded = (volume as unknown as { loadStatus?: { loaded?: boolean } }).loadStatus?.loaded
  const cached = grids.get(volumeId)
  // While loading, re-read at most twice a second; once loaded, keep it.
  if (cached && (loaded || performance.now() - cached.at < 500)) return cached.grid
  const grid = volumeGrid(volumeId)
  if (grid) grids.set(volumeId, { grid, at: loaded ? Infinity : performance.now() })
  return grid
}

function range(grid: VolumeGrid) {
  let min = Infinity
  let max = -Infinity
  for (let i = 0; i < grid.scalars.length; i += 3) {
    const v = grid.scalars[i]
    if (v < min) min = v
    if (v > max) max = v
  }
  return { min, max }
}

const frameOfReference = (displaySet: DisplaySet) =>
  (metaData.get('imagePlaneModule', displaySet.series.images[0]?.imageId) as { frameOfReferenceUID?: string } | undefined)?.frameOfReferenceUID

/**
 * Fuses a series over a viewport (or the MPR views): loads it as a volume,
 * chooses a colour scale from its values, and lines it up — identity in the
 * same frame of reference, otherwise centre on centre.
 */
export async function startFusion(key: string, base: DisplaySet, overlay: DisplaySet, baseCentre: number[] | null) {
  const style: OverlayStyle = { colormap: overlay.series.modality === 'PT' || overlay.series.modality === 'NM' ? 'hot' : 'jet', opacity: 0.5, lower: 0, upper: 1, threshold: 0 }
  useFusion.setState((s) => ({ settings: { ...s.settings, [key]: { overlay, volumeId: null, progress: 0, style, registration: IDENTITY, visible: true } } }))
  const volumeId = await loadVolume(overlay.series, (progress) => updateFusion(key, { progress }))
  const grid = overlayGrid(volumeId)
  if (!grid) return
  const centre = indexToWorld(grid, grid.dimensions.map((d) => (d - 1) / 2))
  const same = frameOfReference(base) !== undefined && frameOfReference(base) === frameOfReference(overlay)
  const registration: Registration = { translate: same || !baseCentre ? [0, 0, 0] : baseCentre.map((v, i) => v - centre[i]), rotate: [0, 0, 0], center: centre }
  updateFusion(key, { volumeId, registration })
  autoScale(key, volumeId)
}

/** Colour scale from the overlay's values: up to 70% of its maximum, threshold at 5%. */
function autoScale(key: string, volumeId: string) {
  const apply = () => {
    const grid = overlayGrid(volumeId)
    if (!grid) return
    const { min, max } = range(grid)
    const upper = min + (max - min) * 0.7
    updateFusion(key, { style: { ...useFusion.getState().settings[key].style, lower: min, upper, threshold: min + (max - min) * 0.05 } })
  }
  apply()
  // Again when the whole volume is in (values streamed in later may be higher).
  const onLoaded = (event: Event) => {
    const { volumeId: id, framesProcessed, numberOfFrames } = (event as CustomEvent<{ volumeId: string; framesProcessed: number; numberOfFrames: number }>).detail
    if (id !== volumeId || framesProcessed < numberOfFrames) return
    eventTarget.removeEventListener(Enums.Events.IMAGE_VOLUME_MODIFIED, onLoaded)
    grids.delete(volumeId)
    if (useFusion.getState().settings[key]?.volumeId === volumeId) apply()
  }
  eventTarget.addEventListener(Enums.Events.IMAGE_VOLUME_MODIFIED, onLoaded)
}
