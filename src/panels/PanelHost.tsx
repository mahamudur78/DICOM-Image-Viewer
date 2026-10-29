import { Suspense } from 'react'
import { useTranslation } from 'react-i18next'
import { ErrorBoundary } from '../notifications/ErrorBoundary'
import { closePanel, useViewer } from '../store/viewerStore'
import { PANELS } from './panels'

/**
 * The open side panel: a column on the right on large screens, and a sheet
 * over the lower part of the viewer on phones and tablets.
 */
export function PanelHost() {
  const { t } = useTranslation()
  const panel = useViewer((s) => s.panel)
  if (!panel) return null
  const { title, component: Panel } = PANELS[panel]

  return (
    <aside
      aria-label={t(title)}
      className="absolute inset-x-0 bottom-0 z-20 flex h-[65%] flex-col rounded-t-xl border-t border-slate-700 bg-slate-900 shadow-2xl lg:static lg:inset-auto lg:h-auto lg:w-[28rem] lg:rounded-none lg:border-l lg:border-t-0 lg:border-slate-800 lg:shadow-none"
    >
      <div className="flex items-center gap-2 border-b border-slate-800 px-3 py-2">
        <h2 className="text-sm font-semibold text-slate-100">{t(title)}</h2>
        <button
          onClick={closePanel}
          className="ml-auto rounded px-2 py-1 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
          aria-label={t('panels.close', { title: t(title) })}
        >
          ✕
        </button>
      </div>
      <div className="min-h-0 flex-1">
        <ErrorBoundary compact>
          <Suspense fallback={<p className="p-3 text-sm text-slate-500">{t('panels.loading')}</p>}>
            <Panel />
          </Suspense>
        </ErrorBoundary>
      </div>
    </aside>
  )
}
