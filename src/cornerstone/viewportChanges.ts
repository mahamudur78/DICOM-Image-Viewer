import { create } from 'zustand'

/**
 * Bumped (at most once per frame) when any viewport shows another image or
 * moves its camera, for overlays that depend on other viewports (reference lines).
 */
export const useViewportChanges = create(() => ({ tick: 0 }))

let frame = 0

export function viewportChanged() {
  if (frame) return
  frame = requestAnimationFrame(() => {
    frame = 0
    useViewportChanges.setState((s) => ({ tick: s.tick + 1 }))
  })
}
