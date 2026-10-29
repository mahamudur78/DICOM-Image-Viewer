import { useTranslation } from 'react-i18next'
import { useToasts, type ToastKind } from './toastStore'

const KIND_CLASS: Record<ToastKind, string> = {
  info: 'border-sky-500/40 bg-slate-900 text-slate-100',
  success: 'border-emerald-500/40 bg-slate-900 text-emerald-100',
  warning: 'border-amber-500/40 bg-slate-900 text-amber-100',
  error: 'border-red-500/50 bg-slate-900 text-red-100',
}

const KIND_ICON: Record<ToastKind, string> = { info: 'ℹ', success: '✓', warning: '⚠', error: '✕' }

/** Stack of notifications in the bottom-right corner (full width on phones). */
export function Toasts() {
  const { t } = useTranslation()
  const toasts = useToasts((s) => s.toasts)
  const dismiss = useToasts((s) => s.dismiss)

  return (
    <div className="pointer-events-none fixed inset-x-3 bottom-3 z-50 flex flex-col items-end gap-2 sm:left-auto sm:w-96">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role={toast.kind === 'error' ? 'alert' : 'status'}
          className={`pointer-events-auto flex w-full items-start gap-3 rounded-lg border px-3 py-2 text-sm shadow-lg ${KIND_CLASS[toast.kind]}`}
        >
          <span aria-hidden className="mt-px">
            {KIND_ICON[toast.kind]}
          </span>
          <span className="min-w-0 flex-1 break-words">{toast.message}</span>
          {toast.action && (
            <button
              onClick={() => {
                dismiss(toast.id)
                toast.action!.run()
              }}
              className="shrink-0 rounded px-1.5 font-semibold text-sky-300 hover:bg-slate-800 hover:text-sky-200"
            >
              {toast.action.label}
            </button>
          )}
          <button
            onClick={() => dismiss(toast.id)}
            aria-label={t('toast.dismiss')}
            className="-mr-1 rounded px-1 text-slate-400 hover:text-slate-100"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  )
}
