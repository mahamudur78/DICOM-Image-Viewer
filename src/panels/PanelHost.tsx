import { Suspense } from 'react'
import { useTranslation } from 'react-i18next'
import { ErrorBoundary } from '../notifications/ErrorBoundary'
import { closePanel, useViewer } from '../store/viewerStore'
import { PANELS } from './panels'

/**
 * The open side panel: a column on the right on large screens, and a sheet
 * covering the viewer on phones and tablets.
 */
export function PanelHost() {
  const { t } = useTranslation()
  const panel = useViewer((s) => s.panel)
  if (!panel) return null
  const { title, component: Panel } = PANELS[panel]

  return (
    <aside
      aria-label={t(title)}
      className="absolute inset-0 z-20 flex flex-col border-slate-800 bg-slate-900 lg:static lg:inset-auto lg:w-[28rem] lg:border-l"
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
