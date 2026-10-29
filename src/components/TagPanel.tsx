import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { parseHeader } from '../dicom/header'
import { buildRows, diffRows, rowsToCsv, rowsToJson, rowsToText, type TagDifference, type TagRow } from '../dicom/tagRows'
import type { Series } from '../dicom/types'
import { openExportDialog } from '../dialogs/dialogStore'
import { useSettings } from '../store/settingsStore'
import { selectCurrentDisplaySet, selectCurrentFile, useViewer } from '../store/viewerStore'

const BUTTON = 'rounded px-2 py-1 text-xs text-slate-300 hover:bg-slate-800 hover:text-white disabled:opacity-40'
const SELECT = 'rounded border border-slate-700 bg-slate-950 px-1 py-0.5 text-xs text-slate-200'

const readRows = async (file: File) => buildRows(parseHeader(await file.arrayBuffer()))

function download(text: string, name: string, type: string) {
  const link = document.createElement('a')
  link.href = URL.createObjectURL(new Blob([text], { type }))
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(link.href), 5000)
}

export function TagPanel() {
  const file = useViewer(selectCurrentFile)
  const { t } = useTranslation()
  if (!file) return <p className="p-3 text-sm text-slate-500">{t('tags.noImage')}</p>
  return <TagTable file={file} />
}

function TagTable({ file }: { file: File }) {
  const { t } = useTranslation()
  const series = useViewer((s) => selectCurrentDisplaySet(s)?.series)
  const pinned = useSettings((s) => s.pinnedTags)
  const [rows, setRows] = useState<TagRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [wholeSeries, setWholeSeries] = useState(false)
  const [comparing, setComparing] = useState(false)

  useEffect(() => {
    let cancelled = false
    readRows(file)
      .then((built) => {
        if (cancelled) return
        setRows(built)
        setError(null)
      })
      .catch(() => !cancelled && setError(t('tags.readError')))
    return () => {
      cancelled = true
    }
  }, [file, t])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const matching = q ? rows.filter((row) => `${row.tag} ${row.name} ${row.value}`.toLowerCase().includes(q)) : rows
    // Pinned tags (top level) come first.
    const top = matching.filter((row) => row.depth === 0 && pinned.includes(row.tag))
    return [...top, ...matching.filter((row) => !top.includes(row))]
  }, [rows, query, pinned])

  const exportTags = async (format: 'txt' | 'csv' | 'json') => {
    const files = wholeSeries && series ? [...new Set(series.images.map((image) => image.file))] : [file]
    const all = await Promise.all(files.map(async (f) => ({ name: f.name, rows: await readRows(f) })))
    const base = (files.length > 1 ? series?.description || 'series' : file.name).replace(/[^\w.-]+/g, '_')
    if (format === 'txt') download(all.map((f) => `# ${f.name}\n${rowsToText(f.rows)}`).join('\n'), `${base}-tags.txt`, 'text/plain')
    else if (format === 'csv') download(all.map((f, i) => rowsToCsv(f.rows, f.name).split('\r\n').slice(i ? 1 : 0).join('\r\n')).join(''), `${base}-tags.csv`, 'text/csv')
    else download(JSON.stringify(all.map((f) => ({ file: f.name, tags: rowsToJson(f.rows) })), null, 2), `${base}-tags.json`, 'application/json')
  }

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-2 p-3">
        <div className="truncate text-xs text-slate-500">{file.name}</div>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('tags.search')}
          className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none"
        />
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-xs text-slate-500">{t('tags.export')}</span>
          {(['txt', 'csv', 'json'] as const).map((format) => (
            <button key={format} className={BUTTON} onClick={() => void exportTags(format)}>
              {format.toUpperCase()}
            </button>
          ))}
          <label className="flex items-center gap-1 text-xs text-slate-400">
            <input type="checkbox" checked={wholeSeries} onChange={(e) => setWholeSeries(e.target.checked)} />
            {t('tags.wholeSeries')}
          </label>
          <button className={`${BUTTON} ml-auto`} aria-pressed={comparing} onClick={() => setComparing(!comparing)}>
            {t('tags.compare')}
          </button>
          <button className={BUTTON} onClick={() => openExportDialog('tagEdit')}>
            {t('tags.edit')}
          </button>
        </div>
        {comparing && <ComparePicker rows={rows} />}
      </div>
      {!comparing && (
        <div className="min-h-0 flex-1 overflow-auto px-3 pb-3">
          {error ? (
            <p className="text-sm text-red-400">{error}</p>
          ) : (
            <table className="w-full table-fixed text-left font-mono text-[11px]">
              <thead className="sticky top-0 bg-slate-900 text-slate-500">
                <tr>
                  <th className="w-5 py-1 font-normal" />
                  <th className="w-24 py-1 font-normal">{t('tags.colTag')}</th>
                  <th className="w-36 py-1 font-normal">{t('tags.colName')}</th>
                  <th className="w-8 py-1 font-normal">{t('tags.colVr')}</th>
                  <th className="py-1 font-normal">{t('tags.colValue')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => {
                  const isPinned = row.depth === 0 && pinned.includes(row.tag)
                  return (
                    <tr key={row.path} data-testid="tag-row" className={`border-t border-slate-800/60 align-top ${isPinned ? 'bg-sky-500/5' : ''}`}>
                      <td className="py-1">
                        {row.depth === 0 && row.tag && (
                          <button
                            aria-label={t(isPinned ? 'tags.unpin' : 'tags.pin', { tag: row.name || row.tag })}
                            aria-pressed={isPinned}
                            onClick={() => useSettings.getState().togglePinnedTag(row.tag)}
                            className={isPinned ? 'text-amber-300' : 'text-slate-600 hover:text-slate-300'}
                          >
                            ★
                          </button>
                        )}
                      </td>
                      <td className="py-1 text-slate-500" style={{ paddingLeft: row.depth * 10 }}>
                        {row.tag || '›'}
                      </td>
                      <td className="truncate py-1 text-slate-300" title={row.name}>
                        {row.name}
                      </td>
                      <td className="py-1 text-slate-500">{row.vr}</td>
                      <td className="break-all py-1 text-slate-100">{row.value}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}

/** Picks another open image and lists the tags that differ from this one. */
function ComparePicker({ rows }: { rows: TagRow[] }) {
  const { t } = useTranslation()
  const studies = useViewer((s) => s.studies)
  const allSeries = useMemo(() => studies.flatMap((study) => study.series.filter((s) => s.images.some((i) => i.file)).map((series) => ({ study, series }))), [studies])
  const [seriesId, setSeriesId] = useState(allSeries[0]?.series.id ?? '')
  const [number, setNumber] = useState(1)
  const [differences, setDifferences] = useState<TagDifference[] | null>(null)
  const series: Series | undefined = allSeries.find((s) => s.series.id === seriesId)?.series

  useEffect(() => {
    const file = series?.images[Math.min(number, series.images.length) - 1]?.file
    if (!file) return
    let cancelled = false
    void readRows(file).then((other) => !cancelled && setDifferences(diffRows(rows, other)))
    return () => {
      cancelled = true
    }
  }, [series, number, rows])

  return (
    <div className="flex min-h-0 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1 text-xs text-slate-400">
        {t('tags.compareWith')}
        <select aria-label={t('tags.compareSeries')} value={seriesId} onChange={(e) => setSeriesId(e.target.value)} className={`${SELECT} max-w-48`}>
          {allSeries.map(({ study, series: s }) => (
            <option key={s.id} value={s.id}>
              {study.studyDate} #{s.seriesNumber} {s.description || s.modality}
            </option>
          ))}
        </select>
        <input aria-label={t('tags.compareImage')} type="number" min={1} max={series?.images.length ?? 1} value={number} onChange={(e) => setNumber(Math.max(1, Number(e.target.value) || 1))} className={`${SELECT} w-16`} />
      </div>
      {differences && (
        <div className="max-h-[60dvh] overflow-auto">
          <p className="mb-1 text-xs text-slate-500">{t('tags.differences', { count: differences.length })}</p>
          <table className="w-full table-fixed text-left font-mono text-[11px]" data-testid="tag-diff">
            <tbody>
              {differences.map((d) => (
                <tr key={d.path} className="border-t border-slate-800/60 align-top">
                  <td className="w-36 truncate py-1 text-slate-300" title={`${d.path} ${d.name}`}>
                    {d.name || d.tag}
                  </td>
                  <td className="break-all py-1 pr-2 text-rose-300">{d.a ?? '—'}</td>
                  <td className="break-all py-1 text-emerald-300">{d.b ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
