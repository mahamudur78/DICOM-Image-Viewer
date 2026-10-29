import { lazy, Suspense, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Welcome } from './components/Welcome'
import { Dialogs } from './dialogs/Dialogs'
import { openArchive, openSettings, openShortcuts } from './dialogs/dialogStore'
import { collectDroppedFiles } from './dicom/collectFiles'
import { notify } from './notifications/toastStore'
import { Toasts } from './notifications/Toasts'
import { loadRuntime, startViewer } from './runtime'
import { openFiles } from './app/openFiles'
import { useViewer } from './store/viewerStore'
import { onWindowMessage, postWindowMessage, secondaryWindowId } from './app/windowChannel'

const HEADER_BUTTON = 'rounded-md px-2 py-1 text-sm text-slate-300 hover:bg-slate-800 hover:text-white'

const Workspace = lazy(() => loadRuntime().then((m) => ({ default: m.Workspace })))

interface LaunchParams {
  files: { getFile(): Promise<File> }[]
}

/** Files the operating system opened with the installed app (PWA file handling). */
function useLaunchedFiles() {
  useEffect(() => {
    const queue = (window as unknown as { launchQueue?: { setConsumer(consumer: (params: LaunchParams) => void): void } }).launchQueue
    queue?.setConsumer(async (params) => {
      if (!params.files.length) return
      const files = await Promise.all(params.files.map((handle) => handle.getFile()))
      await openFiles(files.map((file) => ({ file, path: file.name })))
    })
  }, [])
}

export default function App() {
  const { t } = useTranslation()
  const hasStudies = useViewer((s) => s.studies.length > 0)
  const loading = useViewer((s) => s.loading)
  const distractionFree = useViewer((s) => s.distractionFree)
  const [dragging, setDragging] = useState(false)
  useLaunchedFiles()

  // Download and start the viewer in the background while the welcome page is shown.
  useEffect(() => {
    startViewer()
      .then(() => useViewer.setState({ ready: true }))
      .catch((error: unknown) => notify(t('messages.startFailed', { error: String(error) }), 'error'))
  }, [t])

  // A window opened for one series asks the main window for its files.
  useEffect(() => {
    if (!secondaryWindowId) return
    const windowId = secondaryWindowId
    let received = false
    const stop = onWindowMessage(async (message) => {
      if (message.type !== 'files' || message.windowId !== windowId || received) return
      received = true
      await openFiles(message.files.map((file) => ({ file, path: file.name })))
      ;(await loadRuntime()).showOnlySeries(message.seriesId)
    })
    let tries = 0
    const hello = () => {
      if (received) return
      postWindowMessage({ type: 'hello', windowId })
      if (++tries < 10) timer = window.setTimeout(hello, 1000)
    }
    let timer = window.setTimeout(hello, 0)
    return () => {
      stop()
      window.clearTimeout(timer)
    }
  }, [])

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
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:start-2 focus:top-2 focus:z-50 focus:rounded focus:bg-sky-600 focus:px-3 focus:py-1 focus:text-white">
        {t('app.skipToViewer')}
      </a>
      <header className={`flex items-center gap-3 border-b border-slate-800 px-4 py-2 ${distractionFree && hasStudies ? 'hidden' : ''}`}>
        <span className="text-lg">🩻</span>
        <span className="font-semibold text-slate-100">{t('app.name')}</span>
        <span className="hidden rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-400 sm:inline">
          {t('app.privacyBadge')}
        </span>
        <nav className="ms-auto flex items-center gap-1" aria-label={t('app.menu')}>
          <button className={HEADER_BUTTON} onClick={() => openArchive()}>
            {t('archive.title')}
          </button>
          <button className={HEADER_BUTTON} onClick={() => openShortcuts()} aria-label={t('help.shortcutsTitle')} title={t('help.shortcutsTitle')}>
            ?
          </button>
          <button className={HEADER_BUTTON} onClick={() => openSettings()} aria-label={t('settings.title')} title={t('settings.title')}>
            ⚙
          </button>
        </nav>
      </header>

      <main id="main" tabIndex={-1} className="relative flex min-h-0 flex-1 flex-col focus:outline-none">
        {hasStudies ? (
          <Suspense fallback={null}>
            <Workspace />
          </Suspense>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto">
            {secondaryWindowId && !loading ? (
              <p className="p-8 text-center text-slate-400">{t('windows.waiting')}</p>
            ) : (
              <Welcome onFiles={openFiles} />
            )}
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
