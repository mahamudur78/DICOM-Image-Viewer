import { lazy, Suspense } from 'react'
import { useTranslation } from 'react-i18next'
import { useKeyboardShortcuts } from './commands/useCommands'
import { ContextMenu } from './components/ContextMenu'
import { Sidebar } from './components/Sidebar'
import { Toolbar } from './components/Toolbar'
import { ViewportGrid } from './components/ViewportGrid'
import { ErrorBoundary } from './notifications/ErrorBoundary'
import { PanelHost } from './panels/PanelHost'
import { useCornerstoneBridge } from './store/viewerActions'
import { useViewer } from './store/viewerStore'

// MPR and 3D are only downloaded when first opened.
const MprView = lazy(() => import('./components/MprView').then((m) => ({ default: m.MprView })))
const Volume3DView = lazy(() => import('./components/Volume3DView').then((m) => ({ default: m.Volume3DView })))

/** Toolbar, series list, viewports and side panel of an open study. */
export function Workspace() {
  const { t } = useTranslation()
  const volumeMode = useViewer((s) => s.volumeView?.mode ?? null)

  useCornerstoneBridge()
  useKeyboardShortcuts(true)

  return (
    <>
      <Toolbar />
      <div className="relative flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="shrink-0 lg:w-44">
          <Sidebar />
        </div>
        <div className="min-h-0 min-w-0 flex-1">
          <ErrorBoundary compact>
            <Suspense fallback={<div className="grid h-full place-items-center text-sm text-slate-500">{t('panels.loading')}</div>}>
              {volumeMode === '3d' ? <Volume3DView /> : volumeMode === 'mpr' ? <MprView /> : <ViewportGrid />}
            </Suspense>
          </ErrorBoundary>
        </div>
        <PanelHost />
      </div>
      <ContextMenu />
    </>
  )
}
