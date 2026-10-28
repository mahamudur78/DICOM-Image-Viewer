import { lazy, Suspense, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { viewportIdAt } from '../cornerstone/constants'
import { SERIES_DRAG_TYPE } from '../dicom/types'
import { setActiveCell, setCellIndex, showSeriesInCell, toggleMaximize, useViewer } from '../store/viewerStore'
import { Viewport } from './Viewport'

// Downloaded only when such a series is shown (pdf.js alone is several hundred KB).
const VIEWERS = {
  video: lazy(() => import('./VideoViewer')),
  pdf: lazy(() => import('./PdfViewer')),
  sr: lazy(() => import('./SrViewer')),
}

export function ViewportGrid() {
  const { t } = useTranslation()
  const layout = useViewer((s) => s.layout)
  const cells = useViewer((s) => s.cells)
  const activeCell = useViewer((s) => s.activeCell)
  const maximizedCell = useViewer((s) => s.maximizedCell)
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
              showSeriesInCell(cell, seriesUID)
            }}
          >
            {displaySet && displaySet.series.kind !== 'image' ? (
              <Suspense fallback={<div className="grid h-full place-items-center bg-black text-sm text-slate-500">{t('panels.loading')}</div>}>
                <DocumentViewer
                  kind={displaySet.series.kind}
                  viewportId={viewportIdAt(cell)}
                  cell={cell}
                  displaySet={displaySet}
                  active={cell === activeCell}
                  onActivate={() => setActiveCell(cell)}
                  onToggleMaximize={() => toggleMaximize(cell)}
                />
              </Suspense>
            ) : displaySet ? (
              <Viewport
                viewportId={viewportIdAt(cell)}
                displaySet={displaySet}
                active={cell === activeCell}
                onActivate={() => setActiveCell(cell)}
                onToggleMaximize={() => toggleMaximize(cell)}
                onIndexChange={(index) => setCellIndex(cell, index)}
              />
            ) : (
              <button
                onClick={() => setActiveCell(cell)}
                className={`grid h-full w-full place-items-center bg-black text-sm text-slate-500 outline-1 -outline-offset-1 ${
                  cell === activeCell ? 'outline-2 outline-sky-500' : 'outline-slate-800'
                }`}
              >
                {t('viewport.dragSeriesHere')}
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

/** The viewer for a video, PDF or report series. */
function DocumentViewer({ kind, ...props }: { kind: 'video' | 'pdf' | 'sr' } & React.ComponentProps<typeof VIEWERS.sr>) {
  const Viewer = VIEWERS[kind] as typeof VIEWERS.sr
  return <Viewer {...props} />
}
