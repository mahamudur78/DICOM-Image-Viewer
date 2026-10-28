import { metaData } from '@cornerstonejs/core'
import type { FrameInfo } from './frames'

interface ImagePlane {
  frameOfReferenceUID?: string
  rows: number
  columns: number
  imageOrientationPatient: number[]
  rowCosines: number[]
  columnCosines: number[]
  imagePositionPatient: number[]
  sliceThickness?: number
  pixelSpacing?: number[]
  rowPixelSpacing: number
  columnPixelSpacing: number
}

const planes = new Map<string, ImagePlane>()

/**
 * Records geometry from the header we already parsed, keyed by image id.
 * The image loader only knows the geometry of images it has loaded, but slice
 * sync needs every target image's position up front.
 */
export function recordImagePlane(
  imageId: string,
  frame: FrameInfo & { rows: number; columns: number; frameOfReferenceUID?: string },
) {
  const { position, orientation, pixelSpacing } = frame
  if (position?.length !== 3 || orientation?.length !== 6) return
  planes.set(imageId, {
    frameOfReferenceUID: frame.frameOfReferenceUID,
    rows: frame.rows,
    columns: frame.columns,
    imageOrientationPatient: orientation,
    rowCosines: orientation.slice(0, 3),
    columnCosines: orientation.slice(3, 6),
    imagePositionPatient: position,
    sliceThickness: frame.sliceThickness,
    pixelSpacing,
    rowPixelSpacing: pixelSpacing?.[0] ?? 1,
    columnPixelSpacing: pixelSpacing?.[1] ?? 1,
  })
}

/**
 * Window and rescale of enhanced multi-frame frames. They live in functional
 * groups that the image loader's metadata provider does not read, so without
 * this the first window would be the full pixel range.
 */
const frameLuts = new Map<string, { voi?: { windowCenter: number[]; windowWidth: number[] }; rescale?: { rescaleIntercept: number; rescaleSlope: number } }>()

export function recordFrameLuts(imageId: string, frame: FrameInfo) {
  const voi =
    frame.windowCenter !== undefined && frame.windowWidth !== undefined
      ? { windowCenter: [frame.windowCenter], windowWidth: [frame.windowWidth] }
      : undefined
  const rescale =
    frame.rescaleIntercept !== undefined || frame.rescaleSlope !== undefined
      ? { rescaleIntercept: frame.rescaleIntercept ?? 0, rescaleSlope: frame.rescaleSlope ?? 1 }
      : undefined
  if (voi || rescale) frameLuts.set(imageId, { voi, rescale })
}

export function getImagePlane(imageId: string) {
  return planes.get(imageId)
}

export function clearImagePlanes() {
  planes.clear()
  frameLuts.clear()
}

/** Lower than the loader's provider (0), so loaded images keep their own metadata. */
const FALLBACK_PRIORITY = -100

/** Above the loader's provider (0): only answers for enhanced frames it knows better. */
const FRAME_LUT_PRIORITY = 100

export function registerImagePlaneProvider() {
  metaData.addProvider((type: string, imageId: string) => {
    if (type === 'imagePlaneModule') return planes.get(imageId)
    return undefined
  }, FALLBACK_PRIORITY)

  metaData.addProvider((type: string, imageId: string) => {
    const luts = frameLuts.get(imageId)
    if (!luts) return undefined
    if (type === 'voiLutModule') return luts.voi
    if (type === 'modalityLutModule') return luts.rescale
    return undefined
  }, FRAME_LUT_PRIORITY)
}
