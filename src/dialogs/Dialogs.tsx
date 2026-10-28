import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { LoadIssue } from '../dicom/types'
import { useSettings } from '../store/settingsStore'
import { closeDialog, useDialogs, type DialogRequest } from './dialogStore'

/** Renders the first queued dialog. */
export function Dialogs() {
  const request = useDialogs((s) => s.queue[0])
  if (!request) return null
  switch (request.type) {
    case 'password':
      return <PasswordDialog key={`${request.zipName}${request.retry}`} request={request} />
    case 'issues':
      return <IssuesDialog issues={request.issues} />
    case 'form':
      return <FormDialog request={request} />
    case 'presets':
      return <PresetsDialog modality={request.modality} current={request.current} />
  }
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const titleId = useId()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    ref.current?.querySelector<HTMLElement>('input, button')?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      previous?.focus()
    }
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[85dvh] w-full max-w-lg flex-col rounded-xl border border-slate-700 bg-slate-900 shadow-2xl"
      >
        <h2 id={titleId} className="border-b border-slate-800 px-4 py-3 font-semibold text-slate-100">
          {title}
        </h2>
        {children}
      </div>
    </div>
  )
}

function PasswordDialog({ request }: { request: Extract<DialogRequest, { type: 'password' }> }) {
  const { t } = useTranslation()
  const [password, setPassword] = useState('')
  const finish = (value: string | null) => {
    closeDialog()
    request.resolve(value)
  }

  return (
    <Modal title={t('dialogs.passwordTitle')} onClose={() => finish(null)}>
      <form
        className="space-y-3 p-4"
        onSubmit={(event) => {
          event.preventDefault()
          finish(password)
        }}
      >
        <p className="text-sm text-slate-300">{t('dialogs.passwordBody', { name: request.zipName.split('/').pop() })}</p>
        {request.retry && <p className="text-sm text-red-300">{t('dialogs.passwordWrong')}</p>}
        <input
          type="password"
          autoComplete="off"
          aria-label={t('dialogs.password')}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
        />
        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => finish(null)} className="rounded-md px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800">
            {t('dialogs.skipZip')}
          </button>
          <button type="submit" className="rounded-md bg-sky-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-sky-500">
            {t('dialogs.unlock')}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function IssuesDialog({ issues }: { issues: LoadIssue[] }) {
  const { t } = useTranslation()
  return (
    <Modal title={t('dialogs.issuesTitle', { count: issues.length })} onClose={closeDialog}>
      <ul className="min-h-0 flex-1 divide-y divide-slate-800 overflow-auto px-4 text-sm">
        {issues.map((issue, i) => (
          <li key={`${issue.path}-${i}`} className="py-2">
            <div className="break-all font-mono text-xs text-slate-300">{issue.path}</div>
            <div className="text-slate-400">
              {t(`issues.${issue.reason}`)}
              {issue.detail && <span className="text-slate-500"> · {issue.detail}</span>}
            </div>
          </li>
        ))}
      </ul>
      <div className="flex justify-end border-t border-slate-800 p-3">
        <button onClick={closeDialog} className="rounded-md bg-slate-800 px-3 py-1.5 text-sm text-slate-100 hover:bg-slate-700">
          {t('dialogs.close')}
        </button>
      </div>
    </Modal>
  )
}

const INPUT = 'w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none'
const PRIMARY = 'rounded-md bg-sky-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-40'
const SECONDARY = 'rounded-md px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800'

function FormDialog({ request }: { request: Extract<DialogRequest, { type: 'form' }> }) {
  const { t } = useTranslation()
  const [values, setValues] = useState(() => Object.fromEntries(request.fields.map((f) => [f.name, f.value])))
  const finish = (result: Record<string, string> | null) => {
    closeDialog()
    request.resolve(result)
  }
  const valid = request.fields.every((field) => {
    const value = values[field.name]
    if (field.type === 'text') return !field.required || value.trim() !== ''
    const n = Number(value)
    return value.trim() !== '' && Number.isFinite(n) && (field.min === undefined || n >= field.min) && (field.max === undefined || n <= field.max)
  })

  return (
    <Modal title={t(request.title)} onClose={() => finish(null)}>
      <form
        className="space-y-3 p-4"
        onSubmit={(event) => {
          event.preventDefault()
          if (valid) finish(values)
        }}
      >
        {request.fields.map((field) => (
          <label key={field.name} className="block text-sm text-slate-300">
            {t(field.label)}
            <input
              type={field.type}
              inputMode={field.type === 'number' ? 'decimal' : undefined}
              min={field.min}
              max={field.max}
              step={field.step ?? 'any'}
              value={values[field.name]}
              onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value }))}
              className={`mt-1 ${INPUT}`}
            />
          </label>
        ))}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => finish(null)} className={SECONDARY}>
            {t('dialogs.cancel')}
          </button>
          <button type="submit" disabled={!valid} className={PRIMARY}>
            {t(request.submit)}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function PresetsDialog({ modality, current }: { modality: string; current: { width: number; center: number } | null }) {
  const { t } = useTranslation()
  // Filtered outside the selector: a new array from a selector would re-render forever.
  const presets = useSettings((s) => s.presets).filter((p) => p.modality === modality)
  const { addPreset, updatePreset, removePreset, movePreset } = useSettings.getState()
  const [name, setName] = useState('')

  return (
    <Modal title={t('presetsDialog.title', { modality: modality || '—' })} onClose={closeDialog}>
      <div className="min-h-0 flex-1 overflow-auto p-4">
        {presets.length === 0 && <p className="text-sm text-slate-400">{t('presetsDialog.empty')}</p>}
        <ul className="space-y-2">
          {presets.map((preset, i) => (
            <li key={preset.id} className="flex items-center gap-2">
              <input
                aria-label={t('presetsDialog.name')}
                value={preset.label}
                onChange={(event) => updatePreset(preset.id, { label: event.target.value })}
                className={`${INPUT} py-1`}
              />
              <span className="shrink-0 tabular-nums text-xs text-slate-400">
                {preset.width}/{preset.center}
              </span>
              <button className={SECONDARY} aria-label={t('presetsDialog.up')} disabled={i === 0} onClick={() => movePreset(preset.id, -1)}>
                ↑
              </button>
              <button className={SECONDARY} aria-label={t('presetsDialog.down')} disabled={i === presets.length - 1} onClick={() => movePreset(preset.id, 1)}>
                ↓
              </button>
              <button className={SECONDARY} aria-label={t('presetsDialog.delete', { name: preset.label })} onClick={() => removePreset(preset.id)}>
                ✕
              </button>
            </li>
          ))}
        </ul>
        {current && (
          <form
            className="mt-4 flex items-end gap-2 border-t border-slate-800 pt-4"
            onSubmit={(event) => {
              event.preventDefault()
              if (!name.trim()) return
              addPreset({ label: name.trim(), width: current.width, center: current.center, modality })
              setName('')
            }}
          >
            <label className="flex-1 text-sm text-slate-300">
              {t('presetsDialog.addCurrent', { width: current.width, center: current.center })}
              <input value={name} onChange={(event) => setName(event.target.value)} placeholder={t('presetsDialog.name')} className={`mt-1 ${INPUT}`} />
            </label>
            <button type="submit" disabled={!name.trim()} className={PRIMARY}>
              {t('presetsDialog.add')}
            </button>
          </form>
        )}
      </div>
      <div className="flex justify-end border-t border-slate-800 p-3">
        <button onClick={closeDialog} className="rounded-md bg-slate-800 px-3 py-1.5 text-sm text-slate-100 hover:bg-slate-700">
          {t('dialogs.close')}
        </button>
      </div>
    </Modal>
  )
}
