import { useRef } from 'react'
import { create } from 'zustand'

/** A right-button press that moves less than this is a click, not a zoom drag. */
const CLICK_TOLERANCE_PX = 4

export const useMenu = create<{ position: { x: number; y: number } | null }>()(() => ({ position: null }))
export const closeMenu = () => useMenu.setState({ position: null })

/**
 * Pointer handlers for a viewport: a right click opens the menu, while a
 * right-button drag keeps zooming (Cornerstone's ZoomTool).
 */
export function useContextMenuTrigger() {
  const start = useRef<{ x: number; y: number } | null>(null)
  return {
    onPointerDownCapture: (event: React.PointerEvent) => {
      start.current = event.button === 2 ? { x: event.clientX, y: event.clientY } : null
    },
    onPointerUpCapture: (event: React.PointerEvent) => {
      const from = start.current
      start.current = null
      if (event.button !== 2 || !from) return
      if (Math.hypot(event.clientX - from.x, event.clientY - from.y) > CLICK_TOLERANCE_PX) return
      useMenu.setState({ position: { x: event.clientX, y: event.clientY } })
    },
    onContextMenu: (event: React.MouseEvent) => event.preventDefault(),
  }
}
