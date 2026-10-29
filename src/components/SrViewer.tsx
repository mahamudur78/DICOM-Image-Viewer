import dicomParser from 'dicom-parser'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { parseStructuredReport, type SrNode, type StructuredReport } from '../dicom/sr'
import { notify } from '../notifications/toastStore'
import { readSrMeasurements, type SrMeasurement } from '../objects/measurementSr'
import { showSrMeasurements } from '../objects/reports'
import type { DisplaySet } from '../dicom/types'
import { showReferencedImage } from '../store/viewerActions'
import { ViewportFrame } from './ViewportFrame'

interface SrViewerProps {
  viewportId: string
  cell: number
  displaySet: DisplaySet
  active: boolean
  onActivate: () => void
  onToggleMaximize: () => void
}

/** A structured report as readable text: headings for containers, "concept: value" lines for the rest. */
export default function SrViewer({ viewportId, cell, displaySet, active, onActivate, onToggleMaximize }: SrViewerProps) {
  const { t } = useTranslation()
  const file = displaySet.series.images[0].file
  const [report, setReport] = useState<StructuredReport | null>(null)
  const [measurements, setMeasurements] = useState<SrMeasurement[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    file
      .arrayBuffer()
      .then((buffer) => {
        if (cancelled) return
        const dataSet = dicomParser.parseDicom(new Uint8Array(buffer))
        setReport(parseStructuredReport(dataSet))
        setMeasurements(readSrMeasurements(dataSet))
      })
      .catch((reason: unknown) => !cancelled && setError(String(reason)))
    return () => {
      cancelled = true
    }
  }, [file])

  return (
    <ViewportFrame viewportId={viewportId} kind="sr" active={active} onActivate={onActivate} onToggleMaximize={onToggleMaximize}>
      <article className="min-h-0 flex-1 overflow-auto bg-slate-900 p-4 text-sm leading-relaxed text-slate-200">
        {error && <p className="text-red-300">{t('sr.failed', { error })}</p>}
        {report && (
          <>
            <header className="mb-3 border-b border-slate-700 pb-2">
              <h2 className="text-base font-semibold text-slate-50">{report.title}</h2>
              <p className="text-xs text-slate-400">
                {displaySet.study.patientName || t('viewport.anonymous')}
                {displaySet.study.studyDate && ` · ${displaySet.study.studyDate}`}
              </p>
              <p className="mt-1 flex flex-wrap gap-2 text-xs">
                {report.completion && <Badge ok={report.completion === 'COMPLETE'}>{t(`sr.completion.${report.completion}`, { defaultValue: report.completion })}</Badge>}
                {report.verification && <Badge ok={report.verification === 'VERIFIED'}>{t(`sr.verification.${report.verification}`, { defaultValue: report.verification })}</Badge>}
              </p>
            </header>
            {measurements.length > 0 && (
              <button
                className="mb-2 rounded bg-sky-600 px-3 py-1 text-xs text-white hover:bg-sky-500"
                onClick={() => {
                  const placed = showSrMeasurements(measurements, cell)
                  notify(placed ? t('sr.measurementsPlaced', { count: placed }) : t('sr.measurementsNotPlaced'), placed ? 'success' : 'info')
                }}
              >
                {t('sr.showMeasurements', { count: measurements.length })}
              </button>
            )}
            <Children nodes={report.root.children} cell={cell} />
          </>
        )}
      </article>
    </ViewportFrame>
  )
}

const Badge = ({ ok, children }: { ok: boolean; children: React.ReactNode }) => (
  <span className={`rounded px-1.5 py-0.5 ${ok ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-300'}`}>{children}</span>
)

function Children({ nodes, cell, depth = 0 }: { nodes: SrNode[]; cell: number; depth?: number }) {
  return (
    <ul className={depth ? 'ml-4 border-l border-slate-700 pl-3' : ''}>
      {nodes.map((node, i) => (
        <Node key={i} node={node} cell={cell} depth={depth} />
      ))}
    </ul>
  )
}

function Node({ node, cell, depth }: { node: SrNode; cell: number; depth: number }) {
  const { t } = useTranslation()
  if (node.valueType === 'CONTAINER') {
    return (
      <li className="mt-3">
        <h3 className="font-semibold text-sky-300">{node.concept}</h3>
        <Children nodes={node.children} cell={cell} depth={depth + 1} />
      </li>
    )
  }
  const context = node.relationship === 'HAS OBS CONTEXT' || node.relationship === 'HAS ACQ CONTEXT'
  return (
    <li className={`py-0.5 ${context ? 'text-xs text-slate-400' : ''}`}>
      {node.concept && <span className="text-slate-400">{node.concept}: </span>}
      {node.reference ? (
        <button
          className="text-sky-300 underline-offset-2 hover:underline"
          onClick={() => showReferencedImage(cell, node.reference!.sopInstanceUID, node.reference!.frames?.[0])}
        >
          {t('sr.showImage')}
        </button>
      ) : (
        <span className="whitespace-pre-wrap break-words">{node.value ?? `(${node.valueType})`}</span>
      )}
      {node.children.length > 0 && <Children nodes={node.children} cell={cell} depth={depth + 1} />}
    </li>
  )
}
