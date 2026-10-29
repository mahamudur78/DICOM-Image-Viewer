// Dialogs for exporting, printing, anonymizing, converting and editing tags.
// Loaded on first use; each remembers its last choices.
import type { DicomDict } from 'dcmjs'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { getViewport } from '../cornerstone/viewer'
import { viewportKind } from '../cornerstone/viewportRegistry'
import { closeDialog } from '../dialogs/dialogStore'
import { INPUT, Modal, PRIMARY, SECONDARY } from '../dialogs/Modal'
import { allMeasurements } from '../measurements/manage'
import { notify } from '../notifications/toastStore'
import { useSettings } from '../store/settingsStore'
import { selectCurrentDisplaySet, selectTargetViewportId, useViewer } from '../store/viewerStore'
import { DEFAULT_ANONYMIZE, type AnonymizeOptions } from './anonymize'
import { convertToDicom } from './convert'
import { displayValue, isEditable, normalizeTag } from './dicomValues'
import { editFile, readDicom, vrOf } from './dicomEdit'
import { ExportCancelled, MovieUnsupported, exportImages, exportMovie, type ImageFormat, type ImageScope, type MovieFormat, type Progress } from './exportImages'
import { downloadBlob } from './files'
import { anonymizeFiles, type AnonymizeReport, type FileScope } from './jobs'
import { PER_PAGE, type Orientation, type Paper, type PerPage } from './layout'
import { exportPdf, printImages } from './print'

export type ExportDialogKind = 'images' | 'movie' | 'print' | 'anonymize' | 'convert' | 'tagEdit'

export default function ExportDialog({ kind }: { kind: ExportDialogKind }) {
  switch (kind) {
    case 'images':
      return <ImagesDialog />
    case 'movie':
      return <MovieDialog />
    case 'print':
      return <PrintDialog />
    case 'anonymize':
      return <AnonymizeDialog />
    case 'convert':
      return <ConvertDialog />
    case 'tagEdit':
      return <TagEditDialog />
  }
}

// --- shared pieces ---------------------------------------------------------------------

type Prefs = Record<string, string | number | boolean>

type Widen<T> = { [K in keyof T]: T[K] extends boolean ? boolean : T[K] extends number ? number : string }

/** Dialog choices, remembered in settings under the dialog's name. */
function usePrefs<T extends Prefs>(dialog: string, defaults: T): [Widen<T>, (change: Partial<Widen<T>>) => void] {
  const stored = useSettings((s) => s.exportPrefs[dialog])
  const prefs = { ...defaults, ...(stored as Partial<T>) } as Widen<T>
  return [prefs, (change) => useSettings.getState().setExportPrefs(dialog, { ...prefs, ...change } as Prefs)]
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex items-center justify-between gap-3 text-sm text-slate-300">
      <span>{label}</span>
      {children}
    </label>
  )
}

function Check({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className={`flex items-center gap-2 text-sm text-slate-300 ${disabled ? 'opacity-40' : ''}`}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  )
}

const SELECT = 'rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100'

function Select<T extends string | number>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string; disabled?: boolean }[]; onChange: (v: T) => void }) {
  return (
    <Field label={label}>
      <select aria-label={label} value={String(value)} onChange={(e) => onChange(options.find((o) => String(o.value) === e.target.value)!.value)} className={SELECT}>
        {options.map((o) => (
          <option key={String(o.value)} value={String(o.value)} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  )
}

/** Runs a job with a progress bar and a cancel button; closes the dialog when done. */
function useJob() {
  const { t } = useTranslation()
  const [progress, setProgress] = useState<Progress | null>(null)
  const controller = useRef<AbortController | null>(null)
  const run = async (job: (onProgress: (p: Progress) => void, signal: AbortSignal) => Promise<unknown>, done?: (result: unknown) => void) => {
    controller.current = new AbortController()
    setProgress({ done: 0, total: 1 })
    try {
      const result = await job(setProgress, controller.current.signal)
      if (done) done(result)
      else closeDialog()
    } catch (error) {
      if (error instanceof ExportCancelled) notify(t('export.cancelled'), 'info')
      else if (error instanceof MovieUnsupported) notify(t('export.codecUnsupported', { format: error.message.toUpperCase() }), 'error')
      else notify(t('export.failed', { error: error instanceof Error ? error.message : String(error) }), 'error')
    } finally {
      setProgress(null)
    }
  }
  const bar = progress && (
    <div className="space-y-1" role="status" aria-label={t('export.working')}>
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
        <div className="h-full bg-sky-500 transition-[width]" style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }} />
      </div>
      <div className="flex items-center justify-between text-xs text-slate-400">
        {t('export.progress', { done: progress.done, total: progress.total })}
        <button className={SECONDARY} onClick={() => controller.current?.abort()}>
          {t('dialogs.cancel')}
        </button>
      </div>
    </div>
  )
  return { run, busy: progress !== null, bar }
}

function Footer({ busy, children }: { busy: boolean; children: ReactNode }) {
  const { t } = useTranslation()
  return (
    <div className="flex justify-end gap-2 border-t border-slate-800 p-3">
      <button className={SECONDARY} onClick={closeDialog} disabled={busy}>
        {t('dialogs.cancel')}
      </button>
      {children}
    </div>
  )
}

/** What the target viewport shows: whether it is a stack, and how many images. */
function useTarget() {
  const state = useViewer.getState()
  const viewportId = selectTargetViewportId(state)
  const displaySet = selectCurrentDisplaySet(state)
  const stack = viewportId !== null && viewportKind(viewportId) === 'stack'
  const count = displaySet?.series.images.length ?? 1
  const index = viewportId ? (getViewport(viewportId)?.getCurrentImageIdIndex?.() ?? 0) : 0
  return { stack, count, index, displaySet, grid: !state.volumeView }
}

function RenderChecks({ prefs, set }: { prefs: { annotations: boolean; overlays: boolean; info: boolean }; set: (c: Partial<{ annotations: boolean; overlays: boolean; info: boolean }>) => void }) {
  const { t } = useTranslation()
  const privacy = useSettings((s) => s.display.privacy)
  return (
    <div className="space-y-1">
      <Check label={t('export.annotations')} checked={prefs.annotations} onChange={(annotations) => set({ annotations })} />
      <Check label={t('export.overlays')} checked={prefs.overlays} onChange={(overlays) => set({ overlays })} />
      <Check label={privacy ? t('export.infoPrivate') : t('export.info')} checked={prefs.info} onChange={(info) => set({ info })} />
    </div>
  )
}

function RangeFields({ from, to, count, onChange }: { from: number; to: number; count: number; onChange: (from: number, to: number) => void }) {
  const { t } = useTranslation()
  const clamp = (n: number) => Math.max(1, Math.min(count, Math.round(n) || 1))
  return (
    <Field label={t('export.range', { count })}>
      <span className="flex items-center gap-1">
        <input aria-label={t('export.from')} type="number" min={1} max={count} value={from} onChange={(e) => onChange(clamp(Number(e.target.value)), to)} className={`${SELECT} w-20`} />
        –
        <input aria-label={t('export.to')} type="number" min={1} max={count} value={to} onChange={(e) => onChange(from, clamp(Number(e.target.value)))} className={`${SELECT} w-20`} />
      </span>
    </Field>
  )
}

// --- images ------------------------------------------------------------------------------

function ImagesDialog() {
  const { t } = useTranslation()
  const target = useTarget()
  const [prefs, set] = usePrefs('images', { format: 'png', quality: 90, scope: 'current', native: false, annotations: true, overlays: true, info: false })
  const [range, setRange] = useState({ from: 1, to: target.count })
  const { run, busy, bar } = useJob()
  const scope = (prefs.scope === 'series' && (!target.stack || target.count < 2)) || (prefs.scope === 'visible' && !target.grid) ? 'current' : (prefs.scope as ImageScope)

  return (
    <Modal title={t('export.imagesTitle')} onClose={closeDialog}>
      <div className="space-y-3 overflow-auto p-4">
        <Select
          label={t('export.format')}
          value={prefs.format as ImageFormat}
          options={(['png', 'jpeg', 'webp', 'bmp', 'tiff'] as const).map((f) => ({ value: f, label: f.toUpperCase() }))}
          onChange={(format) => set({ format })}
        />
        {(prefs.format === 'jpeg' || prefs.format === 'webp') && (
          <Field label={t('export.quality', { quality: prefs.quality })}>
            <input aria-label={t('export.quality', { quality: prefs.quality })} type="range" min={10} max={100} value={prefs.quality} onChange={(e) => set({ quality: Number(e.target.value) })} />
          </Field>
        )}
        <Select
          label={t('export.scope')}
          value={scope}
          options={[
            { value: 'current' as const, label: t('export.scopeCurrent') },
            { value: 'series' as const, label: t('export.scopeSeries'), disabled: !target.stack || target.count < 2 },
            { value: 'visible' as const, label: t('export.scopeVisible'), disabled: !target.grid },
          ]}
          onChange={(value) => set({ scope: value })}
        />
        {scope === 'series' && <RangeFields from={range.from} to={range.to} count={target.count} onChange={(from, to) => setRange({ from, to })} />}
        <Select
          label={t('export.size')}
          value={prefs.native && target.stack ? 'native' : 'screen'}
          options={[
            { value: 'screen', label: t('export.sizeScreen') },
            { value: 'native', label: t('export.sizeNative'), disabled: !target.stack },
          ]}
          onChange={(value) => set({ native: value === 'native' })}
        />
        <RenderChecks prefs={prefs} set={set} />
        {bar}
      </div>
      <Footer busy={busy}>
        <button
          className={PRIMARY}
          disabled={busy}
          onClick={() =>
            run((onProgress, signal) =>
              exportImages(
                { format: prefs.format as ImageFormat, quality: prefs.quality / 100, scope, from: range.from, to: range.to, native: prefs.native && target.stack, annotations: prefs.annotations, overlays: prefs.overlays, info: prefs.info },
                onProgress,
                signal,
              ),
            )
          }
        >
          {t('export.save')}
        </button>
      </Footer>
    </Modal>
  )
}

// --- movie ---------------------------------------------------------------------------------

function MovieDialog() {
  const { t } = useTranslation()
  const target = useTarget()
  const [prefs, set] = usePrefs('movie', { format: 'mp4', fps: Math.round(target.displaySet?.series.frameRate ?? 10), native: false, annotations: true, overlays: true, info: true })
  const [range, setRange] = useState({ from: 1, to: target.count })
  const { run, busy, bar } = useJob()
  const possible = target.stack && target.count > 1

  return (
    <Modal title={t('export.movieTitle')} onClose={closeDialog}>
      <div className="space-y-3 overflow-auto p-4">
        {!possible && <p className="text-sm text-amber-300">{t('export.movieNeedsSeries')}</p>}
        <Select
          label={t('export.format')}
          value={prefs.format as MovieFormat}
          options={[
            { value: 'mp4' as const, label: 'MP4' },
            { value: 'webm' as const, label: 'WebM' },
            { value: 'gif' as const, label: 'GIF' },
            { value: 'avi' as const, label: 'AVI (MJPEG)' },
          ]}
          onChange={(format) => set({ format })}
        />
        <p className="text-xs text-slate-500">{t('export.noWmv')}</p>
        <Field label={t('export.fps')}>
          <input aria-label={t('export.fps')} type="number" min={1} max={60} value={prefs.fps} onChange={(e) => set({ fps: Math.max(1, Math.min(60, Number(e.target.value) || 1)) })} className={`${SELECT} w-20`} />
        </Field>
        <RangeFields from={range.from} to={range.to} count={target.count} onChange={(from, to) => setRange({ from, to })} />
        <Select
          label={t('export.size')}
          value={prefs.native ? 'native' : 'screen'}
          options={[
            { value: 'screen', label: t('export.sizeScreen') },
            { value: 'native', label: t('export.sizeNative') },
          ]}
          onChange={(value) => set({ native: value === 'native' })}
        />
        <RenderChecks prefs={prefs} set={set} />
        {bar}
      </div>
      <Footer busy={busy}>
        <button
          className={PRIMARY}
          disabled={busy || !possible}
          onClick={() =>
            run((onProgress, signal) =>
              exportMovie({ format: prefs.format as MovieFormat, fps: prefs.fps, from: range.from, to: range.to, native: prefs.native, annotations: prefs.annotations, overlays: prefs.overlays, info: prefs.info }, onProgress, signal),
            )
          }
        >
          {t('export.save')}
        </button>
      </Footer>
    </Modal>
  )
}

// --- print and PDF ---------------------------------------------------------------------------

function PrintDialog() {
  const { t } = useTranslation()
  const target = useTarget()
  const [prefs, set] = usePrefs('print', {
    perPage: 4,
    paper: 'A4',
    orientation: 'portrait',
    header: true,
    footer: true,
    trueSize: false,
    scope: 'current',
    annotations: true,
    overlays: true,
    info: false,
  })
  const [range, setRange] = useState({ from: 1, to: target.count })
  const { run, busy, bar } = useJob()
  const scope = (prefs.scope === 'series' && (!target.stack || target.count < 2)) || (prefs.scope === 'visible' && !target.grid) ? 'current' : (prefs.scope as ImageScope)
  const options = () => ({
    perPage: prefs.perPage as PerPage,
    paper: prefs.paper as Paper,
    orientation: prefs.orientation as Orientation,
    header: prefs.header,
    footer: prefs.footer,
    trueSize: prefs.trueSize && target.stack && scope !== 'visible',
    scope,
    from: range.from,
    to: range.to,
    native: false,
    annotations: prefs.annotations,
    overlays: prefs.overlays,
    info: prefs.info,
  })

  return (
    <Modal title={t('print.title')} onClose={closeDialog}>
      <div className="space-y-3 overflow-auto p-4">
        <Select
          label={t('export.scope')}
          value={scope}
          options={[
            { value: 'current' as const, label: t('export.scopeCurrent') },
            { value: 'series' as const, label: t('export.scopeSeries'), disabled: !target.stack || target.count < 2 },
            { value: 'visible' as const, label: t('export.scopeVisible'), disabled: !target.grid },
          ]}
          onChange={(value) => set({ scope: value })}
        />
        {scope === 'series' && <RangeFields from={range.from} to={range.to} count={target.count} onChange={(from, to) => setRange({ from, to })} />}
        <Select label={t('print.perPage')} value={prefs.perPage as PerPage} options={PER_PAGE.map((n) => ({ value: n, label: String(n) }))} onChange={(perPage) => set({ perPage })} />
        <Select label={t('print.paper')} value={prefs.paper as Paper} options={[{ value: 'A4' as const, label: 'A4' }, { value: 'Letter' as const, label: 'Letter' }]} onChange={(paper) => set({ paper })} />
        <Select
          label={t('print.orientation')}
          value={prefs.orientation as Orientation}
          options={[
            { value: 'portrait' as const, label: t('print.portrait') },
            { value: 'landscape' as const, label: t('print.landscape') },
          ]}
          onChange={(orientation) => set({ orientation })}
        />
        <Check label={t('print.header')} checked={prefs.header} onChange={(header) => set({ header })} />
        <Check label={t('print.footer')} checked={prefs.footer} onChange={(footer) => set({ footer })} />
        <Check label={t('print.trueSize')} checked={prefs.trueSize} disabled={!target.stack || scope === 'visible'} onChange={(trueSize) => set({ trueSize })} />
        <RenderChecks prefs={prefs} set={set} />
        {bar}
      </div>
      <Footer busy={busy}>
        <button className={SECONDARY} disabled={busy} onClick={() => run((onProgress, signal) => exportPdf(options(), onProgress, signal))}>
          {t('print.savePdf')}
        </button>
        <button className={PRIMARY} disabled={busy} onClick={() => run((onProgress, signal) => printImages(options(), onProgress, signal))}>
          {t('print.print')}
        </button>
      </Footer>
    </Modal>
  )
}

// --- anonymize -------------------------------------------------------------------------------

const BURNED_IN_MODALITIES = ['US', 'SC', 'ES', 'XC', 'OT', 'GM', 'SM', 'DOC']

function AnonymizeDialog() {
  const { t } = useTranslation()
  const target = useTarget()
  const templates = useSettings((s) => s.anonymizeTemplates)
  const [prefs, set] = usePrefs('anonymize', { scope: 'series', ...DEFAULT_ANONYMIZE })
  const [report, setReport] = useState<AnonymizeReport | null>(null)
  const [templateName, setTemplateName] = useState('')
  const { run, busy, bar } = useJob()
  const options = (): AnonymizeOptions => ({
    patientName: prefs.patientName,
    patientId: prefs.patientId,
    retainDates: prefs.retainDates,
    retainDescriptions: prefs.retainDescriptions,
    keepPrivate: prefs.keepPrivate,
    keepUids: prefs.keepUids,
  })
  const modality = target.displaySet?.series.modality ?? ''
  const redactions = allMeasurements().filter((a) => a.metadata?.toolName === 'Redaction').length

  if (report) {
    const counts = report.changes.flatMap((f) => f.changes).reduce<Record<string, number>>((acc, c) => ({ ...acc, [c.action]: (acc[c.action] ?? 0) + 1 }), {})
    return (
      <Modal title={t('anonymize.doneTitle')} onClose={closeDialog}>
        <div className="space-y-2 overflow-auto p-4 text-sm text-slate-300" data-testid="anonymize-report">
          <p>{t('anonymize.done', { count: report.files })}</p>
          <ul className="list-disc pl-5">
            {Object.entries(counts).map(([action, count]) => (
              <li key={action}>{t(`anonymize.action.${action}`, { count })}</li>
            ))}
          </ul>
          {report.redactedFiles > 0 && <p>{t('anonymize.redacted', { count: report.redactedFiles })}</p>}
          <p className="text-xs text-slate-500">{t('anonymize.reportFile')}</p>
        </div>
        <Footer busy={false}>
          <button className={PRIMARY} onClick={closeDialog}>
            {t('dialogs.close')}
          </button>
        </Footer>
      </Modal>
    )
  }

  return (
    <Modal title={t('anonymize.title')} onClose={closeDialog}>
      <div className="space-y-3 overflow-auto p-4">
        {(BURNED_IN_MODALITIES.includes(modality) || redactions > 0) && (
          <p role="alert" className="rounded-md bg-amber-500/10 p-2 text-sm text-amber-200">
            {redactions > 0 ? t('anonymize.redactionsApplied', { count: redactions }) : t('anonymize.burnedIn', { modality })}
          </p>
        )}
        {templates.length > 0 && (
          <Select
            label={t('anonymize.template')}
            value=""
            options={[{ value: '', label: '—' }, ...templates.map((tpl) => ({ value: tpl.name, label: tpl.name }))]}
            onChange={(name) => {
              const template = templates.find((tpl) => tpl.name === name)
              if (template) set(template.options as Partial<typeof prefs>)
            }}
          />
        )}
        <Select
          label={t('anonymize.scope')}
          value={prefs.scope as FileScope}
          options={[
            { value: 'image' as const, label: t('anonymize.scopeImage') },
            { value: 'series' as const, label: t('anonymize.scopeSeries') },
            { value: 'study' as const, label: t('anonymize.scopeStudy') },
            { value: 'all' as const, label: t('anonymize.scopeAll') },
          ]}
          onChange={(scope) => set({ scope })}
        />
        <Field label={t('anonymize.patientName')}>
          <input aria-label={t('anonymize.patientName')} value={prefs.patientName} onChange={(e) => set({ patientName: e.target.value })} className={`${INPUT} w-48`} />
        </Field>
        <Field label={t('anonymize.patientId')}>
          <input aria-label={t('anonymize.patientId')} value={prefs.patientId} onChange={(e) => set({ patientId: e.target.value })} className={`${INPUT} w-48`} />
        </Field>
        <Check label={t('anonymize.retainDates')} checked={prefs.retainDates} onChange={(retainDates) => set({ retainDates })} />
        <Check label={t('anonymize.retainDescriptions')} checked={prefs.retainDescriptions} onChange={(retainDescriptions) => set({ retainDescriptions })} />
        <Check label={t('anonymize.keepPrivate')} checked={prefs.keepPrivate} onChange={(keepPrivate) => set({ keepPrivate })} />
        <Check label={t('anonymize.keepUids')} checked={prefs.keepUids} onChange={(keepUids) => set({ keepUids })} />
        <div className="flex items-center gap-2 border-t border-slate-800 pt-3">
          <input aria-label={t('anonymize.templateName')} placeholder={t('anonymize.templateName')} value={templateName} onChange={(e) => setTemplateName(e.target.value)} className={`${INPUT} flex-1`} />
          <button
            className={SECONDARY}
            disabled={!templateName.trim()}
            onClick={() => {
              const { scope: _scope, ...rest } = prefs
              void _scope
              useSettings.getState().saveAnonymizeTemplate(templateName.trim(), rest)
              setTemplateName('')
            }}
          >
            {t('anonymize.saveTemplate')}
          </button>
        </div>
        {bar}
      </div>
      <Footer busy={busy}>
        <button
          className={PRIMARY}
          disabled={busy}
          onClick={() => run((onProgress, signal) => anonymizeFiles(prefs.scope as FileScope, target.index, options(), onProgress, signal), (result) => setReport(result as AnonymizeReport))}
        >
          {t('anonymize.run')}
        </button>
      </Footer>
    </Modal>
  )
}

// --- convert -------------------------------------------------------------------------------

function ConvertDialog() {
  const { t } = useTranslation()
  const [prefs, set] = usePrefs('convert', { patientName: '', patientId: '', description: '' })
  const [files, setFiles] = useState<File[]>([])
  const { run, busy, bar } = useJob()
  return (
    <Modal title={t('convert.title')} onClose={closeDialog}>
      <div className="space-y-3 overflow-auto p-4">
        <p className="text-sm text-slate-400">{t('convert.intro')}</p>
        <input aria-label={t('convert.files')} type="file" multiple accept="image/*,.pdf,application/pdf,.tif,.tiff" onChange={(e) => setFiles([...(e.target.files ?? [])])} className="text-sm text-slate-300" />
        <Field label={t('anonymize.patientName')}>
          <input aria-label={t('anonymize.patientName')} value={prefs.patientName} onChange={(e) => set({ patientName: e.target.value })} className={`${INPUT} w-48`} />
        </Field>
        <Field label={t('anonymize.patientId')}>
          <input aria-label={t('anonymize.patientId')} value={prefs.patientId} onChange={(e) => set({ patientId: e.target.value })} className={`${INPUT} w-48`} />
        </Field>
        <Field label={t('convert.description')}>
          <input aria-label={t('convert.description')} value={prefs.description} onChange={(e) => set({ description: e.target.value })} className={`${INPUT} w-48`} />
        </Field>
        {bar}
      </div>
      <Footer busy={busy}>
        <button className={PRIMARY} disabled={busy || files.length === 0} onClick={() => run((onProgress) => convertToDicom(files, prefs, onProgress))}>
          {t('convert.run')}
        </button>
      </Footer>
    </Modal>
  )
}

// --- tag edit ----------------------------------------------------------------------------------

interface EditRow {
  tag: string
  vr: string
  name: string
  value: string
  original: string
  remove: boolean
}

function TagEditDialog() {
  const { t } = useTranslation()
  const file = useViewer((s) => {
    const displaySet = selectCurrentDisplaySet(s)
    const viewportId = selectTargetViewportId(s)
    const index = viewportId ? (getViewport(viewportId)?.getCurrentImageIdIndex?.() ?? 0) : 0
    return displaySet?.series.images[index]?.file ?? displaySet?.series.images[0]?.file ?? null
  })
  const [rows, setRows] = useState<EditRow[] | null>(null)
  const [newTag, setNewTag] = useState({ tag: '', value: '' })
  const [newUid, setNewUid] = useState(true)
  const [error, setError] = useState('')
  const { run, busy, bar } = useJob()

  useEffect(() => {
    if (!file) return
    let cancelled = false
    void readDicom(file).then(async (dicom: DicomDict) => {
      const { default: dcmjs } = await import('dcmjs')
      if (cancelled) return
      setRows(
        Object.entries(dicom.dict)
          .filter(([, entry]) => isEditable(entry))
          .map(([tag, entry]) => {
            const value = displayValue(entry)
            const name = dcmjs.data.DicomMetaDictionary.dictionary[`(${tag.slice(0, 4)},${tag.slice(4)})`]?.name ?? ''
            return { tag, vr: entry.vr, name, value, original: value, remove: false }
          }),
      )
    })
    return () => {
      cancelled = true
    }
  }, [file])

  const update = (tag: string, change: Partial<EditRow>) => setRows((current) => current!.map((row) => (row.tag === tag ? { ...row, ...change } : row)))
  const addTag = async () => {
    const tag = normalizeTag(newTag.tag)
    const vr = tag && (await vrOf(tag))
    if (!tag || !vr) return setError(t('tagEdit.unknownTag'))
    setError('')
    setRows((current) => [...(current ?? []).filter((r) => r.tag !== tag), { tag, vr, name: '', value: newTag.value, original: '\u0000new', remove: false }])
    setNewTag({ tag: '', value: '' })
  }

  return (
    <Modal title={t('tagEdit.title')} onClose={closeDialog}>
      <div className="min-h-0 flex-1 overflow-auto p-4">
        {!file && <p className="text-sm text-slate-400">{t('tags.noImage')}</p>}
        {file && !rows && <p className="text-sm text-slate-400">{t('panels.loading')}</p>}
        {rows && (
          <table className="w-full text-left font-mono text-[11px]">
            <tbody>
              {rows.map((row) => (
                <tr key={row.tag} className="border-t border-slate-800/60">
                  <td className="py-1 pr-2 text-slate-500">({row.tag.slice(0, 4)},{row.tag.slice(4)})</td>
                  <td className="max-w-32 truncate py-1 pr-2 text-slate-300" title={row.name}>
                    {row.name}
                  </td>
                  <td className="py-1 pr-2 text-slate-500">{row.vr}</td>
                  <td className="py-1">
                    <input
                      aria-label={t('tagEdit.value', { tag: row.name || row.tag })}
                      value={row.value}
                      disabled={row.remove}
                      onChange={(e) => update(row.tag, { value: e.target.value })}
                      className="w-full rounded border border-slate-700 bg-slate-950 px-1 text-slate-100 disabled:opacity-40"
                    />
                  </td>
                  <td className="pl-2">
                    <input type="checkbox" aria-label={t('tagEdit.remove', { tag: row.name || row.tag })} checked={row.remove} onChange={(e) => update(row.tag, { remove: e.target.checked })} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {rows && (
          <div className="mt-3 space-y-2 border-t border-slate-800 pt-3">
            <div className="flex gap-2">
              <input aria-label={t('tagEdit.newTag')} placeholder="(0010,4000)" value={newTag.tag} onChange={(e) => setNewTag({ ...newTag, tag: e.target.value })} className={`${INPUT} w-32`} />
              <input aria-label={t('tagEdit.newValue')} placeholder={t('tagEdit.newValue')} value={newTag.value} onChange={(e) => setNewTag({ ...newTag, value: e.target.value })} className={`${INPUT} flex-1`} />
              <button className={SECONDARY} onClick={() => void addTag()}>
                {t('tagEdit.add')}
              </button>
            </div>
            {error && <p className="text-sm text-red-400">{error}</p>}
            <Check label={t('tagEdit.newUid')} checked={newUid} onChange={setNewUid} />
          </div>
        )}
        {bar}
      </div>
      <Footer busy={busy}>
        <button
          className={PRIMARY}
          disabled={busy || !rows || !file}
          onClick={() =>
            run(async () => {
              const edits = rows!
                .filter((row) => row.remove || row.value !== row.original)
                .map((row) => ({ tag: row.tag, vr: row.vr, value: row.remove ? null : row.value }))
              const blob = await editFile(file!, edits, newUid)
              downloadBlob(blob, file!.name.replace(/(\.dcm)?$/i, '_edited.dcm'))
            })
          }
        >
          {t('tagEdit.save')}
        </button>
      </Footer>
    </Modal>
  )
}
