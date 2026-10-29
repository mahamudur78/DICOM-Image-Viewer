import { utilities as toolUtilities } from '@cornerstonejs/tools'
import { useEffect, type RefObject } from 'react'
import type { Series } from '../dicom/types'
import { cineStateFor, stopCine, useCine, type CineState } from '../store/cineStore'

const { playClip, stopClip } = toolUtilities.cine

/** The viewport's cine state, re-rendering when it changes. */
export function useCineState(viewportId: string, series: Series): CineState {
  useCine((s) => s.viewports[viewportId])
  return cineStateFor(viewportId, series)
}

/** Plays or stops Cornerstone's cine on the viewport element as the cine state changes. */
export function useCinePlayback(viewportId: string, elementRef: RefObject<HTMLDivElement | null>, series: Series) {
  const { playing, fps, mode } = useCineState(viewportId, series)
  const { frameRate, frameTimeVector, images } = series

  useEffect(() => {
    const element = elementRef.current
    if (!element || !playing) return
    // The Frame Time Vector gives each frame its own duration; the speed control scales it.
    const useVector = frameTimeVector?.length === images.length && frameRate
    playClip(element, {
      framesPerSecond: fps,
      loop: true,
      bounce: mode === 'bounce',
      ...(useVector && { frameTimeVector, frameTimeVectorSpeedMultiplier: fps / frameRate }),
    })
    return () => stopClip(element)
  }, [elementRef, playing, fps, mode, frameRate, frameTimeVector, images.length])

  // A viewport that goes away (layout change, MPR, new files) stops playing.
  useEffect(() => () => stopCine(viewportId), [viewportId])
}
