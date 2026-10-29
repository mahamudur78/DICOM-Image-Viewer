import type { SourceFile } from './collectFiles'
import type { ImageFormat } from './fileType'
import { SOP_CLASS } from './parse'
import { dicomDateTime, dicomFile, element, newUid } from './writer'

interface RgbImage {
  width: number
  height: number
  /** RGB, 8 bits per sample, rows top to bottom. */
  rgb: Uint8Array
}

/** Drops alpha by compositing over black, as a viewer background would. */
function rgbaToRgb(rgba: Uint8ClampedArray | Uint8Array, width: number, height: number): RgbImage {
  const rgb = new Uint8Array(width * height * 3)
  for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) {
    const alpha = rgba[i + 3] / 255
    rgb[j] = rgba[i] * alpha
    rgb[j + 1] = rgba[i + 1] * alpha
    rgb[j + 2] = rgba[i + 2] * alpha
  }
  return { width, height, rgb }
}

/** JPEG, PNG, BMP, GIF (first frame) and WebP via the browser's decoder, honouring EXIF rotation. */
async function decodeWithBrowser(file: Blob): Promise<RgbImage[]> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const { width, height } = bitmap
  const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(width, height) : document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
  context.drawImage(bitmap, 0, 0)
  bitmap.close()
  return [rgbaToRgb(context.getImageData(0, 0, width, height).data, width, height)]
}

/** TIFF (browsers other than Safari cannot decode it); every page becomes an image. */
async function decodeTiff(file: Blob): Promise<RgbImage[]> {
  const { default: UTIF } = await import('utif2')
  const buffer = await file.arrayBuffer()
  return UTIF.decode(buffer).map((ifd) => {
    UTIF.decodeImage(buffer, ifd)
    return rgbaToRgb(UTIF.toRGBA8(ifd), ifd.width, ifd.height)
  })
}

/** Shared by all images imported together, so they form one study. */
export interface ImportStudy {
  studyInstanceUID: string
  date: string
  time: string
  /** Patient and study details given when converting (empty when just opening images). */
  patientName?: string
  patientId?: string
  description?: string
}

export function newImportStudy(details: Pick<ImportStudy, 'patientName' | 'patientId' | 'description'> = {}): ImportStudy {
  return { studyInstanceUID: newUid(), ...dicomDateTime(new Date()), ...details }
}

/**
 * Converts an ordinary image into Secondary Capture DICOM files (one per
 * page), kept in memory, so it is shown, inspected and exported like any
 * other image. Patient fields are left empty.
 */
export async function imageToDicom(source: SourceFile, format: ImageFormat, study: ImportStudy, seriesNumber: number) {
  const images = format === 'tiff' ? await decodeTiff(source.file) : await decodeWithBrowser(source.file)
  const seriesUID = newUid()
  const name = source.path.split('/').pop()!
  return images.map((image, index) => {
    const sopInstanceUID = newUid()
    const bytes = dicomFile(SOP_CLASS.secondaryCapture, sopInstanceUID, [
      element(0x0008, 0x0005, 'CS', 'ISO_IR 192'),
      element(0x0008, 0x0020, 'DA', study.date),
      element(0x0008, 0x0023, 'DA', study.date),
      element(0x0008, 0x0030, 'TM', study.time),
      element(0x0008, 0x0033, 'TM', study.time),
      element(0x0008, 0x0060, 'CS', 'OT'),
      element(0x0008, 0x0064, 'CS', 'WSD'), // conversion type: workstation
      element(0x0008, 0x1030, 'LO', (study.description || 'Imported images').slice(0, 64)),
      element(0x0008, 0x103e, 'LO', name.slice(0, 64)),
      element(0x0010, 0x0010, 'PN', study.patientName ?? ''),
      element(0x0010, 0x0020, 'LO', study.patientId ?? ''),
      element(0x0020, 0x000d, 'UI', study.studyInstanceUID),
      element(0x0020, 0x000e, 'UI', seriesUID),
      element(0x0020, 0x0011, 'IS', seriesNumber),
      element(0x0020, 0x0013, 'IS', index + 1),
      element(0x0028, 0x0002, 'US', 3),
      element(0x0028, 0x0004, 'CS', 'RGB'),
      element(0x0028, 0x0006, 'US', 0),
      element(0x0028, 0x0010, 'US', image.height),
      element(0x0028, 0x0011, 'US', image.width),
      element(0x0028, 0x0100, 'US', 8),
      element(0x0028, 0x0101, 'US', 8),
      element(0x0028, 0x0102, 'US', 7),
      element(0x0028, 0x0103, 'US', 0),
      element(0x7fe0, 0x0010, 'OB', image.rgb),
    ])
    const file = new File([bytes as BlobPart], `${name}${images.length > 1 ? `-${index + 1}` : ''}.dcm`)
    return { file, path: images.length > 1 ? `${source.path}#${index + 1}` : source.path }
  })
}
