import { utilities } from '@cornerstonejs/core'
import { useEffect, useRef, useState } from 'react'
import type { Series } from '../dicom/types'
import { documentThumbnail } from '../thumbnails/documentThumbnails'

/** Canvas resolution; the canvas is scaled to the thumbnail box with CSS. */
const RESOLUTION = 256

const KIND_ICONS = { video: '🎬', pdf: '📄', sr: '📝' }

/** Objects without pixels of their own. */
const OBJECT_ICONS: Partial<Record<Series['kind'], string>> = {
  ko: '★',
  pr: '🖼',
  seg: '🧩',
  rtstruct: '⬠',
  rtdose: '☢',
  rtplan: '📋',
  pmap: '🌈',
  waveform: '〰',
  sm: '🔬',
}

const BOX = 'relative h-16 w-16 shrink-0 overflow-hidden rounded border border-slate-700 bg-black lg:h-28 lg:w-28'

/** Renders the middle image of a series into a small canvas; videos, PDFs and reports get an icon. */
export function SeriesThumbnail({ series }: { series: Series }) {
  if (series.kind === 'sr') return <IconThumbnail icon={KIND_ICONS.sr} />
  const icon = OBJECT_ICONS[series.kind]
  if (icon) return <IconThumbnail icon={icon} />
  if (series.kind !== 'image') return <DocumentThumbnail series={series} />
  return <ImageThumbnail series={series} />
}

const IconThumbnail = ({ icon }: { icon: string }) => (
  <div className={`${BOX} grid place-items-center bg-slate-800 text-3xl lg:text-5xl`} aria-hidden>
    {icon}
  </div>
)

/** First PDF page or a video frame, made once the thumbnail scrolls into view. */
function DocumentThumbnail({ series }: { series: Series }) {
  const ref = useRef<HTMLDivElement>(null)
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return
      observer.disconnect()
      void documentThumbnail(series).then((value) => !cancelled && setUrl(value))
    })
    observer.observe(ref.current!)
    return () => {
      cancelled = true
      observer.disconnect()
    }
  }, [series])

  return (
    <div ref={ref} className={`${BOX} grid place-items-center bg-slate-800 text-3xl lg:text-5xl`}>
      {url ? <img src={url} alt="" className="h-full w-full object-contain" /> : <span aria-hidden>{KIND_ICONS[series.kind as 'pdf' | 'video']}</span>}
      <span className="absolute bottom-0.5 right-0.5 text-xs" aria-hidden>
        {KIND_ICONS[series.kind as 'pdf' | 'video']}
      </span>
    </div>
  )
}

function ImageThumbnail({ series }: { series: Series }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current!
    canvas.width = RESOLUTION
    canvas.height = RESOLUTION
    const image = series.images[Math.floor(series.images.length / 2)]
    utilities.loadImageToCanvas({ canvas, imageId: image.imageId }).catch(() => setFailed(true))
  }, [series])

  return (
    <div className={BOX}>
      {/* loadImageToCanvas sets an inline pixel size, so the box size must win. */}
      <canvas ref={canvasRef} className="h-full! w-full!" />
      {failed && (
        <span className="absolute inset-0 grid place-items-center text-xs text-slate-500">{series.modality || 'N/A'}</span>
      )}
      <span className="absolute left-1 top-1 flex items-center gap-1 rounded bg-black/70 px-1 text-[10px] font-semibold text-slate-100">
        <svg viewBox="0 0 16 16" className="h-3 w-3 fill-current" aria-hidden>
          <path d="M8 1 1 4.5 8 8l7-3.5L8 1Zm-5.6 6.2L1 8l7 3.5L15 8l-1.4-.8L8 10 2.4 7.2Zm0 3.5L1 11.5 8 15l7-3.5-1.4-.8L8 13.5l-5.6-2.8Z" />
        </svg>
        {series.images.length}
      </span>
    </div>
  )
}
