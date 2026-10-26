import { useState } from 'react'
import { viewportIdAt } from '../cornerstone/viewer'
import { SERIES_DRAG_TYPE, type DisplaySet } from '../dicom/types'
import type { Layout } from './layouts'
import { Viewport } from './Viewport'

interface ViewportGridProps {
  layout: Layout
  cells: (DisplaySet | null)[]
  activeCell: number
  maximizedCell: number | null
  onActivate: (cell: number) => void
  onToggleMaximize: (cell: number) => void
  onDropSeries: (cell: number, seriesUID: string) => void
  onIndexChange: (cell: number, index: number) => void
  onError: (message: string) => void
}

export function ViewportGrid({
  layout,
  cells,
  activeCell,
  maximizedCell,
  onActivate,
  onToggleMaximize,
  onDropSeries,
  onIndexChange,
  onError,
}: ViewportGridProps) {
  const [dropTarget, setDropTarget] = useState<number | null>(null)
  const visibleCells =
    maximizedCell !== null ? [maximizedCell] : Array.from({ length: layout.rows * layout.cols }, (_, i) => i)
  const { rows, cols } = maximizedCell !== null ? { rows: 1, cols: 1 } : layout

  return (
    <div
      className="grid h-full w-full gap-px bg-slate-800"
      style={{ gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`, gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
    >
      {visibleCells.map((cell) => {
        const displaySet = cells[cell]
        return (
          <div
            key={cell}
            className="relative min-h-0 min-w-0"
            onDragOver={(event) => {
              if (!event.dataTransfer.types.includes(SERIES_DRAG_TYPE)) return
              event.preventDefault()
              event.stopPropagation()
              event.dataTransfer.dropEffect = 'copy'
              setDropTarget(cell)
            }}
            onDragLeave={() => setDropTarget((current) => (current === cell ? null : current))}
            onDrop={(event) => {
              const seriesUID = event.dataTransfer.getData(SERIES_DRAG_TYPE)
              if (!seriesUID) return
              event.preventDefault()
              event.stopPropagation()
              setDropTarget(null)
              onDropSeries(cell, seriesUID)
            }}
          >
            {displaySet ? (
              <Viewport
                viewportId={viewportIdAt(cell)}
                displaySet={displaySet}
                active={cell === activeCell}
                onActivate={() => onActivate(cell)}
                onToggleMaximize={() => onToggleMaximize(cell)}
                onIndexChange={(index) => onIndexChange(cell, index)}
                onError={onError}
              />
            ) : (
              <button
                onClick={() => onActivate(cell)}
                className={`grid h-full w-full place-items-center bg-black text-sm text-slate-500 outline-1 -outline-offset-1 ${
                  cell === activeCell ? 'outline-2 outline-sky-500' : 'outline-slate-800'
                }`}
              >
                Drag a series here
              </button>
            )}
            {dropTarget === cell && (
              <div className="pointer-events-none absolute inset-0 z-20 border-2 border-dashed border-sky-400 bg-sky-500/15" />
            )}
          </div>
        )
      })}
    </div>
  )
}
