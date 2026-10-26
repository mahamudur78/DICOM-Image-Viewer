import { utilities } from '@cornerstonejs/core'
import { useEffect, useRef, useState } from 'react'
import type { Series } from '../dicom/types'

/** Canvas resolution; the canvas is scaled to the thumbnail box with CSS. */
const RESOLUTION = 256

/** Renders the middle image of a series into a small canvas. */
export function SeriesThumbnail({ series }: { series: Series }) {
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
    <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded border border-slate-700 bg-black lg:h-28 lg:w-28">
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
