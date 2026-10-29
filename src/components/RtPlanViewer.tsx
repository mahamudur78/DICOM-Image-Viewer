import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { DisplaySet } from '../dicom/types'
import { formatDate } from '../dicom/parse'
import { readObject } from '../objects/dicom'
import { parseRtPlan, type RtPlan } from '../objects/rtplan'
import { ViewportFrame } from './ViewportFrame'

interface Props {
  viewportId: string
  cell: number
  displaySet: DisplaySet
  active: boolean
  onActivate: () => void
  onToggleMaximize: () => void
}

const value = (v: number | undefined, unit = '') => (v === undefined || Number.isNaN(v) ? '—' : `${Math.round(v * 100) / 100}${unit}`)

/** An RT Plan's main facts: prescription, fractions and beams. */
export default function RtPlanViewer({ viewportId, displaySet, active, onActivate, onToggleMaximize }: Props) {
  const { t } = useTranslation()
  const [plan, setPlan] = useState<RtPlan | null>(null)
  const [error, setError] = useState<string | null>(null)
  const file = displaySet.series.images[0].file

  useEffect(() => {
    let cancelled = false
    readObject(file)
      .then((dataSet) => !cancelled && setPlan(parseRtPlan(dataSet)))
      .catch((reason: unknown) => !cancelled && setError(String(reason)))
    return () => {
      cancelled = true
    }
  }, [file])

  return (
    <ViewportFrame viewportId={viewportId} kind="document" active={active} onActivate={onActivate} onToggleMaximize={onToggleMaximize}>
      <article className="min-h-0 flex-1 overflow-auto bg-slate-900 p-4 text-sm text-slate-200" data-testid="rtplan-viewer">
        {error && <p className="text-red-300">{t('objects.failed', { error })}</p>}
        {plan && (
          <>
            <header className="mb-3 border-b border-slate-700 pb-2">
              <h2 className="text-base font-semibold text-slate-50">{plan.name || plan.label || t('objects.kinds.rtplan')}</h2>
              <p className="text-xs text-slate-400">
                {displaySet.study.patientName || t('viewport.anonymous')} · {plan.label} {plan.date && `· ${formatDate(plan.date)}`} {plan.intent && `· ${plan.intent}`}
              </p>
            </header>
            <dl className="mb-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
              {plan.prescriptions.map((p, i) => (
                <div key={i} className="contents">
                  <dt className="text-slate-400">{t('rtplan.prescription')}</dt>
                  <dd data-testid="rtplan-prescription">
                    {value(p.dose, ' Gy')} {p.description && `(${p.description})`}
                  </dd>
                </div>
              ))}
              <dt className="text-slate-400">{t('rtplan.fractions')}</dt>
              <dd data-testid="rtplan-fractions">{plan.fractions ?? '—'}</dd>
              {plan.prescriptions[0]?.dose && plan.fractions ? (
                <>
                  <dt className="text-slate-400">{t('rtplan.perFraction')}</dt>
                  <dd>{value(plan.prescriptions[0].dose / plan.fractions, ' Gy')}</dd>
                </>
              ) : null}
            </dl>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs" data-testid="rtplan-beams">
                <thead className="text-slate-400">
                  <tr>
                    {['beam', 'type', 'energy', 'gantry', 'collimator', 'couch', 'mu', 'machine'].map((column) => (
                      <th key={column} className="pr-3 font-normal">
                        {t(`rtplan.${column}`)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {plan.beams.map((beam) => (
                    <tr key={beam.number} className="border-t border-slate-800">
                      <td className="pr-3">
                        {beam.number}. {beam.name}
                      </td>
                      <td className="pr-3">
                        {beam.radiation} {beam.type}
                      </td>
                      <td className="pr-3">{value(beam.energy, beam.radiation === 'ELECTRON' ? ' MeV' : ' MV')}</td>
                      <td className="pr-3">
                        {value(beam.gantry, '°')}
                        {beam.gantryEnd !== undefined && ` → ${value(beam.gantryEnd, '°')}`}
                      </td>
                      <td className="pr-3">{value(beam.collimator, '°')}</td>
                      <td className="pr-3">{value(beam.couch, '°')}</td>
                      <td className="pr-3">{value(beam.meterset)}</td>
                      <td>{beam.machine}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </article>
    </ViewportFrame>
  )
}
