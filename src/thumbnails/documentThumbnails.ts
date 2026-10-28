import type { Series } from '../dicom/types'

/** Thumbnail data URLs by series id (null when one could not be made). */
const cache = new Map<string, Promise<string | null>>()

const SIZE = 192

function toDataUrl(source: CanvasImageSource, width: number, height: number) {
  const scale = Math.min(SIZE / width, SIZE / height)
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width * scale))
  canvas.height = Math.max(1, Math.round(height * scale))
  canvas.getContext('2d')!.drawImage(source, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', 0.8)
}

async function pdfThumbnail(file: File) {
  const [{ encapsulatedPdf }, pdfjs] = await Promise.all([import('../dicom/pdf'), import('../components/pdfjs')])
  const task = pdfjs.getDocument({ data: await encapsulatedPdf(file) })
  try {
    const page = await (await task.promise).getPage(1)
    const viewport = page.getViewport({ scale: SIZE / page.getViewport({ scale: 1 }).width })
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(viewport.width)
    canvas.height = Math.round(viewport.height)
    await page.render({ canvas, viewport }).promise
    return canvas.toDataURL('image/jpeg', 0.8)
  } finally {
    void task.destroy()
  }
}

async function videoThumbnail(file: File, frameRate: number | null) {
  const { readDicomVideo } = await import('../video/dicomVideo')
  const video = await readDicomVideo(file, frameRate)
  if (!video.playable) return null
  const url = URL.createObjectURL(video.blob)
  const element = document.createElement('video')
  element.muted = true
  element.src = url
  try {
    await new Promise<void>((resolve, reject) => {
      element.onloadeddata = () => resolve()
      element.onerror = () => reject(new Error('cannot decode'))
    })
    // A little past the start: the very first frame of many recordings is black.
    element.currentTime = Math.min(0.5, element.duration / 2 || 0)
    await new Promise((resolve) => (element.onseeked = resolve))
    return toDataUrl(element, element.videoWidth, element.videoHeight)
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** First page of a PDF or a frame of a video, as a small image; null when it cannot be made. */
export function documentThumbnail(series: Series): Promise<string | null> {
  let thumbnail = cache.get(series.id)
  if (!thumbnail) {
    const file = series.images[0].file
    const make = series.kind === 'pdf' ? pdfThumbnail(file) : series.kind === 'video' ? videoThumbnail(file, series.frameRate) : Promise.resolve(null)
    thumbnail = make.catch(() => null)
    cache.set(series.id, thumbnail)
  }
  return thumbnail
}

/** Thumbnails belong to the opened files; free them with the files. */
export const clearDocumentThumbnails = () => cache.clear()
