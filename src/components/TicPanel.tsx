import { imageLoader } from '@cornerstonejs/core'
import type { Annotation } from '@cornerstonejs/tools/types'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { phasesOf } from '../functional/series'
import { sameSliceInPhase } from '../functional/phases'
import { analyzeCurve, curvesCsv, type CurvePoint } from '../functional/tic'
import { round } from '../measurements/geometry'
import { downloadText, measurementsInSeries, useMeasurementVersion } from '../measurements/manage'
import { pixelValues, roiPixels } from '../measurements/measure'
import { selectCurrentDisplaySet, useViewer } from '../store/viewerStore'

const BUTTON = 'rounded px-2 py-1 text-xs text-slate-300 hover:bg-slate-800 hover:text-white disabled:opacity-40'
const COLORS = ['#38bdf8', '#f97316', '#a3e635', '#f472b6', '#facc15', '#c084fc']

interface Curve {
  name: string
  points: CurvePoint[]
}

/** Mean of the ROI's pixels on the same slice in every phase. */
async function curveOf(annotation: Annotation, imageIds: string[], phases: NonNullable<ReturnType<typeof phasesOf>>): Promise<CurvePoint[] | null> {
  const roi = roiPixels(annotation)
  if (!roi || !roi.indexes.length) return null
  const index = imageIds.indexOf(roi.imageId)
  if (index < 0) return null
  const points: CurvePoint[] = []
  for (let phase = 0; phase < phases.byPhase.length; phase++) {
    const imageId = imageIds[sameSliceInPhase(phases, index, phase)]
    if (!imageId) return null
    await imageLoader.loadAndCacheImage(imageId)
    const value = pixelValues(imageId)
    if (!value) return null
    let sum = 0
    for (const i of roi.indexes) sum += value(i)
    points.push({ t: phases.times[phase], value: sum / roi.indexes.length })
  }
  return points
}

/** Time-intensity curves of the ROIs drawn on a dynamic series. */
export function TicPanel() {
  const { t } = useTranslation()
  const base = useViewer(selectCurrentDisplaySet)
  // Measurements live in Cornerstone's state; the version changes with them.
  const version = useMeasurementVersion((s) => s.version)
  const series = base?.series
  const phases = phasesOf(series)
  const rois = useMemo(() => (phases && series && version >= 0 ? measurementsInSeries(series).filter((a) => roiPixels(a)) : []), [series, phases, version])
  // The version also changes as images load; curves are only recomputed when an ROI moves or changes.
  const roiKey = JSON.stringify(rois.map((a) => [a.annotationUID, (a.data as { label?: string }).label, a.data.handles?.points, a.data.contour?.polyline]))
  const [curves, setCurves] = useState<Curve[]>([])

  useEffect(() => {
    if (!phases || !series) return
    let cancelled = false
    const imageIds = series.images.map((image) => image.imageId)
    void Promise.all(rois.map((annotation) => curveOf(annotation, imageIds, phases))).then((list) => {
      if (cancelled) return
      setCurves(list.flatMap((points, i) => (points ? [{ name: (rois[i].data as { label?: string }).label || `ROI ${i + 1}`, points }] : [])))
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `roiKey` stands for `rois`
  }, [roiKey, phases, series])

  if (!series) return <p className="p-3 text-sm text-slate-500">{t('fusion.noSeries')}</p>
  if (!phases) return <p className="p-3 text-sm text-slate-500">{t('tic.notDynamic')}</p>
  const shown = rois.length ? curves : []

  return (
    <div className="h-full space-y-3 overflow-y-auto p-3 text-sm" data-testid="tic-panel">
      <p className="text-xs text-slate-400">{t('tic.phases', { count: phases.byPhase.length, slices: phases.byPhase[0].length })}</p>
      {!rois.length && <p className="text-xs text-slate-500">{t('tic.drawRoi')}</p>}
      {shown.length > 0 && (
        <>
          <Chart curves={shown} timed={phases.timed} />
          <table className="w-full text-left text-xs text-slate-300" data-testid="tic-table">
            <thead className="text-slate-500">
              <tr>
                <th>{t('tic.roi')}</th>
                <th>{t('tic.type')}</th>
                <th>{t('tic.enhancement')}</th>
                <th>{t('tic.timeToPeak')}</th>
                <th>{t('tic.washOut')}</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((curve, i) => {
                const analysis = analyzeCurve(curve.points)
                return (
                  <tr key={i}>
                    <td style={{ color: COLORS[i % COLORS.length] }}>{curve.name}</td>
                    <td data-testid="tic-type">{analysis ? t(`tic.types.${analysis.type}`) : '—'}</td>
                    <td>{analysis ? `${round(analysis.initialEnhancement)}%` : '—'}</td>
                    <td>{analysis ? `${round(analysis.timeToPeak)} ${phases.timed ? 's' : ''}` : '—'}</td>
                    <td>{analysis ? `${round(analysis.washOut)}%/min` : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <button className={BUTTON} onClick={() => downloadText(curvesCsv(shown), 'time-intensity.csv', 'text/csv')}>
            {t('tic.exportCsv')}
          </button>
        </>
      )}
    </div>
  )
}

function Chart({ curves, timed }: { curves: Curve[]; timed: boolean }) {
  const { t } = useTranslation()
  const W = 280
  const H = 160
  const PAD = 28
  const all = curves.flatMap((c) => c.points)
  const tMax = Math.max(...all.map((p) => p.t)) || 1
  const vMin = Math.min(...all.map((p) => p.value))
  const vMax = Math.max(...all.map((p) => p.value))
  const span = vMax - vMin || 1
  const x = (time: number) => PAD + ((W - PAD - 6) * time) / tMax
  const y = (value: number) => H - PAD - ((H - PAD - 6) * (value - vMin)) / span
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded bg-slate-950" role="img" aria-label={t('tic.chart')} data-testid="tic-chart">
      <line x1={PAD} y1={H - PAD} x2={W - 6} y2={H - PAD} stroke="#475569" />
      <line x1={PAD} y1={6} x2={PAD} y2={H - PAD} stroke="#475569" />
      <text x={W - 6} y={H - 8} textAnchor="end" fontSize="9" fill="#94a3b8">
        {timed ? t('tic.timeAxis', { max: round(tMax) }) : t('tic.phaseAxis')}
      </text>
      <text x={PAD - 3} y={12} textAnchor="end" fontSize="9" fill="#94a3b8">
        {round(vMax)}
      </text>
      <text x={PAD - 3} y={H - PAD} textAnchor="end" fontSize="9" fill="#94a3b8">
        {round(vMin)}
      </text>
      {curves.map((curve, i) => (
        <g key={i} stroke={COLORS[i % COLORS.length]} fill={COLORS[i % COLORS.length]}>
          <polyline fill="none" strokeWidth="1.5" points={curve.points.map((p) => `${x(p.t)},${y(p.value)}`).join(' ')} />
          {curve.points.map((p, n) => (
            <circle key={n} cx={x(p.t)} cy={y(p.value)} r="2" />
          ))}
        </g>
      ))}
    </svg>
  )
}
