import { useCallback, useEffect, useState } from 'react'
import { defaultLayoutFor, type Layout } from './components/layouts'
import { MprView } from './components/MprView'
import { Sidebar } from './components/Sidebar'
import { TagPanel } from './components/TagPanel'
import { Toolbar, type Slab } from './components/Toolbar'
import { TOOL_SHORTCUTS, type LinkSettings } from './components/toolButtons'
import { ViewportGrid } from './components/ViewportGrid'
import { Welcome } from './components/Welcome'
import { initCornerstone } from './cornerstone/init'
import { MPR_VIEWPORTS, mprUnsupportedReason, setSlab } from './cornerstone/mpr'
import { setSliceSync, setVoiSync } from './cornerstone/sync'
import { setPrimaryTool, setReferenceLines, type PrimaryTool } from './cornerstone/tools'
import {
  MAX_VIEWPORTS,
  forgetRememberedIndexes,
  resetView,
  scrollImages,
  setActiveSource,
  toggleInvert,
  viewportIdAt,
} from './cornerstone/viewer'
import { collectDroppedFiles } from './dicom/collectFiles'
import { hangingOrder } from './dicom/hangingProtocol'
import { loadFiles, releaseLoadedImages } from './dicom/loadFiles'
import type { DisplaySet, Study } from './dicom/types'

const EMPTY_CELLS: (DisplaySet | null)[] = Array(MAX_VIEWPORTS).fill(null)

export default function App() {
  const [ready, setReady] = useState(false)
  const [studies, setStudies] = useState<Study[]>([])
  const [cells, setCells] = useState<(DisplaySet | null)[]>(EMPTY_CELLS)
  const [cellIndexes, setCellIndexes] = useState<number[]>(Array(MAX_VIEWPORTS).fill(0))
  const [layout, setLayout] = useState<Layout>(defaultLayoutFor(1))
  const [activeCell, setActiveCell] = useState(0)
  const [maximizedCell, setMaximizedCell] = useState<number | null>(null)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [activeTool, setActiveTool] = useState<PrimaryTool>('windowLevel')
  const [showTags, setShowTags] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [links, setLinks] = useState<LinkSettings>({ referenceLines: true, sliceSync: false, voiSync: false })
  const [mpr, setMpr] = useState<DisplaySet | null>(null)
  const [mprViewportId, setMprViewportId] = useState<string>(MPR_VIEWPORTS[0].id)
  const [slab, setSlabState] = useState<Slab>({ mode: 'mip', thickness: 0 })

  const hasStudies = studies.length > 0
  const activeDisplaySet = cells[activeCell]
  const activeViewportId = activeDisplaySet ? viewportIdAt(activeCell) : null
  /** Viewport that toolbar actions and keyboard shortcuts apply to. */
  const targetViewportId = mpr ? mprViewportId : activeViewportId

  useEffect(() => {
    initCornerstone()
      .then(() => setReady(true))
      .catch((error: unknown) => setMessage(`Failed to start the viewer: ${String(error)}`))
  }, [])

  useEffect(() => {
    if (ready) setPrimaryTool(activeTool)
  }, [ready, activeTool])

  // The active viewport drives reference lines and sync. Re-run whenever
  // viewports may have (re)mounted: new series, layout or maximize changes.
  useEffect(() => {
    if (!ready) return
    const source = mpr ? null : (setActiveSource(activeViewportId) ?? null)
    setReferenceLines(links.referenceLines ? source : null)
  }, [ready, mpr, links.referenceLines, activeViewportId, cells, layout, maximizedCell])

  useEffect(() => {
    if (mpr) setSlab(slab.mode, slab.thickness)
  }, [mpr, slab])

  useEffect(() => {
    if (!ready) return
    setSliceSync(links.sliceSync)
    setVoiSync(links.voiSync)
  }, [ready, links.sliceSync, links.voiSync])

  const handleFiles = useCallback(async (files: File[]) => {
    if (files.length === 0) return
    // Unmount every viewport before releasing the images they display.
    setCells(EMPTY_CELLS)
    setMpr(null)
    setStudies([])
    setMessage(null)
    setProgress({ done: 0, total: files.length })
    await new Promise((resolve) => setTimeout(resolve)) // let React commit the unmount
    releaseLoadedImages()
    forgetRememberedIndexes()

    const result = await loadFiles(files, (done, total) => setProgress({ done, total }))
    setProgress(null)

    const displaySets = hangingOrder(result.studies)
    if (displaySets.length === 0) {
      setMessage('No DICOM images were found in the selected files.')
      return
    }
    setStudies(result.studies)
    setCells(EMPTY_CELLS.map((_, cell) => displaySets[cell] ?? null))
    setLayout(defaultLayoutFor(displaySets.length))
    setActiveCell(0)
    setMaximizedCell(null)
    if (result.skipped > 0) {
      setMessage(`${result.skipped} file(s) were skipped because they are not DICOM images.`)
    }
  }, [])

  const showInCell = (cell: number, displaySet: DisplaySet) => {
    setCells((current) => current.map((existing, i) => (i === cell ? displaySet : existing)))
    setActiveCell(cell)
  }

  /** Opens MPR for a series, or explains why it cannot be reconstructed. */
  const openMpr = (displaySet: DisplaySet | null) => {
    if (!displaySet) return setMessage('Select a series first.')
    const reason = mprUnsupportedReason(displaySet.series)
    if (reason) return setMessage(`MPR is not available for this series. ${reason}`)
    setMessage(null)
    setSlabState((current) => ({ ...current, thickness: 0 }))
    setMpr(displaySet)
    setActiveTool('crosshairs')
  }

  const closeMpr = () => {
    setMpr(null)
    setActiveTool((tool) => (tool === 'crosshairs' ? 'windowLevel' : tool))
  }

  const handleDropSeries = (cell: number, seriesUID: string) => {
    for (const study of studies) {
      const series = study.series.find((s) => s.seriesInstanceUID === seriesUID)
      if (series) return showInCell(cell, { study, series })
    }
  }

  const handleLayoutChange = (next: Layout) => {
    setLayout(next)
    setMaximizedCell(null)
    if (activeCell >= next.rows * next.cols) setActiveCell(0)
  }

  const handleIndexChange = useCallback((cell: number, index: number) => {
    setCellIndexes((current) => (current[cell] === index ? current : current.map((v, i) => (i === cell ? index : v))))
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!hasStudies || event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return
      if (event.metaKey || event.ctrlKey || event.altKey) return
      const key = event.key.toLowerCase()
      if (TOOL_SHORTCUTS[key]) setActiveTool(TOOL_SHORTCUTS[key])
      else if (key === 't') setShowTags((value) => !value)
      else if (!targetViewportId) return
      else if (key === 'arrowup' || key === 'arrowleft') scrollImages(targetViewportId, -1)
      else if (key === 'arrowdown' || key === 'arrowright') scrollImages(targetViewportId, 1)
      else if (key === 'r') resetView(targetViewportId)
      else if (key === 'i') toggleInvert(targetViewportId)
      else return
      event.preventDefault()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [hasStudies, targetViewportId])

  const handleDrop = async (event: React.DragEvent) => {
    event.preventDefault()
    setDragging(false)
    if (!ready || !event.dataTransfer.types.includes('Files')) return
    await handleFiles(await collectDroppedFiles(event.dataTransfer))
  }

  const currentFile = mpr
    ? mpr.series.images[Math.floor(mpr.series.images.length / 2)]?.file
    : (activeDisplaySet?.series.images[cellIndexes[activeCell]]?.file ?? activeDisplaySet?.series.images[0]?.file)

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
        <span className="font-semibold text-slate-100">DICOM Viewer</span>
        <span className="hidden rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-400 sm:inline">
          🔒 Files stay on your device
        </span>
      </header>

      {hasStudies && (
        <Toolbar
          activeTool={activeTool}
          onToolChange={setActiveTool}
          viewportId={targetViewportId}
          modality={(mpr ?? activeDisplaySet)?.series.modality ?? ''}
          layout={layout}
          onLayoutChange={handleLayoutChange}
          links={links}
          onToggleLink={(key) => setLinks((current) => ({ ...current, [key]: !current[key] }))}
          mprActive={!!mpr}
          onToggleMpr={() => (mpr ? closeMpr() : openMpr(activeDisplaySet))}
          slab={slab}
          onSlabChange={setSlabState}
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
        {hasStudies ? (
          <>
            <div className="shrink-0 lg:w-44">
              <Sidebar
                studies={studies}
                cells={mpr ? [mpr] : cells}
                activeCell={mpr ? 0 : activeCell}
                onSelect={(study, series) =>
                  mpr ? openMpr({ study, series }) : showInCell(activeCell, { study, series })
                }
              />
            </div>
            <div className="min-h-0 min-w-0 flex-1">
              {mpr ? (
                <MprView
                  displaySet={mpr}
                  activeViewportId={mprViewportId}
                  onActivate={setMprViewportId}
                  onError={setMessage}
                />
              ) : (
                <ViewportGrid
                  layout={layout}
                  cells={cells}
                  activeCell={activeCell}
                  maximizedCell={maximizedCell}
                  onActivate={setActiveCell}
                  onToggleMaximize={(cell) => setMaximizedCell((current) => (current === cell ? null : cell))}
                  onDropSeries={handleDropSeries}
                  onIndexChange={handleIndexChange}
                  onError={setMessage}
                />
              )}
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
