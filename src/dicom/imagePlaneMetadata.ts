import { metaData } from '@cornerstonejs/core'
import { wadouri } from '@cornerstonejs/dicom-image-loader'
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

export function getImagePlane(imageId: string | undefined) {
  if (!imageId) return undefined
  return planes.get(imageId)
}

/** SUV factors of PET images, read by the image loader to pre-scale pixels to SUVbw. */
const scaling = new Map<string, { suvbw: number; suvlbm?: number; suvbsa?: number }>()

export function recordScaling(imageId: string, factors: { suvbw: number; suvlbm?: number; suvbsa?: number }) {
  scaling.set(imageId, factors)
}

export const getScaling = (imageId: string) => scaling.get(imageId)

/**
 * Imager Pixel Spacing (0018,1164) of projection radiographs that have no
 * Pixel Spacing, with the Estimated Radiographic Magnification Factor
 * (0018,1114) when known. Spacing at the detector is larger than in the
 * patient; dividing by the magnification estimates the patient plane.
 */
const imagerSpacing = new Map<string, { spacing: number[]; magnification?: number }>()

export function recordImagerSpacing(imageId: string, spacing: number[], magnification?: number) {
  imagerSpacing.set(imageId, { spacing, magnification: magnification && magnification > 0 ? magnification : undefined })
}

/** Where an image's pixel spacing comes from: the image plane, the detector (corrected or not), or nowhere. */
export type SpacingSource = 'pixel' | 'ermf' | 'imager' | 'none'

export function spacingSource(imageId: string): SpacingSource {
  const plane = metaData.get('imagePlaneModule', imageId) as { usingDefaultValues?: boolean; rowPixelSpacing?: number } | undefined
  if (!plane || plane.usingDefaultValues || !(plane.rowPixelSpacing! > 0)) return 'none'
  const imager = imagerSpacing.get(imageId)
  return imager && !hasOwnSpacing(imageId) ? (imager.magnification ? 'ermf' : 'imager') : 'pixel'
}

const hasOwnSpacing = (imageId: string) => {
  const module = wadouri.metaData.metaDataProvider('imagePlaneModule', imageId) as { rowPixelSpacing?: number; usingDefaultValues?: boolean } | undefined
  return (module?.rowPixelSpacing ?? 0) > 0 && !module?.usingDefaultValues
}

export function clearImagePlanes() {
  planes.clear()
  frameLuts.clear()
  scaling.clear()
  imagerSpacing.clear()
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
    if (luts) {
      if (type === 'voiLutModule') return luts.voi
      if (type === 'modalityLutModule') return luts.rescale
    }
    if (type === 'voiLutModule' && imageId.startsWith('dicomfile:')) return fixedVoiLutModule(imageId)
    if (type === 'imagePlaneModule' && imageId.startsWith('dicomfile:') && !planes.has(imageId)) return defaultPlane(imageId)
    return undefined
  }, FRAME_LUT_PRIORITY)

  metaData.addProvider((type: string, imageId: string) => (type === 'scalingModule' ? scaling.get(imageId) : undefined), FRAME_LUT_PRIORITY)
}

/**
 * The loader's VOI LUT module with VOI LUT Function (0028,1056) as an array:
 * the image loader reads `voiLUTFunction[0]`, so a plain "SIGMOID" string
 * became "S" and broke the stack (Cornerstone 5.13).
 */
function fixedVoiLutModule(imageId: string) {
  const module = wadouri.metaData.metaDataProvider('voiLutModule', imageId) as { voiLUTFunction?: string | string[] } | undefined
  if (!module || typeof module.voiLUTFunction !== 'string') return undefined
  return { ...module, voiLUTFunction: [module.voiLUTFunction.trim()] }
}

/**
 * Images without position and orientation (radiographs, ultrasound, scans)
 * get the default plane the viewport already draws them in, so tools that
 * convert between image and world coordinates (measurements, ROI window)
 * work on them too. Pixel spacing is kept when present, else taken from the
 * detector (Imager Pixel Spacing ÷ magnification); otherwise 1 (pixels).
 */
function defaultPlane(imageId: string) {
  const module = wadouri.metaData.metaDataProvider('imagePlaneModule', imageId) as
    | (Partial<ImagePlane> & { imageOrientationPatient?: number[] })
    | undefined
  if (!module || module.imageOrientationPatient?.length === 6) return undefined
  const own = (module.rowPixelSpacing ?? 0) > 0 && !(module as { usingDefaultValues?: boolean }).usingDefaultValues
  const imager = own ? undefined : imagerSpacing.get(imageId)
  const hasSpacing = own || imager !== undefined
  const magnification = imager?.magnification ?? 1
  const rowSpacing = own ? module.rowPixelSpacing! : imager ? imager.spacing[0] / magnification : 1
  const columnSpacing = own ? module.columnPixelSpacing! : imager ? imager.spacing[1] / magnification : 1
  return {
    ...module,
    imageOrientationPatient: [1, 0, 0, 0, 1, 0],
    rowCosines: [1, 0, 0],
    columnCosines: [0, 1, 0],
    imagePositionPatient: [0, 0, 0],
    rowPixelSpacing: rowSpacing,
    columnPixelSpacing: columnSpacing,
    pixelSpacing: [rowSpacing, columnSpacing],
    // Only the spacing decides whether lengths are in mm; the default plane itself is harmless.
    usingDefaultValues: !hasSpacing,
  }
}
