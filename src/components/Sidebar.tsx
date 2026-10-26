import { SERIES_DRAG_TYPE, type DisplaySet, type Series, type Study } from '../dicom/types'
import { SeriesThumbnail } from './SeriesThumbnail'

interface SidebarProps {
  studies: Study[]
  cells: (DisplaySet | null)[]
  activeCell: number
  onSelect: (study: Study, series: Series) => void
}

export function Sidebar({ studies, cells, activeCell, onSelect }: SidebarProps) {
  const activeSeries = cells[activeCell]?.series
  const displayed = new Set(cells.map((cell) => cell?.series))

  return (
    // On small screens this is a single horizontal strip of thumbnails above the grid.
    <nav className="flex h-full overflow-x-auto border-b border-slate-800 bg-slate-900 lg:block lg:overflow-y-auto lg:overflow-x-hidden lg:border-b-0 lg:border-r">
      {studies.map((study) => (
        <section key={study.studyInstanceUID} className="flex shrink-0 lg:block">
          <header className="sticky top-0 z-10 hidden border-b border-slate-800 bg-slate-900/95 px-3 py-2 backdrop-blur lg:block">
            <div className="truncate text-sm font-semibold text-slate-100" title={study.patientName}>
              {study.patientName}
            </div>
            <div className="truncate text-xs text-slate-500">
              {[study.studyDate, study.description].filter(Boolean).join(' · ')}
            </div>
          </header>

          <ul className="flex gap-1 p-1.5 lg:block lg:space-y-1 lg:p-2">
            {study.series.map((series) => {
              const active = series === activeSeries
              const shown = displayed.has(series)
              return (
                <li key={series.seriesInstanceUID} className="shrink-0">
                  <button
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.setData(SERIES_DRAG_TYPE, series.seriesInstanceUID)
                      event.dataTransfer.effectAllowed = 'copy'
                    }}
                    onClick={() => onSelect(study, series)}
                    title="Click to show in the active viewport, or drag onto any viewport"
                    className={`w-24 rounded-md p-1.5 text-left transition lg:w-full lg:p-2 ${
                      active ? 'bg-sky-600/20 ring-1 ring-sky-500' : 'hover:bg-slate-800'
                    }`}
                  >
                    <div className="mb-1.5 flex items-center gap-2 text-xs">
                      <span className="font-semibold text-sky-400">{series.modality || '—'}</span>
                      <span className="truncate text-slate-300">
                        {series.seriesNumber}/{series.images.length} {series.description}
                      </span>
                      {shown && !active && <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-sky-400" />}
                    </div>
                    <SeriesThumbnail series={series} />
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </nav>
  )
}
