// Reformatted slices (MPR, CPR) as DICOM: 16-bit values with rescale, the
// slice's position and orientation, in the study they came from.
import { dicomFile, element, newUid } from '../dicom/writer'
import type { PlaneSpec } from './grid'

export interface SeriesSource {
  patientName: string
  patientId: string
  studyInstanceUID: string
  studyDate: string
  modality: string
  frameOfReferenceUID?: string
  window?: { center: number; width: number }
}

export interface Quantization {
  slope: number
  intercept: number
}

/** Stores values as signed 16-bit: unchanged when they are whole numbers that fit, else scaled. */
export function quantization(min: number, max: number, integers: boolean): Quantization {
  if (integers && min >= -32768 && max <= 32767) return { slope: 1, intercept: 0 }
  const slope = max > min ? (max - min) / 65535 : 1
  return { slope, intercept: min + 32768 * slope }
}

export function quantize(values: Float32Array, q: Quantization, outside: number) {
  const out = new Int16Array(values.length)
  for (let i = 0; i < values.length; i++) {
    const v = Number.isNaN(values[i]) ? outside : values[i]
    out[i] = Math.max(-32768, Math.min(32767, Math.round((v - q.intercept) / q.slope)))
  }
  return out
}

const ds = (n: number) => Number(n.toFixed(6)).toString()

const SOP_CLASSES: Record<string, string> = {
  CT: '1.2.840.10008.5.1.4.1.1.2',
  MR: '1.2.840.10008.5.1.4.1.1.4',
  PT: '1.2.840.10008.5.1.4.1.1.128',
}
const SECONDARY_CAPTURE = '1.2.840.10008.5.1.4.1.1.7'

/** One reformatted slice as a DICOM file (Part 10 bytes). */
export function sliceToDicom(
  pixels: Int16Array,
  plane: PlaneSpec,
  source: SeriesSource,
  series: { uid: string; number: number; description: string; instance: number; thickness: number },
  q: Quantization,
): Uint8Array {
  const sopClass = SOP_CLASSES[source.modality] ?? SECONDARY_CAPTURE
  const orientation = [...plane.row, ...plane.column].map(ds).join('\\')
  return dicomFile(sopClass, newUid(), [
    element(0x0008, 0x0005, 'CS', 'ISO_IR 192'),
    element(0x0008, 0x0008, 'CS', 'DERIVED\\SECONDARY\\MPR'),
    element(0x0008, 0x0020, 'DA', source.studyDate.replace(/-/g, '')),
    element(0x0008, 0x0060, 'CS', source.modality || 'OT'),
    element(0x0008, 0x103e, 'LO', series.description.slice(0, 64)),
    element(0x0010, 0x0010, 'PN', source.patientName),
    element(0x0010, 0x0020, 'LO', source.patientId),
    element(0x0018, 0x0050, 'DS', ds(series.thickness)),
    element(0x0020, 0x000d, 'UI', source.studyInstanceUID),
    element(0x0020, 0x000e, 'UI', series.uid),
    element(0x0020, 0x0011, 'IS', series.number),
    element(0x0020, 0x0013, 'IS', series.instance),
    element(0x0020, 0x0032, 'DS', plane.origin.map(ds).join('\\')),
    element(0x0020, 0x0037, 'DS', orientation),
    ...(source.frameOfReferenceUID ? [element(0x0020, 0x0052, 'UI', source.frameOfReferenceUID)] : []),
    element(0x0028, 0x0002, 'US', 1),
    element(0x0028, 0x0004, 'CS', 'MONOCHROME2'),
    element(0x0028, 0x0010, 'US', plane.rows),
    element(0x0028, 0x0011, 'US', plane.columns),
    element(0x0028, 0x0030, 'DS', `${ds(plane.pixelSpacing)}\\${ds(plane.pixelSpacing)}`),
    element(0x0028, 0x0100, 'US', 16),
    element(0x0028, 0x0101, 'US', 16),
    element(0x0028, 0x0102, 'US', 15),
    element(0x0028, 0x0103, 'US', 1),
    ...(source.window ? [element(0x0028, 0x1050, 'DS', ds(source.window.center)), element(0x0028, 0x1051, 'DS', ds(source.window.width))] : []),
    element(0x0028, 0x1052, 'DS', ds(q.intercept)),
    element(0x0028, 0x1053, 'DS', ds(q.slope)),
    element(0x7fe0, 0x0010, 'OW', new Uint8Array(pixels.buffer, pixels.byteOffset, pixels.byteLength)),
  ])
}
