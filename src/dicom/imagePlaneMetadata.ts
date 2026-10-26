import { metaData } from '@cornerstonejs/core'
import type dicomParser from 'dicom-parser'

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

const numbers = (value: string | undefined) => value?.split('\\').map(Number)

/**
 * Records geometry from the header we already parsed, keyed by image id.
 * The image loader only knows the geometry of images it has loaded, but slice
 * sync needs every target image's position up front.
 */
export function recordImagePlane(imageId: string, dataSet: dicomParser.DataSet) {
  const position = numbers(dataSet.string('x00200032'))
  const orientation = numbers(dataSet.string('x00200037'))
  if (position?.length !== 3 || orientation?.length !== 6) return

  const spacing = numbers(dataSet.string('x00280030'))
  planes.set(imageId, {
    frameOfReferenceUID: dataSet.string('x00200052'),
    rows: dataSet.uint16('x00280010') ?? 0,
    columns: dataSet.uint16('x00280011') ?? 0,
    imageOrientationPatient: orientation,
    rowCosines: orientation.slice(0, 3),
    columnCosines: orientation.slice(3, 6),
    imagePositionPatient: position,
    sliceThickness: dataSet.floatString('x00180050'),
    pixelSpacing: spacing,
    rowPixelSpacing: spacing?.[0] ?? 1,
    columnPixelSpacing: spacing?.[1] ?? 1,
  })
}

export function clearImagePlanes() {
  planes.clear()
}

/** Lower than the loader's provider (0), so loaded images keep their own metadata. */
const FALLBACK_PRIORITY = -100

export function registerImagePlaneProvider() {
  metaData.addProvider((type: string, imageId: string) => {
    if (type === 'imagePlaneModule') return planes.get(imageId)
    return undefined
  }, FALLBACK_PRIORITY)
}
