import { useCallback, useEffect, useState } from 'react'
import { Sidebar } from './components/Sidebar'
import { TagPanel } from './components/TagPanel'
import { Toolbar } from './components/Toolbar'
import { TOOL_SHORTCUTS } from './components/toolButtons'
import { Viewport } from './components/Viewport'
import { Welcome } from './components/Welcome'
import { initCornerstone } from './cornerstone/init'
import { setPrimaryTool, type PrimaryTool } from './cornerstone/tools'
import { resetView, scrollImages, toggleInvert } from './cornerstone/viewer'
import { collectDroppedFiles } from './dicom/collectFiles'
import { loadFiles, releaseLoadedImages } from './dicom/loadFiles'
import type { Series, Study } from './dicom/types'

interface Selection {
  study: Study
  series: Series
}

export default function App() {
  const [ready, setReady] = useState(false)
  const [studies, setStudies] = useState<Study[]>([])
  const [selection, setSelection] = useState<Selection | null>(null)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [activeTool, setActiveTool] = useState<PrimaryTool>('windowLevel')
  const [showTags, setShowTags] = useState(false)
  const [imageIndex, setImageIndex] = useState(0)
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    initCornerstone()
      .then(() => setReady(true))
      .catch((error: unknown) => setMessage(`Failed to start the viewer: ${String(error)}`))
  }, [])

  const handleFiles = useCallback(async (files: File[]) => {
    if (files.length === 0) return
    setSelection(null)
    setMessage(null)
    releaseLoadedImages()
    setProgress({ done: 0, total: files.length })

    const result = await loadFiles(files, (done, total) => setProgress({ done, total }))
    setProgress(null)
    setStudies(result.studies)

    const first = result.studies[0]
    if (first) {
      setSelection({ study: first, series: first.series[0] })
    } else {
      setMessage('No DICOM images were found in the selected files.')
      return
    }
    if (result.skipped > 0) {
      setMessage(`${result.skipped} file(s) were skipped because they are not DICOM images.`)
    }
  }, [])

  // The viewport (and its tool group) is recreated whenever it mounts.
  useEffect(() => {
    if (selection) setPrimaryTool(activeTool)
  }, [selection, activeTool])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!selection || event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return
      if (event.metaKey || event.ctrlKey || event.altKey) return
      const key = event.key.toLowerCase()
      if (key === 'arrowup' || key === 'arrowleft') scrollImages(-1)
      else if (key === 'arrowdown' || key === 'arrowright') scrollImages(1)
      else if (key === 'r') resetView()
      else if (key === 'i') toggleInvert()
      else if (key === 't') setShowTags((value) => !value)
      else if (TOOL_SHORTCUTS[key]) setActiveTool(TOOL_SHORTCUTS[key])
      else return
      event.preventDefault()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selection])

  const handleDrop = async (event: React.DragEvent) => {
    event.preventDefault()
    setDragging(false)
    if (!ready) return
    await handleFiles(await collectDroppedFiles(event.dataTransfer))
  }

  const currentFile = selection?.series.images[imageIndex]?.file ?? selection?.series.images[0]?.file

  return (
    <div
      className="flex h-dvh flex-col bg-slate-950 text-slate-200"
      onDragOver={(event) => {
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
        <span className="font-semibold text-slate-100">DICOM Viewer</span>
        <span className="hidden rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-400 sm:inline">
          🔒 Files stay on your device
        </span>
      </header>

      {selection && (
        <Toolbar
          activeTool={activeTool}
          onToolChange={setActiveTool}
          modality={selection.series.modality}
          showTags={showTags}
          onToggleTags={() => setShowTags((value) => !value)}
          onFiles={handleFiles}
        />
      )}

      {message && (
        <div className="flex items-center gap-3 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-200">
          <span>{message}</span>
          <button onClick={() => setMessage(null)} className="ml-auto text-amber-300 hover:text-amber-100" aria-label="Dismiss">
            ✕
          </button>
        </div>
      )}

      <main className="relative flex min-h-0 flex-1 flex-col lg:flex-row">
        {selection ? (
          <>
            <div className="max-h-48 shrink-0 lg:max-h-none lg:w-64">
              <Sidebar
                studies={studies}
                activeSeries={selection.series}
                onSelect={(study, series) => {
                  setImageIndex(0)
                  setSelection({ study, series })
                }}
              />
            </div>
            <div className="min-h-0 min-w-0 flex-1">
              <Viewport
                study={selection.study}
                series={selection.series}
                onError={setMessage}
                onIndexChange={setImageIndex}
              />
            </div>
            {showTags && currentFile && (
              <div className="absolute inset-0 z-20 lg:static lg:inset-auto">
                <TagPanel file={currentFile} onClose={() => setShowTags(false)} />
              </div>
            )}
          </>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <Welcome onFiles={handleFiles} />
          </div>
        )}

        {(progress || !ready) && (
          <div className="absolute inset-0 z-30 grid place-items-center bg-slate-950/80">
            <div className="w-72 text-center">
              <p className="mb-3 text-sm text-slate-300">
                {progress ? `Reading files… ${progress.done} / ${progress.total}` : 'Starting viewer…'}
              </p>
              {progress && (
                <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
                  <div
                    className="h-full bg-sky-500 transition-[width]"
                    style={{ width: `${(progress.done / Math.max(progress.total, 1)) * 100}%` }}
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {dragging && (
          <div className="pointer-events-none absolute inset-3 z-40 grid place-items-center rounded-2xl border-2 border-dashed border-sky-500 bg-sky-500/10 text-lg font-medium text-sky-200">
            Drop DICOM files or folders to open
          </div>
        )}
      </main>
    </div>
  )
}
