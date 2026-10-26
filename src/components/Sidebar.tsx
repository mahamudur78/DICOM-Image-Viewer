import type { Series, Study } from '../dicom/types'

interface SidebarProps {
  studies: Study[]
  activeSeries: Series | null
  onSelect: (study: Study, series: Series) => void
}

export function Sidebar({ studies, activeSeries, onSelect }: SidebarProps) {
  return (
    <nav className="h-full overflow-y-auto border-r border-slate-800 bg-slate-900 p-2">
      {studies.map((study) => (
        <section key={study.studyInstanceUID} className="mb-4">
          <header className="px-2 pb-2 pt-1">
            <div className="truncate text-sm font-semibold text-slate-100" title={study.patientName}>
              {study.patientName}
            </div>
            <div className="truncate text-xs text-slate-500">
              {[study.studyDate, study.description].filter(Boolean).join(' · ')}
            </div>
          </header>
          <ul className="space-y-1">
            {study.series.map((series) => {
              const active = series === activeSeries
              return (
                <li key={series.seriesInstanceUID}>
                  <button
                    onClick={() => onSelect(study, series)}
                    className={`flex w-full items-start gap-2 rounded-md px-2 py-2 text-left transition ${
                      active ? 'bg-sky-600/20 ring-1 ring-sky-500' : 'hover:bg-slate-800'
                    }`}
                  >
                    <span className="mt-0.5 w-9 shrink-0 rounded bg-slate-800 py-0.5 text-center text-[10px] font-semibold text-sky-300">
                      {series.modality || '—'}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-slate-200">
                        {series.description || `Series ${series.seriesNumber}`}
                      </span>
                      <span className="block text-xs text-slate-500">
                        #{series.seriesNumber} · {series.images.length} image{series.images.length === 1 ? '' : 's'}
                      </span>
                    </span>
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
