import { VR_VIEWPORT_ID } from '../cornerstone/constants'
import { useViewer } from '../store/viewerStore'
import { useVolume } from './useVolume'
import { VolumeProgress } from './VolumeProgress'
import { VrViewport } from './VrViewport'

/** Full-size 3D volume rendering of the volume view's series. */
export function Volume3DView() {
  const displaySet = useViewer((s) => s.volumeView!.displaySet)
  const preset = useViewer((s) => s.preset)
  const { volumeId, progress } = useVolume(displaySet.series)
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
