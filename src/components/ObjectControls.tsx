import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { DisplaySet, Series } from '../dicom/types'
import { objectKeysOf, overlayGrid, removeFusion, updateFusion, useFusion, type FusionSetting } from '../functional/fusionStore'
import { downloadText } from '../measurements/manage'
import { gridOfSeries } from '../objects/base'
import { readObject } from '../objects/dicom'
import { ISODOSE_LEVELS, dvh, dvhCsv, type DvhCurve } from '../objects/dose'
import { originalId } from '../objects/keyImages'
import { segmentVolumes, type LabelGrid } from '../objects/labels'
import { gridForContours, parseRtStruct, rasterize } from '../objects/rtstruct'
import { useViewer } from '../store/viewerStore'
import type { VolumeGrid } from '../volume/grid'

const BUTTON = 'rounded px-2 py-1 text-xs text-slate-300 hover:bg-slate-800 hover:text-white disabled:opacity-40'
const INPUT = 'rounded border border-slate-700 bg-slate-950 px-1 py-0.5 text-xs text-slate-200'

/** Segmentations, structures, dose and maps shown over a series, with their controls. */
export function ObjectOverlays({ base }: { base: DisplaySet }) {
  const seriesId = originalId(base.series)
  const keys = useFusion((s) => objectKeysOf(s.settings, seriesId).join('\n'))
  if (!keys) return null
  return (
    <div className="space-y-3" data-testid="object-overlays">
      {keys.split('\n').map((key) => (
        <ObjectControl key={key} objectKey={key} base={base} />
      ))}
    </div>
  )
}

function ObjectControl({ objectKey, base }: { objectKey: string; base: DisplaySet }) {
  const { t } = useTranslation()
  const setting = useFusion((s) => s.settings[objectKey])
  if (!setting) return null
  const { style } = setting
  return (
    <section className="space-y-2 rounded border border-slate-800 p-2" aria-label={setting.overlay.series.description}>
      <header className="flex items-center gap-2 text-xs">
        <input type="checkbox" aria-label={t('fusion.visible')} checked={setting.visible} onChange={(e) => updateFusion(objectKey, { visible: e.target.checked })} />
        <span className="font-semibold text-slate-200">{t(`objects.kinds.${setting.overlay.series.kind}`)}</span>
        <span className="truncate text-slate-400">{setting.overlay.series.description}</span>
        <button className={`${BUTTON} ml-auto`} onClick={() => removeFusion(objectKey)} aria-label={t('objects.removeOverlay')}>
          ✕
        </button>
      </header>
      <label className="flex items-center justify-between gap-2 text-xs text-slate-300">
        {t('fusion.opacity', { percent: Math.round(style.opacity * 100) })}
        <input aria-label={t('fusion.opacityLabel')} type="range" min={0} max={1} step={0.05} value={style.opacity} onChange={(e) => updateFusion(objectKey, { style: { ...style, opacity: Number(e.target.value) } })} />
      </label>
      {setting.mode === 'labels' && <SegmentList objectKey={objectKey} setting={setting} />}
      {setting.mode === 'dose' && <DoseControls objectKey={objectKey} setting={setting} base={base} />}
      {setting.mode === 'colormap' && (
        <p className="text-xs text-slate-400">
          {t('objects.mapRange', { lower: Math.round(style.lower * 100) / 100, upper: Math.round(style.upper * 100) / 100 })}
        </p>
      )}
    </section>
  )
}

function SegmentList({ objectKey, setting }: { objectKey: string; setting: FusionSetting }) {
  const { t } = useTranslation()
  const segments = useMemo(() => setting.segments ?? [], [setting.segments])
  const volumes = useMemo(() => {
    const grid = setting.volumeId ? overlayGrid(setting.volumeId) : null
    return grid ? segmentVolumes({ grid, segments }) : []
  }, [setting.volumeId, segments])
  const setSegment = (bit: number, change: Partial<(typeof segments)[number]>) => updateFusion(objectKey, { segments: segments.map((s) => (s.bit === bit ? { ...s, ...change } : s)) })
  return (
    <ul className="space-y-1 text-xs" data-testid="segment-list">
      {segments.map((segment, i) => (
        <li key={segment.bit} className="flex items-center gap-2">
          <input type="checkbox" aria-label={t('objects.showSegment', { name: segment.label })} checked={segment.visible} onChange={(e) => setSegment(segment.bit, { visible: e.target.checked })} />
          <input
            type="color"
            aria-label={t('objects.segmentColor', { name: segment.label })}
            className="h-4 w-5 cursor-pointer border-0 bg-transparent p-0"
            value={`#${segment.color.map((c) => c.toString(16).padStart(2, '0')).join('')}`}
            onChange={(e) => setSegment(segment.bit, { color: [1, 3, 5].map((n) => parseInt(e.target.value.slice(n, n + 2), 16)) as [number, number, number] })}
          />
          <span className="truncate text-slate-200">{segment.label}</span>
          {segment.automatic && (
            <span className="rounded bg-fuchsia-600 px-1 text-[10px] font-bold text-white" title={segment.algorithm ?? t('objects.aiHint')}>
              AI
            </span>
          )}
          <span className="ml-auto text-slate-400">{volumes[i] ? t('objects.volume', { value: Math.round(volumes[i].volume * 100) / 100 }) : ''}</span>
        </li>
      ))}
    </ul>
  )
}

function DoseControls({ objectKey, setting, base }: { objectKey: string; setting: FusionSetting; base: DisplaySet }) {
  const { t } = useTranslation()
  const dose = setting.dose!
  const studies = useViewer((s) => s.studies)
  const structures = useMemo(() => studies.flatMap((study) => study.series.filter((s) => s.kind === 'rtstruct').map((series) => ({ study, series }))), [studies])
  const [curves, setCurves] = useState<DvhCurve[] | null>(null)
  const set = (change: Partial<typeof dose>) => updateFusion(objectKey, { dose: { ...dose, ...change } })

  const computeDvh = async (structure: Series) => {
    const doseGrid = setting.volumeId ? overlayGrid(setting.volumeId) : null
    if (!doseGrid) return
    // Structures already shown keep their grid; otherwise they are filled on the images' grid.
    const shown = useFusion.getState().settings[`obj:${originalId(base.series)}|${structure.id}`]
    const shownGrid = shown?.volumeId ? overlayGrid(shown.volumeId) : null
    let labels: LabelGrid
    if (shownGrid && shown?.segments) labels = { grid: shownGrid, segments: shown.segments }
    else {
      const set = parseRtStruct(await readObject(structure.images[0].file))
      labels = rasterize(set, gridOfSeries(base.series) ?? gridForContours(set))
    }
    setCurves(dvh(labels, doseGrid as VolumeGrid))
  }

  return (
    <div className="space-y-2 text-xs text-slate-300">
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={dose.wash} onChange={(e) => set({ wash: e.target.checked })} />
        {t('objects.colorWash')}
      </label>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={dose.isodose} onChange={(e) => set({ isodose: e.target.checked })} />
        {t('objects.isodose')}
      </label>
      <label className="flex items-center justify-between gap-2">
        {t('objects.referenceDose')}
        <input aria-label={t('objects.referenceDose')} type="number" step="any" min={0} value={Math.round(dose.reference * 100) / 100} onChange={(e) => set({ reference: Math.max(0.01, Number(e.target.value)) })} className={`${INPUT} w-20`} />
      </label>
      {dose.isodose && (
        <ul className="flex flex-wrap gap-x-2 gap-y-0.5" data-testid="isodose-legend">
          {ISODOSE_LEVELS.map((level) => (
            <li key={level.percent} className="flex items-center gap-1">
              <span className="inline-block h-0.5 w-3" style={{ background: level.color }} />
              {level.percent}% ({Math.round((dose.reference * level.percent) / 10) / 10} Gy)
            </li>
          ))}
        </ul>
      )}
      {structures.map(({ series }) => (
        <button key={series.id} className={BUTTON} onClick={() => void computeDvh(series)}>
          {t('objects.dvhWith', { name: series.description })}
        </button>
      ))}
      {curves && <DvhChart curves={curves} />}
    </div>
  )
}

function DvhChart({ curves }: { curves: DvhCurve[] }) {
  const { t } = useTranslation()
  const W = 280
  const H = 160
  const PAD = 28
  const top = Math.max(...curves.map((c) => c.points.at(-1)!.dose)) || 1
  const x = (d: number) => PAD + ((W - PAD - 6) * d) / top
  const y = (p: number) => H - PAD - ((H - PAD - 6) * p) / 100
  const color = (c: DvhCurve) => `rgb(${c.segment.color.join(',')})`
  const r = (v: number) => Math.round(v * 100) / 100
  return (
    <div className="space-y-2" data-testid="dvh">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded bg-slate-950" role="img" aria-label={t('objects.dvh')}>
        <line x1={PAD} y1={H - PAD} x2={W - 6} y2={H - PAD} stroke="#475569" />
        <line x1={PAD} y1={6} x2={PAD} y2={H - PAD} stroke="#475569" />
        <text x={W - 6} y={H - 8} textAnchor="end" fontSize="9" fill="#94a3b8">
          {t('objects.dvhDose', { max: r(top) })}
        </text>
        <text x={PAD - 3} y={12} textAnchor="end" fontSize="9" fill="#94a3b8">
          100%
        </text>
        {curves.map((c) => (
          <polyline key={c.segment.bit} fill="none" stroke={color(c)} strokeWidth="1.5" points={c.points.map((p) => `${x(p.dose)},${y(p.percent)}`).join(' ')} />
        ))}
      </svg>
      <table className="w-full text-left text-xs" data-testid="dvh-table">
        <thead className="text-slate-500">
          <tr>
            <th>{t('objects.structure')}</th>
            <th>{t('objects.volumeHeader')}</th>
            <th>Dmean</th>
            <th>Dmax</th>
            <th>D95</th>
          </tr>
        </thead>
        <tbody>
          {curves.map((c) => (
            <tr key={c.segment.bit}>
              <td style={{ color: color(c) }}>{c.segment.label}</td>
              <td>{r(c.volume)} cm³</td>
              <td>{r(c.mean)}</td>
              <td>{r(c.max)}</td>
              <td>{r(c.d95)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <button className={BUTTON} onClick={() => downloadText(dvhCsv(curves), 'dvh.csv', 'text/csv')}>
        {t('objects.dvhCsv')}
      </button>
    </div>
  )
}
