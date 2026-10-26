import { VR_VIEWPORT_ID } from '../cornerstone/volume3d'
import type { DisplaySet } from '../dicom/types'
import { useVolume } from './useVolume'
import { VolumeProgress } from './VolumeProgress'
import { VrViewport } from './VrViewport'

interface Volume3DViewProps {
  displaySet: DisplaySet
  preset: string
  onError: (message: string) => void
}

/** Full-size 3D volume rendering of one series. */
export function Volume3DView({ displaySet, preset, onError }: Volume3DViewProps) {
  const { volumeId, progress } = useVolume(displaySet.series, onError)
  return (
    <div className="relative h-full w-full">
      <VrViewport
        viewportId={VR_VIEWPORT_ID}
        volumeId={volumeId}
        preset={preset}
        displaySet={displaySet}
        active
        onActivate={() => {}}
      />
      <VolumeProgress volumeId={volumeId} progress={progress} />
    </div>
  )
}
