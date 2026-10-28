import { useEffect, type ReactNode } from 'react'
import { registerViewport, unregisterViewport, type ViewportKind } from '../cornerstone/viewportRegistry'
import { useContextMenuTrigger } from './contextMenuTrigger'

interface ViewportFrameProps {
  viewportId: string
  kind: Extract<ViewportKind, 'video' | 'pdf' | 'sr'>
  active: boolean
  onActivate: () => void
  onToggleMaximize?: () => void
  children: ReactNode
}

/**
 * Cell for viewers that are not Cornerstone viewports (video, PDF, report):
 * the same outline, activation, maximize and context menu as image viewports,
 * and registration so commands know what the cell shows.
 */
export function ViewportFrame({ viewportId, kind, active, onActivate, onToggleMaximize, children }: ViewportFrameProps) {
  const contextMenu = useContextMenuTrigger()

  useEffect(() => {
    registerViewport(viewportId, kind)
    return () => unregisterViewport(viewportId)
  }, [viewportId, kind])

  return (
    <div
      data-viewport-id={viewportId}
      data-viewport-kind={kind}
      className={`@container relative flex h-full w-full flex-col overflow-hidden bg-slate-950 outline-1 -outline-offset-1 ${
        active ? 'z-10 outline-2 outline-sky-500' : 'outline-slate-800'
      }`}
      onPointerDownCapture={(event) => {
        onActivate()
        contextMenu.onPointerDownCapture(event)
      }}
      onPointerUpCapture={contextMenu.onPointerUpCapture}
      onContextMenu={contextMenu.onContextMenu}
      onDoubleClick={(event) => {
        // Double-clicking text selects it; only the frame's own background maximizes.
        if (event.target === event.currentTarget) onToggleMaximize?.()
      }}
    >
      {children}
    </div>
  )
}
