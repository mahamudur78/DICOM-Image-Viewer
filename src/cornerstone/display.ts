// How a 2D viewport shows its image: rotation, zoom scale, interpolation,
// VOI function, colormap and windows derived from the image itself.
import { Enums, metaData, utilities } from '@cornerstonejs/core'
import { wadouri } from '@cornerstonejs/dicom-image-loader'
import { fullRangeWindow, percentileWindow, type HeaderWindow } from '../dicom/windowPresets'
import { imageToCanvas } from './imageCoords'
import { getViewport, setWindow } from './viewer'

// --- rotation -------------------------------------------------------------------

export function rotateBy(viewportId: string, degrees: number) {
  const viewport = getViewport(viewportId)
  if (!viewport) return
  const { rotation = 0 } = viewport.getViewPresentation()
  setRotation(viewportId, rotation + degrees)
}

export function setRotation(viewportId: string, degrees: number) {
  const viewport = getViewport(viewportId)
  if (!viewport) return
  viewport.setViewPresentation({ rotation: ((degrees % 360) + 360) % 360 })
  viewport.render()
}

export const getRotation = (viewportId: string) => getViewport(viewportId)?.getViewPresentation().rotation ?? 0

// --- zoom -------------------------------------------------------------------------

/** Screen (CSS) pixels that one image pixel currently covers. */
export function screenPixelsPerImagePixel(viewportId: string): number | null {
  const viewport = getViewport(viewportId)
  const a = imageToCanvas(viewportId, [0, 0])
  const b = imageToCanvas(viewportId, [1, 0])
  if (!viewport || !a || !b) return null
  const distance = Math.hypot(b[0] - a[0], b[1] - a[1])
  return distance > 0 ? distance : null
}

/** Zooms so that one image pixel covers `scale` screen pixels (1 = "1:1"). */
export function zoomToScale(viewportId: string, scale: number) {
  const viewport = getViewport(viewportId)
  const current = screenPixelsPerImagePixel(viewportId)
  if (!viewport || !current) return
  viewport.setZoom(viewport.getZoom() * (scale / current))
  viewport.render()
}

/** Fits the image to the viewport, keeping rotation, flips and the window. */
export function zoomToFit(viewportId: string) {
  const viewport = getViewport(viewportId)
  if (!viewport) return
  viewport.setViewPresentation({ zoom: 1, pan: [0, 0] })
  viewport.render()
}

/** Image pixel size in mm along a row, or null without calibration. */
export function pixelSpacingMm(viewportId: string): number | null {
  const imageId = getViewport(viewportId)?.getCurrentImageId()
  const plane = imageId ? (metaData.get('imagePlaneModule', imageId) as { columnPixelSpacing?: number } | undefined) : undefined
  return plane?.columnPixelSpacing && plane.columnPixelSpacing > 0 ? plane.columnPixelSpacing : null
}

/**
 * Shows the image at its physical size on a screen of `dpi` dots per inch:
 * a 10 mm structure then measures 10 mm with a ruler held to the screen.
 */
export function zoomToTrueSize(viewportId: string, dpi: number) {
  const spacing = pixelSpacingMm(viewportId)
  if (!spacing) return false
  zoomToScale(viewportId, (spacing * dpi) / 25.4)
  return true
}

// --- interpolation and VOI function ----------------------------------------------

export function setSmoothPixels(viewportId: string, smooth: boolean) {
  const viewport = getViewport(viewportId)
  if (!viewport) return
  viewport.setProperties({ interpolationType: smooth ? Enums.InterpolationType.LINEAR : Enums.InterpolationType.NEAREST })
  viewport.render()
}

export const getSmoothPixels = (viewportId: string) =>
  getViewport(viewportId)?.getProperties()?.interpolationType !== Enums.InterpolationType.NEAREST

export function setSigmoid(viewportId: string, sigmoid: boolean) {
  const viewport = getViewport(viewportId)
  if (!viewport) return
  viewport.setProperties({ VOILUTFunction: sigmoid ? Enums.VOILUTFunctionType.SAMPLED_SIGMOID : Enums.VOILUTFunctionType.LINEAR })
  viewport.render()
}

export const getSigmoid = (viewportId: string) =>
  getViewport(viewportId)?.getProperties()?.VOILUTFunction === Enums.VOILUTFunctionType.SAMPLED_SIGMOID

// --- colormap ----------------------------------------------------------------------

/** Colormaps offered in the menu (names as registered by Cornerstone/vtk.js). */
export const COLORMAPS = [
  'Grayscale',
  'Inverted-Grayscale',
  'X Ray',
  '2hot',
  'Cold and Hot',
  'jet',
  'rainbow',
  'Cool to Warm',
  'Black, Blue and White',
  'Viridis (matplotlib)',
  'Inferno (matplotlib)',
] as const

/** Applies a colormap; grayscale clears it, so the image keeps its own photometric handling. */
export function setColormap(viewportId: string, name: string) {
  const viewport = getViewport(viewportId)
  if (!viewport) return
  viewport.setProperties({ colormap: { name } })
  viewport.render()
}

export const getColormapName = (viewportId: string) => getViewport(viewportId)?.getProperties()?.colormap?.name ?? 'Grayscale'

/** Colour images (RGB, YBR, palette) cannot take a colormap or window presets. */
export const isColorImage = (viewportId: string) => !!getViewport(viewportId)?.getCornerstoneImage?.()?.color

// --- windows from the image ------------------------------------------------------------

/** The current image's pixel values in the units shown (rescaled / SUV). */
function currentValues(viewportId: string) {
  const image = getViewport(viewportId)?.getCornerstoneImage?.()
  if (!image) return null
  // Images the loader pre-scaled (CT HU, PET SUV) already hold display units.
  const scaled = (image as { preScale?: { scaled?: boolean } }).preScale?.scaled
  return {
    pixels: image.getPixelData(),
    slope: scaled ? 1 : (image.slope ?? 1),
    intercept: scaled ? 0 : (image.intercept ?? 0),
    min: image.minPixelValue,
    max: image.maxPixelValue,
  }
}

/** Window from the 1st to 99th percentile of the current image. */
export function autoWindow(viewportId: string) {
  const values = currentValues(viewportId)
  const window = values && percentileWindow(values.pixels, 0.01, 0.99, values.slope, values.intercept)
  if (window) applyWindow(viewportId, window.width, window.center)
}

/** Window over the current image's whole range of values. */
export function fullRange(viewportId: string) {
  const values = currentValues(viewportId)
  if (!values) return
  const scale = (v: number) => v * values.slope + values.intercept
  const window = fullRangeWindow(Math.min(scale(values.min), scale(values.max)), Math.max(scale(values.min), scale(values.max)))
  applyWindow(viewportId, window.width, window.center)
}

/** Windows stored in the current image's header, with their explanations. */
export function headerWindows(viewportId: string): HeaderWindow[] {
  const imageId = getViewport(viewportId)?.getCurrentImageId()
  if (!imageId) return []
  const voi = metaData.get('voiLutModule', imageId) as { windowCenter?: number | number[]; windowWidth?: number | number[] } | undefined
  const centers = [voi?.windowCenter ?? []].flat()
  const widths = [voi?.windowWidth ?? []].flat()
  let explanations: string[] = []
  try {
    const dataSet = wadouri.dataSetCacheManager.get(wadouri.parseImageId(imageId).url)
    explanations = dataSet?.string('x00281055')?.split('\\') ?? []
  } catch {
    // Not a local file, or not loaded yet.
  }
  return centers.map((center, i) => ({ center, width: widths[i] ?? 0, explanation: explanations[i]?.trim() || undefined }))
}

// --- modality defaults ---------------------------------------------------------------

/** True when the loader scaled the current PET image to SUVbw. */
export function isSuvScaled(viewportId: string) {
  const image = getViewport(viewportId)?.getCornerstoneImage?.() as
    | { preScale?: { scaled?: boolean; scalingParameters?: { suvbw?: number } } }
    | undefined
  return !!(image?.preScale?.scaled && image.preScale.scalingParameters?.suvbw)
}

/**
 * How an image is shown by default, beyond what Cornerstone does:
 * - PET in SUV as dark uptake on white (inverted grayscale), window 0–5 SUV
 * - the VOI LUT when the header has no window
 * - inverted when the Presentation LUT Shape is INVERSE
 */
export function applyModalityDefaults(viewportId: string, modality: string) {
  const viewport = getViewport(viewportId)
  if (!viewport) return
  if (modality === 'PT' && isSuvScaled(viewportId)) {
    viewport.setProperties({ voiRange: { lower: 0, upper: 5 }, invert: true })
  } else {
    if (headerWindows(viewportId).every((w) => w.width <= 0)) applyVoiLut(viewportId)
    if (hasInversePresentation(viewportId)) viewport.setProperties({ invert: true })
  }
  if (modality === 'MG') {
    const dataSet = currentDataSet(viewportId)
    const flip = dataSet && mammoFlip(dataSet.string('x00200062') ?? dataSet.string('x00200060'), dataSet.string('x00200020'))
    if (flip !== undefined) viewport.setViewPresentation({ flipHorizontal: flip })
  }
  viewport.render()
}

/**
 * Mammograms are hung back to back: the right breast with its chest wall on
 * the right of the image, the left with it on the left. Patient Orientation's
 * row direction tells where the chest wall is: rows running towards A (the
 * nipple) start at the chest wall, towards P end at it.
 */
export function mammoFlip(laterality: string | undefined, patientOrientation: string | undefined): boolean | undefined {
  const side = laterality?.trim().toUpperCase()
  const rows = patientOrientation?.split('\\')[0]?.trim().toUpperCase() ?? ''
  if ((side !== 'R' && side !== 'L') || (!rows.includes('A') && !rows.includes('P'))) return undefined
  const chestWallLeft = rows.includes('A')
  return side === 'R' ? chestWallLeft : !chestWallLeft
}

// --- VOI LUT and Presentation LUT -------------------------------------------------------

interface CachedDataSet {
  string(tag: string): string | undefined
  uint16(tag: string, index?: number): number | undefined
  int16(tag: string, index?: number): number | undefined
  elements: Record<string, { items?: { dataSet?: CachedDataSet }[]; dataOffset: number; length: number }>
  byteArray: Uint8Array
}

function currentDataSet(viewportId: string): CachedDataSet | undefined {
  const imageId = getViewport(viewportId)?.getCurrentImageId()
  if (!imageId) return undefined
  try {
    return wadouri.dataSetCacheManager.get(wadouri.parseImageId(imageId).url) as unknown as CachedDataSet
  } catch {
    return undefined
  }
}

export interface VoiLut {
  /** First input value the table maps. */
  first: number
  values: number[]
  bits: number
  explanation?: string
}

/** The first VOI LUT of the current image (0028,3010), if any. */
export function voiLutOf(viewportId: string): VoiLut | null {
  const dataSet = currentDataSet(viewportId)
  const item = dataSet?.elements.x00283010?.items?.[0]?.dataSet
  const data = item?.elements.x00283006
  if (!item || !data) return null
  const entries = item.uint16('x00283002', 0) || 65536 // 0 means 2^16 entries
  const signedInput = dataSet?.uint16('x00280103') === 1
  const first = signedInput ? (item.int16('x00283002', 1) ?? 0) : (item.uint16('x00283002', 1) ?? 0)
  const bits = item.uint16('x00283002', 2) || 16
  const view = new DataView(item.byteArray.buffer, item.byteArray.byteOffset + data.dataOffset, data.length)
  const wordSize = data.length >= entries * 2 ? 2 : 1 // OW, or 8-bit LUTs stored in bytes
  const values = Array.from({ length: Math.min(entries, Math.floor(data.length / wordSize)) }, (_, i) =>
    wordSize === 2 ? view.getUint16(i * 2, true) : view.getUint8(i),
  )
  return { first, values, bits, explanation: item.string('x00283003')?.trim() || undefined }
}

const VOI_LUT_PREFIX = 'voi-lut:'
export const isVoiLutColormap = (name: string | undefined) => !!name?.startsWith(VOI_LUT_PREFIX)

/**
 * Shows the image through its VOI LUT. Cornerstone's stack viewport only
 * windows linearly, so the table becomes a grayscale colormap spread over
 * exactly the LUT's input range.
 */
export function applyVoiLut(viewportId: string) {
  const viewport = getViewport(viewportId)
  const lut = voiLutOf(viewportId)
  if (!viewport || !lut || lut.values.length < 2) return false
  const step = Math.max(1, Math.floor(lut.values.length / 1024))
  const indexes = [...Array.from({ length: Math.ceil(lut.values.length / step) }, (_, i) => i * step), lut.values.length - 1]
  const top = Math.max(2 ** lut.bits - 1, ...lut.values)
  const name = `${VOI_LUT_PREFIX}${viewport.getCurrentImageId()}`
  utilities.colormap.registerColormap({
    Name: name,
    name,
    ColorSpace: 'RGB',
    RGBPoints: indexes.flatMap((i) => {
      const v = lut.values[i] / top
      return [i, v, v, v]
    }),
  } as Parameters<typeof utilities.colormap.registerColormap>[0])
  viewport.setProperties({ voiRange: { lower: lut.first, upper: lut.first + lut.values.length - 1 } })
  viewport.setProperties({ colormap: { name } })
  viewport.render()
  return true
}

/** Sets a window, leaving VOI LUT display (a window replaces the table). */
export function applyWindow(viewportId: string, width: number, center: number) {
  if (isVoiLutColormap(getViewport(viewportId)?.getProperties()?.colormap?.name)) setColormap(viewportId, 'Grayscale')
  setWindow(viewportId, width, center)
}

/** Presentation LUT Shape INVERSE (2050,0020): show the image inverted, like MONOCHROME1. */
export const hasInversePresentation = (viewportId: string) => currentDataSet(viewportId)?.string('x20500020')?.trim() === 'INVERSE'
