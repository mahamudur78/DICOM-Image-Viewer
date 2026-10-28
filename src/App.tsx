import { lazy, Suspense, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Welcome } from './components/Welcome'
import { Dialogs } from './dialogs/Dialogs'
import { collectDroppedFiles, type SourceFile } from './dicom/collectFiles'
import { notify } from './notifications/toastStore'
import { Toasts } from './notifications/Toasts'
import { loadRuntime, startViewer } from './runtime'
import { useViewer } from './store/viewerStore'

const Workspace = lazy(() => loadRuntime().then((m) => ({ default: m.Workspace })))

/** Opens files once the viewer runtime is ready (it may still be downloading). */
async function openFiles(files: SourceFile[]) {
  if (files.length === 0) return
  useViewer.setState({ loading: { done: 0, total: files.length } })
  try {
    await startViewer()
  } catch {
    useViewer.setState({ loading: null })
    return // startViewer's failure is already reported by App
  }
  const runtime = await loadRuntime()
  await runtime.openFiles(files)
}

export default function App() {
  const { t } = useTranslation()
  const hasStudies = useViewer((s) => s.studies.length > 0)
  const loading = useViewer((s) => s.loading)
  const [dragging, setDragging] = useState(false)

  // Download and start the viewer in the background while the welcome page is shown.
  useEffect(() => {
    startViewer()
      .then(() => useViewer.setState({ ready: true }))
      .catch((error: unknown) => notify(t('messages.startFailed', { error: String(error) }), 'error'))
  }, [t])

  const handleDrop = async (event: React.DragEvent) => {
    event.preventDefault()
    setDragging(false)
    if (!event.dataTransfer.types.includes('Files')) return
    await openFiles(await collectDroppedFiles(event.dataTransfer))
  }

  return (
    <div
      className="flex h-dvh flex-col bg-slate-950 text-slate-200"
      onDragOver={(event) => {
        // Only OS files trigger the "open" overlay; series thumbnails are handled by the grid.
        if (!event.dataTransfer.types.includes('Files')) return
        event.preventDefault()
        setDragging(true)
      }}
      onDragLeave={(event) => {
        if (event.currentTarget === event.target) setDragging(false)
      }}
      onDrop={handleDrop}
    >
      <header className="flex items-center gap-3 border-b border-slate-800 px-4 py-2">
        <span className="text-lg">🩻</span>
        <span className="font-semibold text-slate-100">{t('app.name')}</span>
        <span className="hidden rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-400 sm:inline">
          {t('app.privacyBadge')}
        </span>
      </header>

      <main className="relative flex min-h-0 flex-1 flex-col">
        {hasStudies ? (
          <Suspense fallback={null}>
            <Workspace />
          </Suspense>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <Welcome onFiles={openFiles} />
          </div>
        )}

        {loading && (
          <div className="absolute inset-0 z-30 grid place-items-center bg-slate-950/80">
            <div className="w-72 text-center">
              <p className="mb-3 text-sm text-slate-300">
                {t('app.readingFiles', { done: loading.done, total: loading.total })}
              </p>
              <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full bg-sky-500 transition-[width]"
                  style={{ width: `${(loading.done / Math.max(loading.total, 1)) * 100}%` }}
                />
              </div>
            </div>
          </div>
        )}

        {dragging && (
          <div className="pointer-events-none absolute inset-3 z-40 grid place-items-center rounded-2xl border-2 border-dashed border-sky-500 bg-sky-500/10 text-lg font-medium text-sky-200">
            {t('app.dropOverlay')}
          </div>
        )}
      </main>

      <Toasts />
      <Dialogs />
    </div>
  )
}
