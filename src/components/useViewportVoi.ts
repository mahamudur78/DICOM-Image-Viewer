import { Enums, type Types } from '@cornerstonejs/core'
import { useEffect, useState } from 'react'
import { getViewport } from '../cornerstone/viewer'

export interface Voi {
  width: number
  center: number
}

const toVoi = (range: Types.VOIRange): Voi => ({
  width: Math.round(range.upper - range.lower),
  center: Math.round((range.upper + range.lower) / 2),
})

/**
 * Current window width/center of a viewport, kept in sync with every change
 * (presets, W/L dragging, sync, reset).
 */
export function useViewportVoi(viewportId: string | null): Voi | null {
  const [state, setState] = useState<{ viewportId: string | null; voi: Voi | null }>({ viewportId: null, voi: null })

  useEffect(() => {
    if (!viewportId) return
    // Cornerstone events do not bubble, but a capture listener on the document
    // still sees them, even for viewports that mount after this effect runs.
    const onVoiModified = (event: Event) => {
      const { viewportId: id, range } = (event as Types.EventTypes.VoiModifiedEvent).detail
      if (id === viewportId && range) setState({ viewportId, voi: toVoi(range) })
    }
    document.addEventListener(Enums.Events.VOI_MODIFIED, onVoiModified, true)

    // Pick up the window the viewport already has.
    const frame = requestAnimationFrame(() => {
      const range = getViewport(viewportId)?.getProperties()?.voiRange
      if (range) setState({ viewportId, voi: toVoi(range) })
    })
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener(Enums.Events.VOI_MODIFIED, onVoiModified, true)
    }
  }, [viewportId])

  return state.viewportId === viewportId ? state.voi : null
}
