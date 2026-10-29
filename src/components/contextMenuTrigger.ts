import { useRef } from 'react'
import { create } from 'zustand'

/** A right-button press that moves less than this is a click, not a zoom drag. */
const CLICK_TOLERANCE_PX = 4

export const useMenu = create<{ position: { x: number; y: number } | null }>()(() => ({ position: null }))
export const closeMenu = () => useMenu.setState({ position: null })

/** A touch held this long without moving opens the menu. */
export const LONG_PRESS_MS = 600

/**
 * Opens the menu from a long press. Lifting the finger afterwards produces a
 * click right where the menu now is; that click must not pick a menu item.
 */
function openFromLongPress(position: { x: number; y: number }) {
  useMenu.setState({ position })
  const swallow = (event: MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
  }
  window.addEventListener('click', swallow, { capture: true, once: true })
  window.setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 1000)
}

/**
 * Pointer handlers for a viewport: a right click (or a long press on a touch
 * screen) opens the menu, while a right-button drag keeps zooming (Cornerstone's ZoomTool).
 */
export function useContextMenuTrigger() {
  const start = useRef<{ x: number; y: number } | null>(null)
  const press = useRef<{ x: number; y: number; timer: number } | null>(null)
  const cancelPress = () => {
    if (press.current) window.clearTimeout(press.current.timer)
    press.current = null
  }
  return {
    onPointerDownCapture: (event: React.PointerEvent) => {
      start.current = event.button === 2 ? { x: event.clientX, y: event.clientY } : null
      if (event.pointerType !== 'touch') return
      // A second finger is a pinch, not a long press.
      if (press.current) return cancelPress()
      const at = { x: event.clientX, y: event.clientY }
      press.current = {
        ...at,
        timer: window.setTimeout(() => {
          press.current = null
          openFromLongPress(at)
        }, LONG_PRESS_MS),
      }
    },
    onPointerMoveCapture: (event: React.PointerEvent) => {
      const current = press.current
      if (current && Math.hypot(event.clientX - current.x, event.clientY - current.y) > CLICK_TOLERANCE_PX * 3) cancelPress()
    },
    // A held finger may make the browser cancel the pointer (it starts its own long press); the timer still runs.
    onPointerCancelCapture: () => undefined,
    onPointerUpCapture: (event: React.PointerEvent) => {
      if (event.pointerType === 'touch') cancelPress()
      const from = start.current
      start.current = null
      if (event.button !== 2 || !from) return
      if (Math.hypot(event.clientX - from.x, event.clientY - from.y) > CLICK_TOLERANCE_PX) return
      useMenu.setState({ position: { x: event.clientX, y: event.clientY } })
    },
    onContextMenu: (event: React.MouseEvent) => {
      event.preventDefault()
      // The browser's own long press on a touch screen.
      if ((event.nativeEvent as PointerEvent).pointerType === 'touch' && !useMenu.getState().position) {
        cancelPress()
        openFromLongPress({ x: event.clientX, y: event.clientY })
      }
    },
  }
}
