// Printing and PDF: rendered images laid out on pages, with a header
// (patient and study) and a footer (page numbers). Header and footer are
// drawn as images, so any script (Bengali, Arabic, …) prints correctly.
import { t } from '../i18n'
import { useSettings } from '../store/settingsStore'
import { selectCurrentDisplaySet, useViewer } from '../store/viewerStore'
import { encodePdf, MM, type PdfImage } from './encoders/pdf'
import { collectImages, type CollectedImage, type ImageExportOptions, type Progress } from './exportImages'
import { downloadBlob, safeName, stamp } from './files'
import { pageLayout, paginate, placeImage, type Box, type Orientation, type Paper, type PerPage } from './layout'

export interface PrintOptions extends Omit<ImageExportOptions, 'format' | 'quality'> {
  perPage: PerPage
  paper: Paper
  orientation: Orientation
  header: boolean
  footer: boolean
  /** Images at their physical size where they fit (rendered at their own pixel size). */
  trueSize: boolean
}

/** Pixels per mm for header and footer text images (about 300 dpi). */
const TEXT_DPMM = 12

function textImage(lines: string[], box: Box, align: 'left' | 'center') {
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(box.w * TEXT_DPMM)
  canvas.height = Math.round(box.h * TEXT_DPMM)
  const context = canvas.getContext('2d')!
  context.fillStyle = '#fff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.fillStyle = '#000'
  const size = Math.min(canvas.height / (lines.length * 1.3), 4 * TEXT_DPMM)
  context.font = `${size}px Helvetica, Arial, sans-serif`
  context.textBaseline = 'top'
  context.textAlign = align
  lines.forEach((line, i) => context.fillText(line, align === 'center' ? canvas.width / 2 : 0, i * size * 1.3))
  return canvas
}

function headerLines() {
  const displaySet = selectCurrentDisplaySet(useViewer.getState())
  if (!displaySet) return []
  const { study, series } = displaySet
  const privacy = useSettings.getState().display.privacy
  const patient = privacy ? t('viewport.hiddenPatient') : [study.patientName || t('viewport.anonymous'), study.patientId].filter(Boolean).join(' · ')
  return [patient, [study.studyDate, study.description, `${series.modality} #${series.seriesNumber} ${series.description}`].filter(Boolean).join(' · ')]
}

interface PlacedPage {
  width: number
  height: number
  items: { canvas: HTMLCanvasElement; box: Box; jpeg: boolean }[]
}

function layoutPages(images: CollectedImage[], options: PrintOptions): PlacedPage[] {
  const pages = paginate(images, options.perPage)
  const header = headerLines()
  return pages.map((pageImages, pageIndex) => {
    const layout = pageLayout(options.paper, options.orientation, options.perPage, options.header, options.footer)
    const items: PlacedPage['items'] = pageImages.map((image, i) => ({
      canvas: image.canvas,
      box: placeImage(layout.cells[i], image.canvas.width, image.canvas.height, options.trueSize ? image.physical : null),
      jpeg: true,
    }))
    if (layout.header) items.push({ canvas: textImage(header, layout.header, 'left'), box: layout.header, jpeg: false })
    if (layout.footer) {
      const footer = t('print.footerPage', { page: pageIndex + 1, pages: pages.length, date: new Date().toLocaleDateString() })
      items.push({ canvas: textImage([footer], layout.footer, 'center'), box: layout.footer, jpeg: false })
    }
    return { width: layout.width, height: layout.height, items }
  })
}

async function jpegBytes(canvas: HTMLCanvasElement) {
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('JPEG failed'))), 'image/jpeg', 0.92))
  return new Uint8Array(await blob.arrayBuffer())
}

export async function exportPdf(options: PrintOptions, onProgress: (p: Progress) => void, signal?: AbortSignal) {
  const images = await collectImages({ ...options, native: options.native || options.trueSize }, onProgress, signal)
  if (images.length === 0) return 0
  const pages = layoutPages(images, options)
  const pdfPages = await Promise.all(
    pages.map(async (page) => ({
      width: page.width * MM,
      height: page.height * MM,
      texts: [],
      images: await Promise.all(
        page.items.map(
          async ({ canvas, box }): Promise<PdfImage> => ({
            jpeg: await jpegBytes(canvas),
            width: canvas.width,
            height: canvas.height,
            x: box.x * MM,
            y: box.y * MM,
            w: box.w * MM,
            h: box.h * MM,
          }),
        ),
      ),
    })),
  )
  const displaySet = selectCurrentDisplaySet(useViewer.getState())
  const name = safeName(displaySet ? `${displaySet.study.description || displaySet.series.modality}_${stamp()}` : `print_${stamp()}`)
  downloadBlob(new Blob([encodePdf(pdfPages, name)], { type: 'application/pdf' }), `${name}.pdf`)
  return pdfPages.length
}

const PRINT_ROOT_ID = 'print-root'

/**
 * Prints through the browser: the pages are added to the document for print
 * media only (the viewer is hidden while printing) and removed afterwards.
 */
export async function printImages(options: PrintOptions, onProgress: (p: Progress) => void, signal?: AbortSignal) {
  const images = await collectImages({ ...options, native: options.native || options.trueSize }, onProgress, signal)
  if (images.length === 0) return 0
  const pages = layoutPages(images, options)
  document.getElementById(PRINT_ROOT_ID)?.remove()
  const root = document.createElement('div')
  root.id = PRINT_ROOT_ID
  const { width, height } = pages[0]
  const style = document.createElement('style')
  style.textContent = `
    #${PRINT_ROOT_ID} { display: none }
    @page { size: ${width}mm ${height}mm; margin: 0 }
    @media print {
      body > *:not(#${PRINT_ROOT_ID}) { display: none !important }
      #${PRINT_ROOT_ID} { display: block }
      #${PRINT_ROOT_ID} .page { position: relative; width: ${width}mm; height: ${height}mm; page-break-after: always; break-after: page; background: #fff; overflow: hidden }
      #${PRINT_ROOT_ID} img { position: absolute }
    }`
  root.appendChild(style)
  const urls: string[] = []
  for (const page of pages) {
    const element = document.createElement('div')
    element.className = 'page'
    for (const { canvas, box } of page.items) {
      const image = document.createElement('img')
      const url = canvas.toDataURL('image/png')
      urls.push(url)
      image.src = url
      Object.assign(image.style, { left: `${box.x}mm`, top: `${box.y}mm`, width: `${box.w}mm`, height: `${box.h}mm` })
      element.appendChild(image)
    }
    root.appendChild(element)
  }
  document.body.appendChild(root)
  await Promise.all([...root.querySelectorAll('img')].map((image) => image.decode().catch(() => undefined)))
  const cleanUp = () => root.remove()
  window.addEventListener('afterprint', cleanUp, { once: true })
  window.print()
  return pages.length
}
