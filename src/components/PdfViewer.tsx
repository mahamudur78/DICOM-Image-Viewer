import * as pdfjs from './pdfjs'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { encapsulatedPdf } from '../dicom/pdf'
import type { DisplaySet } from '../dicom/types'
import { ViewportFrame } from './ViewportFrame'

interface PdfViewerProps {
  viewportId: string
  displaySet: DisplaySet
  active: boolean
  onActivate: () => void
  onToggleMaximize: () => void
}

const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3]

/** Renders every page of an encapsulated PDF report to canvases (pdf.js), with zoom and download. */
export default function PdfViewer({ viewportId, displaySet, active, onActivate, onToggleMaximize }: PdfViewerProps) {
  const { t } = useTranslation()
  const file = displaySet.series.images[0].file
  const pagesRef = useRef<HTMLDivElement>(null)
  const [pdfDoc, setPdfDoc] = useState<{ pdf: pdfjs.PDFDocumentProxy; bytes: Uint8Array } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1) // relative to fitting the page width
  const [width, setWidth] = useState(0)

  useEffect(() => {
    let cancelled = false
    let task: pdfjs.PDFDocumentLoadingTask | null = null
    encapsulatedPdf(file)
      .then((bytes) => {
        if (cancelled) return
        // pdf.js takes ownership of (detaches) the buffer it is given, so it gets a copy.
        task = pdfjs.getDocument({ data: bytes.slice() })
        return task.promise.then((pdf) => !cancelled && setPdfDoc({ pdf, bytes }))
      })
      .catch((reason: unknown) => !cancelled && setError(String(reason)))
    return () => {
      cancelled = true
      void task?.destroy()
    }
  }, [file])

  // Re-render when the cell is resized (layout change, maximize, side panel).
  useEffect(() => {
    const element = pagesRef.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const container = pagesRef.current
    if (!pdfDoc || !container || width === 0) return
    let cancelled = false
    const render = async () => {
      container.replaceChildren()
      for (let number = 1; number <= pdfDoc.pdf.numPages && !cancelled; number++) {
        const page = await pdfDoc.pdf.getPage(number)
        const base = page.getViewport({ scale: 1 })
        const scale = ((width - 16) / base.width) * zoom
        const viewport = page.getViewport({ scale: scale * window.devicePixelRatio })
        const canvas = document.createElement('canvas')
        canvas.width = Math.floor(viewport.width)
        canvas.height = Math.floor(viewport.height)
        canvas.style.width = `${Math.floor(viewport.width / window.devicePixelRatio)}px`
        canvas.className = 'mx-auto mb-3 bg-white shadow'
        canvas.setAttribute('aria-label', t('pdf.page', { number, total: pdfDoc.pdf.numPages }))
        container.append(canvas)
        await page.render({ canvas, viewport }).promise
      }
    }
    void render()
    return () => {
      cancelled = true
    }
  }, [pdfDoc, width, zoom, t])

  const download = () => {
    if (!pdfDoc) return
    const url = URL.createObjectURL(new Blob([pdfDoc.bytes.slice() as BlobPart], { type: 'application/pdf' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `${(displaySet.series.description || 'report').replace(/[^\w.-]+/g, '_')}.pdf`
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const step = (direction: 1 | -1) => setZoom((z) => ZOOMS[Math.min(ZOOMS.length - 1, Math.max(0, ZOOMS.indexOf(z) + direction))])

  return (
    <ViewportFrame viewportId={viewportId} kind="pdf" active={active} onActivate={onActivate} onToggleMaximize={onToggleMaximize}>
      <div className="flex items-center gap-1 border-b border-slate-800 bg-slate-900 px-2 py-1 text-xs text-slate-200">
        <span className="min-w-0 flex-1 truncate font-medium">
          📄 {displaySet.series.description}
          {pdfDoc && <span className="text-slate-500"> · {t('pdf.pages', { count: pdfDoc.pdf.numPages })}</span>}
        </span>
        <button className="rounded px-2 py-1 hover:bg-slate-800" aria-label={t('pdf.zoomOut')} onClick={() => step(-1)}>
          −
        </button>
        <span className="w-10 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
        <button className="rounded px-2 py-1 hover:bg-slate-800" aria-label={t('pdf.zoomIn')} onClick={() => step(1)}>
          +
        </button>
        <button className="rounded px-2 py-1 hover:bg-slate-800" aria-label={t('pdf.download')} onClick={download} disabled={!pdfDoc}>
          ⤓
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto bg-slate-800 p-2">
        {error && <p className="p-4 text-center text-sm text-red-300">{t('pdf.failed', { error })}</p>}
        {!pdfDoc && !error && <p className="p-4 text-center text-sm text-slate-400">{t('panels.loading')}</p>}
        <div ref={pagesRef} role="document" aria-label={displaySet.series.description} />
      </div>
    </ViewportFrame>
  )
}
