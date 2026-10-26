import { SynchronizerManager, synchronizers, type Synchronizer } from '@cornerstonejs/tools'

const SLICE_SYNC_ID = 'slice-sync'
const VOI_SYNC_ID = 'voi-sync'

/**
 * Slice sync matches slices by patient position, and only between viewports
 * showing the same plane (e.g. two axial series), like "link scroll" in
 * clinical viewers. VOI sync copies window/level and invert.
 */
export function createSynchronizers() {
  SynchronizerManager.destroySynchronizer(SLICE_SYNC_ID)
  SynchronizerManager.destroySynchronizer(VOI_SYNC_ID)
  synchronizers.createImageSliceSynchronizer(SLICE_SYNC_ID).setEnabled(false)
  synchronizers.createVOISynchronizer(VOI_SYNC_ID, { syncInvertState: true, syncColormap: false }).setEnabled(false)
}

function all(): Synchronizer[] {
  return [SLICE_SYNC_ID, VOI_SYNC_ID]
    .map((id) => SynchronizerManager.getSynchronizer(id))
    .filter((s): s is Synchronizer => !!s)
}

/**
 * Only the active viewport drives the others. If every viewport were a source,
 * a coarser series (e.g. 5 mm vs 2.5 mm) would snap to its nearest slice and
 * sync that position back, pulling the viewport being scrolled off by a step.
 */
export function setSyncSource(renderingEngineId: string, viewportIds: string[], sourceViewportId: string | null) {
  for (const synchronizer of all()) {
    for (const viewportId of viewportIds) synchronizer.remove({ renderingEngineId, viewportId })
    for (const viewportId of viewportIds) {
      if (viewportId === sourceViewportId) synchronizer.addSource({ renderingEngineId, viewportId })
      else synchronizer.addTarget({ renderingEngineId, viewportId })
    }
  }
}

export function setSliceSync(enabled: boolean) {
  SynchronizerManager.getSynchronizer(SLICE_SYNC_ID)?.setEnabled(enabled)
}

export function setVoiSync(enabled: boolean) {
  SynchronizerManager.getSynchronizer(VOI_SYNC_ID)?.setEnabled(enabled)
}
