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
import { setDistractionFree, useViewer } from './store/viewerStore'
import { ImageFilterDefs } from './components/ImageFilterDefs'

// MPR and 3D are only downloaded when first opened.
const MprView = lazy(() => import('./components/MprView').then((m) => ({ default: m.MprView })))
const Volume3DView = lazy(() => import('./components/Volume3DView').then((m) => ({ default: m.Volume3DView })))

/** Toolbar, series list, viewports and side panel of an open study. */
export function Workspace() {
  const { t } = useTranslation()
  const volumeMode = useViewer((s) => s.volumeView?.mode ?? null)
  const distractionFree = useViewer((s) => s.distractionFree)

  useCornerstoneBridge()
  useKeyboardShortcuts(true)

  return (
    <>
      <ImageFilterDefs />
      {!distractionFree && <Toolbar />}
      <div className="relative flex min-h-0 flex-1 flex-col lg:flex-row">
        {!distractionFree && (
          <div className="shrink-0 lg:w-44">
            <Sidebar />
          </div>
        )}
        <div className="min-h-0 min-w-0 flex-1">
          <ErrorBoundary compact>
            <Suspense fallback={<div className="grid h-full place-items-center text-sm text-slate-500">{t('panels.loading')}</div>}>
              {volumeMode === '3d' ? <Volume3DView /> : volumeMode === 'mpr' ? <MprView /> : <ViewportGrid />}
            </Suspense>
          </ErrorBoundary>
        </div>
        {!distractionFree && <PanelHost />}
        {distractionFree && (
          <button
            onClick={() => setDistractionFree(false)}
            className="absolute right-3 top-3 z-30 rounded-full bg-black/60 px-3 py-1 text-xs text-slate-200 opacity-40 ring-1 ring-white/20 transition hover:opacity-100 focus:opacity-100"
          >
            {t('display.exitDistractionFree')} (Esc)
          </button>
        )}
      </div>
      <ContextMenu />
    </>
  )
}
