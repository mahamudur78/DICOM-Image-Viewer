// The loaded volume an image belongs to, so sphere ROIs measure in 3D.
import { cache } from '@cornerstonejs/core'
import { setVolumeLookup } from '../measurements/measure'
import { overlayGrid } from './fusionStore'

export function installSphereVolumes() {
  setVolumeLookup((imageId) => {
    for (const volume of cache.getVolumes()) {
      const loaded = (volume as unknown as { loadStatus?: { loaded?: boolean } }).loadStatus?.loaded
      if (loaded && volume.imageIds?.includes(imageId)) return overlayGrid(volume.volumeId)
    }
    return null
  })
}
