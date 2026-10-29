import dicomParser from 'dicom-parser'
import { useCallback, useEffect, useRef, useState, type PointerEvent, type WheelEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { DisplaySet } from '../dicom/types'
import { readObject, type DataSet } from '../objects/dicom'
import { levelForZoom, parseSlideLevel, pyramid, type SlideLevel } from '../objects/slide'
import { ViewportFrame } from './ViewportFrame'

interface Props {
  viewportId: string
  cell: number
  displaySet: DisplaySet
  active: boolean
  onActivate: () => void
  onToggleMaximize: () => void
}

interface Level extends SlideLevel {
  dataSet: DataSet
  /** Decoded tiles by frame. */
  bitmaps: Map<number, ImageBitmap | 'loading' | 'failed'>
}

const UNCOMPRESSED = new Set(['1.2.840.10008.1.2', '1.2.840.10008.1.2.1', '1.2.840.10008.1.2.2'])
const MAX_TILES = 400

/** One tile as a bitmap: raw RGB / grayscale, or a compressed frame the browser can decode (JPEG). */
async function decodeTile(level: Level, frame: number): Promise<ImageBitmap> {
  const { dataSet, tileWidth, tileHeight, samples } = level
  const pixel = dataSet.elements.x7fe00010
  if (UNCOMPRESSED.has(level.transferSyntax)) {
    const size = tileWidth * tileHeight * samples
    const bytes = dataSet.byteArray.subarray(pixel.dataOffset + frame * size, pixel.dataOffset + (frame + 1) * size)
    const rgba = new Uint8ClampedArray(tileWidth * tileHeight * 4)
    for (let i = 0; i < tileWidth * tileHeight; i++) {
      const [r, g, b] = samples >= 3 ? [bytes[i * 3], bytes[i * 3 + 1], bytes[i * 3 + 2]] : [bytes[i], bytes[i], bytes[i]]
      rgba.set([r, g, b, 255], i * 4)
    }
    return createImageBitmap(new ImageData(rgba, tileWidth, tileHeight))
  }
  const fragments = pixel.basicOffsetTable?.length ? pixel.basicOffsetTable : dicomParser.createJPEGBasicOffsetTable(dataSet, pixel)
  const bytes = dicomParser.readEncapsulatedImageFrame(dataSet, pixel, frame, fragments)
  return createImageBitmap(new Blob([bytes as BlobPart], { type: 'image/jpeg' }))
}

/** Whole-slide microscopy: tiled pyramid with zoom, pan and a length measurement. */
export default function SlideViewer({ viewportId, displaySet, active, onActivate, onToggleMaximize }: Props) {
  const { t } = useTranslation()
  const [levels, setLevels] = useState<Level[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<{ zoom: number; cx: number; cy: number } | null>(null)
  const [measuring, setMeasuring] = useState(false)
  const [line, setLine] = useState<[number, number][]>([])
  const [, setTick] = useState(0)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all(displaySet.series.images.map(async (image) => {
      const dataSet = await readObject(image.file)
      const level = parseSlideLevel(dataSet)
      return level ? [{ ...level, dataSet, bitmaps: new Map() } as Level] : []
    }))
      .then((list) => {
        if (cancelled) return
        const sorted = pyramid(list.flat()) as Level[]
        if (!sorted.length) setError(t('slide.noLevels'))
        else setLevels(sorted)
      })
      .catch((reason: unknown) => !cancelled && setError(String(reason)))
    return () => {
      cancelled = true
    }
  }, [displaySet, t])

  const fit = useCallback(() => {
    const box = boxRef.current
    if (!box || !levels) return
    const base = levels[0]
    setView({ zoom: Math.min(box.clientWidth / base.width, box.clientHeight / base.height) * 0.95, cx: base.width / 2, cy: base.height / 2 })
  }, [levels])

  useEffect(() => {
    if (levels && !view) fit()
  }, [levels, view, fit])

  // Draw the visible tiles of the level that suits the zoom.
  useEffect(() => {
    const canvas = canvasRef.current
    const box = boxRef.current
    if (!canvas || !box || !levels || !view) return
    const ratio = window.devicePixelRatio || 1
    canvas.width = Math.round(box.clientWidth * ratio)
    canvas.height = Math.round(box.clientHeight * ratio)
    const context = canvas.getContext('2d')!
    context.setTransform(ratio, 0, 0, ratio, 0, 0)
    context.fillStyle = '#f8fafc'
    context.fillRect(0, 0, box.clientWidth, box.clientHeight)
    const base = levels[0]
    const level = levelForZoom(levels, view.zoom) as Level
    const scale = level.width / base.width
    // Screen position of a level-0 pixel.
    const toScreen = (x: number, y: number) => [box.clientWidth / 2 + (x - view.cx) * view.zoom, box.clientHeight / 2 + (y - view.cy) * view.zoom]
    const left = view.cx - box.clientWidth / 2 / view.zoom
    const top = view.cy - box.clientHeight / 2 / view.zoom
    const right = view.cx + box.clientWidth / 2 / view.zoom
    const bottom = view.cy + box.clientHeight / 2 / view.zoom
    const [tx0, ty0] = [Math.max(0, Math.floor((left * scale) / level.tileWidth)), Math.max(0, Math.floor((top * scale) / level.tileHeight))]
    const [tx1, ty1] = [Math.min(Math.ceil(level.width / level.tileWidth) - 1, Math.floor((right * scale) / level.tileWidth)), Math.min(Math.ceil(level.height / level.tileHeight) - 1, Math.floor((bottom * scale) / level.tileHeight))]
    for (let ty = ty0; ty <= ty1; ty++)
      for (let tx = tx0; tx <= tx1; tx++) {
        const frame = level.tiles.get(`${tx},${ty}`)
        if (frame === undefined) continue
        const bitmap = level.bitmaps.get(frame)
        if (bitmap === undefined) {
          if (level.bitmaps.size > MAX_TILES) level.bitmaps.clear()
          level.bitmaps.set(frame, 'loading')
          decodeTile(level, frame)
            .then((b) => level.bitmaps.set(frame, b))
            .catch(() => level.bitmaps.set(frame, 'failed'))
            .finally(() => setTick((n) => n + 1))
          continue
        }
        if (typeof bitmap === 'string') continue
        const [x, y] = toScreen((tx * level.tileWidth) / scale, (ty * level.tileHeight) / scale)
        context.drawImage(bitmap, x, y, (level.tileWidth / scale) * view.zoom, (level.tileHeight / scale) * view.zoom)
      }
    if (line.length) {
      context.strokeStyle = '#2563eb'
      context.lineWidth = 2
      context.beginPath()
      line.forEach(([x, y], i) => {
        const [sx, sy] = toScreen(x, y)
        if (i) context.lineTo(sx, sy)
        else context.moveTo(sx, sy)
      })
      context.stroke()
    }
  })

  const toSlide = (event: PointerEvent<HTMLCanvasElement>): [number, number] => {
    const rect = event.currentTarget.getBoundingClientRect()
    return [view!.cx + (event.clientX - rect.left - rect.width / 2) / view!.zoom, view!.cy + (event.clientY - rect.top - rect.height / 2) / view!.zoom]
  }
  const zoomBy = (factor: number) => view && setView({ ...view, zoom: Math.max(0.01, Math.min(64, view.zoom * factor)) })
  const onWheel = (event: WheelEvent<HTMLCanvasElement>) => {
    if (!view) return
    const rect = event.currentTarget.getBoundingClientRect()
    const factor = event.deltaY < 0 ? 1.25 : 0.8
    const zoom = Math.max(0.01, Math.min(64, view.zoom * factor))
    // Keep the point under the cursor in place.
    const [mx, my] = [event.clientX - rect.left - rect.width / 2, event.clientY - rect.top - rect.height / 2]
    setView({ zoom, cx: view.cx + mx / view.zoom - mx / zoom, cy: view.cy + my / view.zoom - my / zoom })
  }

  const base = levels?.[0]
  const level = levels && view ? levelForZoom(levels, view.zoom) : null
  const lengthUm = base && line.length === 2 ? Math.hypot((line[1][0] - line[0][0]) * base.spacing[0], (line[1][1] - line[0][1]) * base.spacing[1]) * 1000 : null
  const BUTTON = 'rounded px-2 py-0.5 text-xs text-slate-300 hover:bg-slate-800 hover:text-white'

  return (
    <ViewportFrame viewportId={viewportId} kind="document" active={active} onActivate={onActivate} onToggleMaximize={onToggleMaximize}>
      <div className="flex min-h-0 flex-1 flex-col bg-slate-900" data-testid="slide-viewer">
        <div className="flex flex-wrap items-center gap-1 border-b border-slate-800 px-2 py-1 text-xs text-slate-300">
          <button className={BUTTON} onClick={() => zoomBy(1.5)} aria-label={t('slide.zoomIn')}>
            +
          </button>
          <button className={BUTTON} onClick={() => zoomBy(1 / 1.5)} aria-label={t('slide.zoomOut')}>
            −
          </button>
          <button className={BUTTON} onClick={fit}>
            {t('slide.fit')}
          </button>
          <button className={`${BUTTON} ${measuring ? 'bg-sky-600 text-white' : ''}`} aria-pressed={measuring} onClick={() => setMeasuring(!measuring)}>
            {t('slide.measure')}
          </button>
          {levels && level && view && (
            <span data-testid="slide-level" className="ml-2 text-slate-400">
              {t('slide.level', { level: levels.indexOf(level as Level) + 1, count: levels.length, zoom: Math.round(view.zoom * 100), um: Math.round((level.spacing[0] || 0) * 1e5) / 100 })}
            </span>
          )}
          {lengthUm !== null && (
            <span data-testid="slide-length" className="ml-2 text-amber-300">
              {lengthUm >= 1000 ? `${(lengthUm / 1000).toFixed(2)} mm` : `${lengthUm.toFixed(1)} µm`}
            </span>
          )}
        </div>
        <div ref={boxRef} className="relative min-h-0 flex-1">
          {error && <p className="p-4 text-red-300">{error}</p>}
          <canvas
            ref={canvasRef}
            className={`absolute inset-0 h-full w-full touch-none ${measuring ? 'cursor-crosshair' : 'cursor-grab'}`}
            onWheel={onWheel}
            onPointerDown={(event) => {
              if (!view) return
              event.currentTarget.setPointerCapture(event.pointerId)
              if (measuring) setLine([toSlide(event)])
              else drag.current = { x: event.clientX, y: event.clientY, cx: view.cx, cy: view.cy }
            }}
            onPointerMove={(event) => {
              if (!view) return
              if (measuring && line.length && event.buttons) setLine([line[0], toSlide(event)])
              const start = drag.current
              if (start) setView({ ...view, cx: start.cx - (event.clientX - start.x) / view.zoom, cy: start.cy - (event.clientY - start.y) / view.zoom })
            }}
            onPointerUp={() => (drag.current = null)}
            data-testid="slide-canvas"
          />
        </div>
      </div>
    </ViewportFrame>
  )
}
