// Exporting images and movies of the viewports.
import { metaData } from '@cornerstonejs/core'
import { spacingSource } from '../dicom/imagePlaneMetadata'
import { viewportIdAt } from '../cornerstone/constants'
import { getViewport } from '../cornerstone/viewer'
import { viewportKind } from '../cornerstone/viewportRegistry'
import type { DisplaySet } from '../dicom/types'
import { useSettings } from '../store/settingsStore'
import { filterElementId, getFilter } from '../store/viewportDisplayStore'
import { selectCurrentDisplaySet, selectTargetViewportId, useViewer } from '../store/viewerStore'
import { encodeAvi } from './encoders/avi'
import { encodeGif } from './encoders/gif'
import { encodeBmp, encodeTiff } from './encoders/raster'
import { safeName, saveFiles, stamp, type OutputFile } from './files'
import { captureCurrent, composeViewport, createExportViewport, type CornerInfo, type RenderOptions } from './render'

export type ImageFormat = 'png' | 'jpeg' | 'webp' | 'bmp' | 'tiff'
export type ImageScope = 'current' | 'series' | 'visible'

export interface ImageExportOptions extends Omit<RenderOptions, 'filter' | 'privacy'> {
  format: ImageFormat
  /** JPEG and WebP quality, 0–1. */
  quality: number
  scope: ImageScope
  /** 1-based image range of the series (scope "series"). */
  from: number
  to: number
  /** Each image at its own pixel size instead of as seen on screen. */
  native: boolean
}

export interface Progress {
  done: number
  total: number
}

export class ExportCancelled extends Error {}

const EXTENSIONS: Record<ImageFormat, string> = { png: 'png', jpeg: 'jpg', webp: 'webp', bmp: 'bmp', tiff: 'tif' }

function toBlob(canvas: HTMLCanvasElement, type: string, quality?: number) {
  return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Encoding failed'))), type, quality))
}

const pixels = (canvas: HTMLCanvasElement) => canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height)

export async function encodeCanvas(canvas: HTMLCanvasElement, format: ImageFormat, quality = 0.92): Promise<Blob> {
  if (format === 'bmp') return new Blob([encodeBmp(pixels(canvas))], { type: 'image/bmp' })
  if (format === 'tiff') return new Blob([encodeTiff(pixels(canvas))], { type: 'image/tiff' })
  // JPEG has no transparency: the canvas is already opaque (black background).
  return toBlob(canvas, `image/${format}`, format === 'png' ? undefined : quality)
}

const filterOf = (viewportId: string) => {
  const filter = getFilter(viewportId)
  return filter ? `url(#${filterElementId(filter)})` : ''
}

const renderOptions = (options: ImageExportOptions, viewportId: string): RenderOptions => ({
  annotations: options.annotations,
  overlays: options.overlays,
  info: options.info,
  privacy: useSettings.getState().display.privacy,
  filter: filterOf(viewportId),
})

/** The display set and image position a viewport shows, for corner text and file names. */
function infoFor(viewportId: string, displaySet: DisplaySet | null | undefined): CornerInfo | null {
  if (!displaySet) return null
  const viewport = getViewport(viewportId)
  const index = viewport?.getCurrentImageIdIndex?.() ?? 0
  return { displaySet, index, count: displaySet.series.images.length }
}

const baseName = (info: CornerInfo | null) => safeName(info ? info.displaySet.series.description || `${info.displaySet.series.modality}_${info.displaySet.series.seriesNumber}` : 'image')

/** Renders the images of a stack (a range, 0-based inclusive) in the hidden viewport. */
async function* stackFrames(viewportId: string, displaySet: DisplaySet, from: number, to: number, native: boolean, options: RenderOptions, signal?: AbortSignal) {
  const imageIds = displaySet.series.images.map((image) => image.imageId)
  const hidden = await createExportViewport(viewportId, imageIds, native)
  try {
    for (let index = from; index <= to; index++) {
      if (signal?.aborted) throw new ExportCancelled()
      await hidden.show(index)
      const info = { displaySet, index, count: imageIds.length }
      yield { index, canvas: await composeViewport(hidden.viewportId, options, info) }
    }
  } finally {
    hidden.destroy()
  }
}

export async function exportImages(options: ImageExportOptions, onProgress: (p: Progress) => void, signal?: AbortSignal) {
  const state = useViewer.getState()
  const targetId = selectTargetViewportId(state)
  if (!targetId) return
  const extension = EXTENSIONS[options.format]
  const files: OutputFile[] = []

  if (options.scope === 'visible' && !state.volumeView) {
    const cells = Array.from({ length: state.layout.rows * state.layout.cols }, (_, cell) => cell).filter((cell) => state.cells[cell] && getViewport(viewportIdAt(cell)))
    for (const [i, cell] of cells.entries()) {
      const viewportId = viewportIdAt(cell)
      const info = infoFor(viewportId, state.cells[cell])
      const canvas = await captureCurrent(viewportId, renderOptions(options, viewportId), info)
      files.push({ name: `${i + 1}_${baseName(info)}_${(info?.index ?? 0) + 1}.${extension}`, data: await encodeCanvas(canvas, options.format, options.quality) })
      onProgress({ done: i + 1, total: cells.length })
    }
  } else if (viewportKind(targetId) === 'stack' && (options.scope === 'series' || options.native)) {
    const displaySet = selectCurrentDisplaySet(state)!
    const count = displaySet.series.images.length
    const current = getViewport(targetId)!.getCurrentImageIdIndex()
    const [from, to] = options.scope === 'series' ? [Math.max(1, options.from) - 1, Math.min(count, options.to) - 1] : [current, current]
    const total = to - from + 1
    for await (const { index, canvas } of stackFrames(targetId, displaySet, from, to, options.native, renderOptions(options, targetId), signal)) {
      files.push({ name: `${baseName({ displaySet, index, count })}_${String(index + 1).padStart(String(count).length, '0')}.${extension}`, data: await encodeCanvas(canvas, options.format, options.quality) })
      onProgress({ done: files.length, total })
    }
  } else {
    const info = infoFor(targetId, selectCurrentDisplaySet(state))
    const canvas = await captureCurrent(targetId, renderOptions(options, targetId), info)
    files.push({ name: `${baseName(info)}_${(info?.index ?? 0) + 1}.${extension}`, data: await encodeCanvas(canvas, options.format, options.quality) })
    onProgress({ done: 1, total: 1 })
  }
  await saveFiles(files, `images-${stamp()}.zip`)
  return files.length
}

/** The current viewport's image as PNG, for the clipboard or a region capture. */
export async function currentImageCanvas(withText: boolean) {
  const state = useViewer.getState()
  const viewportId = selectTargetViewportId(state)
  if (!viewportId) return null
  const display = useSettings.getState().display
  return captureCurrent(
    viewportId,
    { annotations: true, overlays: display.dicomOverlays, info: withText && display.overlayText, privacy: display.privacy, filter: filterOf(viewportId) },
    infoFor(viewportId, selectCurrentDisplaySet(state)),
  )
}

// --- movies -------------------------------------------------------------------------

export type MovieFormat = 'mp4' | 'webm' | 'gif' | 'avi'

export interface MovieOptions extends Omit<RenderOptions, 'filter' | 'privacy'> {
  format: MovieFormat
  fps: number
  from: number
  to: number
  native: boolean
}

/** Canvas copied to even dimensions (video encoders need them). */
function evenCanvas(canvas: HTMLCanvasElement) {
  if (canvas.width % 2 === 0 && canvas.height % 2 === 0) return canvas
  const even = document.createElement('canvas')
  even.width = canvas.width + (canvas.width % 2)
  even.height = canvas.height + (canvas.height % 2)
  const context = even.getContext('2d')!
  context.fillStyle = '#000'
  context.fillRect(0, 0, even.width, even.height)
  context.drawImage(canvas, 0, 0)
  return even
}

/** A GIF of a large image would be huge and slow; the longest side is limited. */
function limitSize(canvas: HTMLCanvasElement, longest: number) {
  const scale = Math.min(1, longest / Math.max(canvas.width, canvas.height))
  if (scale === 1) return canvas
  const small = document.createElement('canvas')
  small.width = Math.round(canvas.width * scale)
  small.height = Math.round(canvas.height * scale)
  small.getContext('2d')!.drawImage(canvas, 0, 0, small.width, small.height)
  return small
}

/** The first video codec the browser can encode at this size, of those the container takes. */
async function videoCodec(candidates: string[], width: number, height: number) {
  if (typeof VideoEncoder === 'undefined') return null
  for (const codec of candidates) {
    const { supported } = await VideoEncoder.isConfigSupported({ codec, width, height, bitrate: 4_000_000 })
    if (supported) return codec
  }
  return null
}

const MP4_CODECS = ['avc1.42003e', 'avc1.640033', 'vp09.00.40.08']
const WEBM_CODECS = ['vp09.00.40.08', 'vp8']

export class MovieUnsupported extends Error {}

export async function exportMovie(options: MovieOptions, onProgress: (p: Progress) => void, signal?: AbortSignal) {
  const state = useViewer.getState()
  const viewportId = selectTargetViewportId(state)
  const displaySet = selectCurrentDisplaySet(state)
  if (!viewportId || !displaySet || viewportKind(viewportId) !== 'stack') return
  const count = displaySet.series.images.length
  const from = Math.max(1, options.from) - 1
  const to = Math.min(count, options.to) - 1
  const total = to - from + 1
  const render = renderOptions({ ...options, format: 'png', quality: 1, scope: 'series' }, viewportId)
  const frames = stackFrames(viewportId, displaySet, from, to, options.native, render, signal)
  const name = `${baseName({ displaySet, index: 0, count })}.${options.format}`
  let done = 0
  const step = () => onProgress({ done: ++done, total })

  if (options.format === 'gif' || options.format === 'avi') {
    const collected: HTMLCanvasElement[] = []
    for await (const { canvas } of frames) {
      collected.push(options.format === 'gif' ? limitSize(canvas, 1024) : evenCanvas(canvas))
      step()
    }
    const { width, height } = collected[0]
    const bytes =
      options.format === 'gif'
        ? encodeGif(collected.map(pixels), 1000 / options.fps)
        : encodeAvi(await Promise.all(collected.map(async (c) => new Uint8Array(await (await encodeCanvas(c, 'jpeg', 0.9)).arrayBuffer()))), width, height, options.fps)
    await saveFiles([{ name, data: new Blob([bytes], { type: options.format === 'gif' ? 'image/gif' : 'video/x-msvideo' }) }], name)
    return total
  }

  // MP4 and WebM: WebCodecs encodes, a muxer writes the container.
  let encoder: VideoEncoder | null = null
  let finish: () => Blob = () => new Blob()
  let index = 0
  for await (const { canvas: raw } of frames) {
    const canvas = evenCanvas(raw)
    if (!encoder) {
      const { width, height } = canvas
      const codec = await videoCodec(options.format === 'mp4' ? MP4_CODECS : WEBM_CODECS, width, height)
      if (!codec) throw new MovieUnsupported(options.format)
      if (options.format === 'mp4') {
        const { Muxer, ArrayBufferTarget } = await import('mp4-muxer')
        const muxer = new Muxer({ target: new ArrayBufferTarget(), video: { codec: codec.startsWith('avc') ? 'avc' : 'vp9', width, height, frameRate: options.fps }, fastStart: 'in-memory' })
        encoder = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: (e) => console.error(e) })
        finish = () => {
          muxer.finalize()
          return new Blob([muxer.target.buffer], { type: 'video/mp4' })
        }
      } else {
        const { Muxer, ArrayBufferTarget } = await import('webm-muxer')
        const muxer = new Muxer({ target: new ArrayBufferTarget(), video: { codec: codec === 'vp8' ? 'V_VP8' : 'V_VP9', width, height, frameRate: options.fps } })
        encoder = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: (e) => console.error(e) })
        finish = () => {
          muxer.finalize()
          return new Blob([muxer.target.buffer], { type: 'video/webm' })
        }
      }
      encoder.configure({ codec, width, height, bitrate: 4_000_000, framerate: options.fps })
    }
    const frame = new VideoFrame(canvas, { timestamp: Math.round((index * 1_000_000) / options.fps), duration: Math.round(1_000_000 / options.fps) })
    encoder.encode(frame, { keyFrame: index % 30 === 0 })
    frame.close()
    index++
    step()
  }
  if (!encoder) return 0
  await encoder.flush()
  encoder.close()
  await saveFiles([{ name, data: finish() }], name)
  return total
}

// --- images for print and PDF -------------------------------------------------------------

export interface CollectedImage {
  canvas: HTMLCanvasElement
  /** Physical size in mm when rendered at the image's own pixel size with a known spacing. */
  physical: [number, number] | null
}

/** Physical size of an image's pixels (columns × spacing), if the image has real spacing. */
function physicalSize(imageId: string, canvas: HTMLCanvasElement): [number, number] | null {
  if (spacingSource(imageId) === 'none') return null
  const plane = metaData.get('imagePlaneModule', imageId) as { columnPixelSpacing?: number; rowPixelSpacing?: number } | undefined
  if (!plane?.columnPixelSpacing || !plane.rowPixelSpacing) return null
  return [canvas.width * plane.columnPixelSpacing, canvas.height * plane.rowPixelSpacing]
}

/** Renders images for a print or PDF job: the current image, a series range or every visible viewport. */
export async function collectImages(
  options: Omit<ImageExportOptions, 'format' | 'quality'>,
  onProgress: (p: Progress) => void,
  signal?: AbortSignal,
): Promise<CollectedImage[]> {
  const state = useViewer.getState()
  const targetId = selectTargetViewportId(state)
  if (!targetId) return []
  const out: CollectedImage[] = []
  if (options.scope === 'visible' && !state.volumeView) {
    const cells = Array.from({ length: state.layout.rows * state.layout.cols }, (_, cell) => cell).filter((cell) => state.cells[cell] && getViewport(viewportIdAt(cell)))
    for (const cell of cells) {
      const viewportId = viewportIdAt(cell)
      const canvas = await captureCurrent(viewportId, renderOptions({ ...options, format: 'png', quality: 1 }, viewportId), infoFor(viewportId, state.cells[cell]))
      out.push({ canvas, physical: null })
      onProgress({ done: out.length, total: cells.length })
    }
    return out
  }
  if (viewportKind(targetId) === 'stack' && (options.scope === 'series' || options.native)) {
    const displaySet = selectCurrentDisplaySet(state)!
    const count = displaySet.series.images.length
    const current = getViewport(targetId)!.getCurrentImageIdIndex()
    const [from, to] = options.scope === 'series' ? [Math.max(1, options.from) - 1, Math.min(count, options.to) - 1] : [current, current]
    for await (const { index, canvas } of stackFrames(targetId, displaySet, from, to, options.native, renderOptions({ ...options, format: 'png', quality: 1 }, targetId), signal)) {
      out.push({ canvas, physical: options.native ? physicalSize(displaySet.series.images[index].imageId, canvas) : null })
      onProgress({ done: out.length, total: to - from + 1 })
    }
    return out
  }
  const canvas = await captureCurrent(targetId, renderOptions({ ...options, format: 'png', quality: 1 }, targetId), infoFor(targetId, selectCurrentDisplaySet(state)))
  onProgress({ done: 1, total: 1 })
  return [{ canvas, physical: null }]
}
