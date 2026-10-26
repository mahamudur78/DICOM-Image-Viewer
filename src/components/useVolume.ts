import { useEffect, useState } from 'react'
import { loadVolume } from '../cornerstone/mpr'
import type { Series } from '../dicom/types'

/**
 * Builds (or reuses from cache) the streaming volume of a series. `volumeId`
 * is set once the geometry is known; `progress` tracks slices streaming in.
 */
export function useVolume(series: Series, onError: (message: string) => void) {
  const [state, setState] = useState<{ series: Series | null; volumeId: string | null; progress: number }>({
    series: null,
    volumeId: null,
    progress: 0,
  })

  useEffect(() => {
    let cancelled = false
    loadVolume(series, (progress) => {
      // May fire before the volume id is known (e.g. a cached volume reports 100% right away).
      if (!cancelled) {
        setState((current) => (current.series === series ? { ...current, progress } : { series, volumeId: null, progress }))
      }
    })
      .then((volumeId) => {
        if (!cancelled) setState((current) => ({ series, volumeId, progress: current.series === series ? current.progress : 0 }))
      })
      .catch((error: unknown) => {
        if (!cancelled) onError(`Could not build the volume: ${error instanceof Error ? error.message : String(error)}`)
      })
    return () => {
      cancelled = true
    }
  }, [series, onError])

  // Ignore results that belong to a previous series.
  const current = state.series === series
  return { volumeId: current ? state.volumeId : null, progress: current ? state.progress : 0 }
}
