import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { filterStudies, groupByPatient } from '../dicom/studyTree'
import { SERIES_DRAG_TYPE, type Series, type Study } from '../dicom/types'
import { selectSeries } from '../store/viewerActions'
import { selectCurrentDisplaySet, useViewer } from '../store/viewerStore'
import { SeriesThumbnail } from './SeriesThumbnail'

/**
 * Patients → studies → series. On large screens a column with collapsible
 * studies; on small screens a horizontal strip of series thumbnails.
 */
export function Sidebar() {
  const { t } = useTranslation()
  const studies = useViewer((s) => s.studies)
  const cells = useViewer((s) => s.cells)
  const volumeSet = useViewer((s) => s.volumeView?.displaySet)
  const activeSeries = useViewer((s) => selectCurrentDisplaySet(s)?.series)
  const [query, setQuery] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  // In MPR/3D only the volume's series counts as shown.
  const displayed = new Set(volumeSet ? [volumeSet.series] : cells.map((cell) => cell?.series))

  const patients = useMemo(() => groupByPatient(filterStudies(studies, query)), [studies, query])
  const showPatients = groupByPatient(studies).length > 1
  const seriesCount = studies.reduce((sum, study) => sum + study.series.length, 0)
  const toggle = (uid: string) =>
    setCollapsed((current) => {
      const next = new Set(current)
      if (next.has(uid)) next.delete(uid)
      else next.add(uid)
      return next
    })

  return (
    <nav aria-label={t('sidebar.label')} className="flex h-full items-stretch overflow-x-auto border-b border-slate-800 bg-slate-900 lg:block lg:overflow-y-auto lg:overflow-x-hidden lg:border-b-0 lg:border-r">
      {seriesCount > 4 && (
        <div className="sticky left-0 top-0 z-20 flex shrink-0 items-center bg-slate-900 p-1.5 lg:block lg:border-b lg:border-slate-800 lg:p-2">
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('sidebar.search')}
            aria-label={t('sidebar.search')}
            className="w-28 rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none lg:w-full"
          />
        </div>
      )}

      {patients.length === 0 && <p className="p-3 text-xs text-slate-500">{t('sidebar.noMatch')}</p>}

      {patients.map((patient) => (
        <section key={patient.key} aria-label={patient.name || t('viewport.anonymous')} className="flex shrink-0 lg:block">
          {showPatients && (
            <div className="hidden bg-slate-950/60 px-3 pt-2 pb-1 lg:block">
              <div className="truncate text-sm font-semibold text-slate-100" title={patient.name}>
                👤 {patient.name || t('viewport.anonymous')}
              </div>
              {patient.id && <div className="truncate text-xs text-slate-500">{patient.id}</div>}
            </div>
          )}
          {patient.studies.map((study) => (
            <StudyItem
              key={study.studyInstanceUID}
              study={study}
              showPatient={!showPatients}
              collapsed={collapsed.has(study.studyInstanceUID) && !query}
              onToggle={() => toggle(study.studyInstanceUID)}
              activeSeries={activeSeries}
              displayed={displayed}
            />
          ))}
        </section>
      ))}
    </nav>
  )
}

interface StudyItemProps {
  study: Study
  showPatient: boolean
  collapsed: boolean
  onToggle: () => void
  activeSeries: Series | undefined
  displayed: Set<Series | undefined>
}

function StudyItem({ study, showPatient, collapsed, onToggle, activeSeries, displayed }: StudyItemProps) {
  const { t } = useTranslation()
  return (
    <div className="flex shrink-0 lg:block">
      <button
        onClick={onToggle}
        aria-expanded={!collapsed}
        className="sticky top-0 z-10 hidden w-full border-b border-slate-800 bg-slate-900/95 px-3 py-2 text-left backdrop-blur hover:bg-slate-800 lg:block"
      >
        {showPatient && (
          <div className="truncate text-sm font-semibold text-slate-100" title={study.patientName}>
            {study.patientName || t('viewport.anonymous')}
          </div>
        )}
        <div className="flex items-center gap-1 text-xs text-slate-400">
          <span aria-hidden>{collapsed ? '▸' : '▾'}</span>
          <span className="truncate">{[study.studyDate, study.description].filter(Boolean).join(' · ')}</span>
          <span className="ml-auto shrink-0 text-slate-500">{t('sidebar.seriesCount', { count: study.series.length })}</span>
        </div>
      </button>

      {!collapsed && (
        <ul className="flex gap-1 p-1.5 lg:block lg:space-y-1 lg:p-2">
          {study.series.map((series) => {
            const active = series === activeSeries
            const shown = displayed.has(series)
            return (
              <li key={series.id} className="shrink-0">
                <button
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.setData(SERIES_DRAG_TYPE, series.id)
                    event.dataTransfer.effectAllowed = 'copy'
                  }}
                  onClick={() => selectSeries(study, series)}
                  title={t('sidebar.seriesHint')}
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
      )}
    </div>
  )
}
