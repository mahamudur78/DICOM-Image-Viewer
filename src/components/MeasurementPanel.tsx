import { annotation as csAnnotation } from '@cornerstonejs/tools'
import type { Annotation } from '@cornerstonejs/tools/types'
import { useTranslation } from 'react-i18next'
import { runCommand } from '../commands/commands'
import { histogram } from '../measurements/geometry'
import {
  colorOf,
  deleteMeasurements,
  isHidden,
  measurementRows,
  renameMeasurement,
  setColor,
  setHidden,
  showMeasurement,
  useMeasurementVersion,
  type MeasurementRow,
} from '../measurements/manage'
import { measureAnnotation } from '../measurements/measure'
import { notify } from '../notifications/toastStore'
import { useSettings } from '../store/settingsStore'
import { useViewer } from '../store/viewerStore'

const BUTTON = 'rounded px-2 py-1 text-xs text-slate-300 hover:bg-slate-800 hover:text-white disabled:opacity-40'
const ICON_BUTTON = 'grid h-7 w-7 place-items-center rounded text-slate-400 hover:bg-slate-800 hover:text-white'
const DEFAULT_COLOR = '#ffff00'

/** Measurements of the open studies, by series, with their values and actions. */
export function MeasurementPanel() {
  const { t } = useTranslation()
  useMeasurementVersion((s) => s.version)
  useViewer((s) => s.studies)
  const unit = useSettings((s) => s.measureUnit)
  const rows = measurementRows()
  const groups = groupBySeries(rows, t('measure.mprGroup'))
  const selected = rows.find((row) => csAnnotation.selection.isAnnotationSelected(row.annotation.annotationUID!))

  return (
    <div className="flex h-full flex-col text-sm">
      <div className="flex flex-wrap items-center gap-1 border-b border-slate-800 px-2 py-1.5">
        <select
          aria-label={t('measure.unit')}
          value={unit}
          onChange={(event) => useSettings.getState().setMeasureUnit(event.target.value as 'mm' | 'cm')}
          className="h-7 rounded border border-slate-700 bg-slate-950 px-1 text-xs text-slate-200"
        >
          <option value="mm">mm</option>
          <option value="cm">cm</option>
        </select>
        {(
          [
            ['measure.undo', 'measure.undo'],
            ['measure.redo', 'measure.redo'],
            ['measure.toggleHidden', 'measure.hideAll'],
            ['measure.copyValues', 'measure.copyValuesShort'],
            ['measure.exportCsv', 'measure.csvShort'],
            ['measure.saveJson', 'measure.saveShort'],
            ['measure.loadJson', 'measure.loadShort'],
            ['measure.deleteAll', 'measure.deleteAllShort'],
          ] as const
        ).map(([command, label]) => (
          <button key={command} className={BUTTON} onClick={() => runCommand(command)}>
            {t(label)}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {rows.length === 0 && <p className="p-3 text-slate-500">{t('measure.empty')}</p>}
        {groups.map(({ title, rows }) => (
          <section key={title} aria-label={title}>
            <h3 className="sticky top-0 bg-slate-900/95 px-3 pb-1 pt-2 text-xs font-semibold text-slate-400">{title}</h3>
            <ul>
              {rows.map((row) => (
                <MeasurementItem key={row.annotation.annotationUID} row={row} selected={row === selected} />
              ))}
            </ul>
          </section>
        ))}
      </div>

      {selected && <Histogram annotation={selected.annotation} />}
    </div>
  )
}

function MeasurementItem({ row, selected }: { row: MeasurementRow; selected: boolean }) {
  const { t } = useTranslation()
  const { annotation } = row
  const hidden = isHidden(annotation)
  const tool = t(`measure.tools.${row.toolName}`, { defaultValue: row.toolName })
  const name = row.label || tool
  const text = [name, ...row.lines].join('\n')

  return (
    <li
      aria-label={name}
      aria-current={selected || undefined}
      className={`group border-l-2 px-3 py-1.5 ${selected ? 'border-sky-500 bg-slate-800/70' : 'border-transparent hover:bg-slate-800/40'} ${hidden ? 'opacity-50' : ''}`}
    >
      <div className="flex items-center gap-2">
        <button className="min-w-0 flex-1 text-left" onClick={() => showMeasurement(annotation)} title={t('measure.show')}>
          <span className="font-medium text-slate-100">{name}</span>
          {row.label && <span className="ml-1 text-xs text-slate-500">{tool}</span>}
          {row.location && <span className="ml-2 text-xs text-slate-500">{t('measure.imageNumber', { number: row.location.index + 1 })}</span>}
        </button>
        <input
          type="color"
          aria-label={t('measure.color', { name })}
          value={colorOf(annotation) ?? DEFAULT_COLOR}
          onChange={(event) => setColor(annotation, event.target.value)}
          className="h-6 w-6 cursor-pointer rounded border-0 bg-transparent p-0"
        />
        <button className={ICON_BUTTON} aria-label={t('measure.rename', { name })} title={t('measure.rename', { name })} onClick={() => void renameMeasurement(annotation)}>
          ✎
        </button>
        <button
          className={ICON_BUTTON}
          aria-label={t(hidden ? 'measure.showItem' : 'measure.hideItem', { name })}
          aria-pressed={hidden}
          title={t(hidden ? 'measure.showItem' : 'measure.hideItem', { name })}
          onClick={() => setHidden([annotation], !hidden)}
        >
          {hidden ? '◌' : '◉'}
        </button>
        <button
          className={ICON_BUTTON}
          aria-label={t('measure.copyItem', { name })}
          title={t('measure.copyItem', { name })}
          onClick={() =>
            navigator.clipboard.writeText(text).then(
              () => notify(t('measure.valuesCopied'), 'success'),
              () => notify(t('measure.clipboardFailed'), 'error'),
            )
          }
        >
          ⧉
        </button>
        <button className={ICON_BUTTON} aria-label={t('measure.deleteItem', { name })} title={t('measure.deleteItem', { name })} onClick={() => deleteMeasurements([annotation])}>
          🗑
        </button>
      </div>
      {row.lines.length > 0 && (
        <div data-testid="measurement-values" className="mt-0.5 font-mono text-xs leading-5 text-slate-300">
          {row.lines.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </div>
      )}
    </li>
  )
}

const BINS = 32

/** Distribution of the pixel values inside the selected region. */
function Histogram({ annotation }: { annotation: Annotation }) {
  const { t } = useTranslation()
  const result = measureAnnotation(annotation)
  if (!result?.values?.length || !result.stats) return null
  const { min, max } = result.stats
  const counts = histogram(result.values, BINS, min, max)
  const peak = Math.max(...counts)
  return (
    <figure className="border-t border-slate-800 p-3" aria-label={t('measure.histogram')}>
      <figcaption className="mb-1 text-xs text-slate-400">{t('measure.histogram')}</figcaption>
      <svg viewBox={`0 0 ${BINS} 40`} preserveAspectRatio="none" className="h-20 w-full" role="img" aria-label={t('measure.histogram')}>
        {counts.map((count, i) => (
          <rect key={i} x={i + 0.1} width={0.8} y={40 - (count / peak) * 40} height={(count / peak) * 40} className="fill-sky-500" />
        ))}
      </svg>
      <div className="flex justify-between font-mono text-[11px] text-slate-500">
        <span>{Math.round(min * 100) / 100}</span>
        <span>{Math.round(max * 100) / 100}</span>
      </div>
    </figure>
  )
}

function groupBySeries(rows: MeasurementRow[], mprTitle: string) {
  const groups = new Map<string, MeasurementRow[]>()
  for (const row of rows) {
    const series = row.location?.series
    const title = series ? `#${series.seriesNumber} ${series.modality} ${series.description}`.trim() : mprTitle
    groups.set(title, [...(groups.get(title) ?? []), row])
  }
  return [...groups].map(([title, rows]) => ({ title, rows: rows.sort((a, b) => (a.location?.index ?? 0) - (b.location?.index ?? 0)) }))
}
