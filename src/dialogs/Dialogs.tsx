import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { LoadIssue } from '../dicom/types'
import { closeDialog, useDialogs, type DialogRequest } from './dialogStore'

/** Renders the first queued dialog. */
export function Dialogs() {
  const request = useDialogs((s) => s.queue[0])
  if (!request) return null
  return request.type === 'password' ? (
    <PasswordDialog key={`${request.zipName}${request.retry}`} request={request} />
  ) : (
    <IssuesDialog issues={request.issues} />
  )
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
