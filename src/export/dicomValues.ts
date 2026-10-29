// Reading and setting values of dcmjs datasets, and blackening pixels of
// uncompressed pixel data. No Cornerstone here, so it is unit-tested in Node.
import type { DicomDataset, DicomDict, DicomEntry } from 'dcmjs'

export const EXPLICIT_VR_LE = '1.2.840.10008.1.2.1'
const UNCOMPRESSED = new Set(['1.2.840.10008.1.2', '1.2.840.10008.1.2.1', '1.2.840.10008.1.2.2'])

/** "GGGGEEEE" from "(gggg,eeee)", "gggg,eeee" or "ggggeeee". */
export function normalizeTag(text: string): string | null {
  const hex = text.replace(/[^0-9a-f]/gi, '').toUpperCase()
  return hex.length === 8 ? hex : null
}

export function displayValue(entry: DicomEntry | undefined): string {
  if (!entry) return ''
  if (entry.vr === 'SQ') return `[${entry.Value?.length ?? 0} item(s)]`
  if (['OB', 'OW', 'OF', 'OD', 'OL', 'UN'].includes(entry.vr)) return '[binary]'
  return (entry.Value ?? []).map((v) => (typeof v === 'object' && v !== null ? ((v as { Alphabetic?: string }).Alphabetic ?? '') : String(v))).join('\\')
}

const NUMERIC = new Set(['DS', 'IS', 'US', 'SS', 'UL', 'SL', 'FL', 'FD', 'UV', 'SV'])

/** Sets a text or number value ("\\" separates multiple values). */
export function setValue(dataset: DicomDataset, tag: string, vr: string, text: string) {
  const parts = text === '' ? [] : text.split('\\')
  const Value = vr === 'PN' ? parts.map((p) => ({ Alphabetic: p })) : NUMERIC.has(vr) ? parts.map(Number) : parts
  // dcmjs writes `_rawValue` when present; a new value must replace it.
  dataset[tag] = { vr, Value }
}

export const isEditable = (entry: DicomEntry) => !['SQ', 'OB', 'OW', 'OF', 'OD', 'OL', 'UN', 'AT'].includes(entry.vr)

export interface TagEdit {
  tag: string
  vr: string
  /** The new value, or null to remove the tag. */
  value: string | null
}

const transferSyntaxOf = (dicom: DicomDict) => String(dicom.meta['00020010']?.Value?.[0] ?? '').trim()

export const isCompressed = (dicom: DicomDict) => !UNCOMPRESSED.has(transferSyntaxOf(dicom))

/** A rectangle of image pixels to blacken, per frame (0-based). */
export interface PixelBox {
  frame: number
  x0: number
  y0: number
  x1: number
  y1: number
}

/** Blackens boxes in uncompressed pixel data (lowest value; highest for MONOCHROME1). */
export function blackenPixels(dicom: DicomDict, boxes: PixelBox[]) {
  if (boxes.length === 0 || isCompressed(dicom)) return 0
  const rows = Number(dicom.dict['00280010']?.Value?.[0])
  const columns = Number(dicom.dict['00280011']?.Value?.[0])
  const samples = Number(dicom.dict['00280002']?.Value?.[0] ?? 1)
  const bits = Number(dicom.dict['00280100']?.Value?.[0] ?? 16)
  const signed = Number(dicom.dict['00280103']?.Value?.[0] ?? 0) === 1
  const photometric = String(dicom.dict['00280004']?.Value?.[0] ?? '').trim()
  const buffer = dicom.dict['7FE00010']?.Value?.[0] as ArrayBuffer | undefined
  if (!buffer || !rows || !columns) return 0
  const frameSize = rows * columns * samples
  const view = bits === 16 ? (signed ? new Int16Array(buffer) : new Uint16Array(buffer)) : new Uint8Array(buffer)
  const black = photometric === 'MONOCHROME1' ? (bits === 16 ? (signed ? 32767 : 65535) : 255) : signed && bits === 16 ? -32768 : 0
  let count = 0
  for (const box of boxes) {
    const start = box.frame * frameSize
    for (let y = Math.max(0, box.y0); y <= Math.min(rows - 1, box.y1); y++) {
      for (let x = Math.max(0, box.x0); x <= Math.min(columns - 1, box.x1); x++) {
        for (let s = 0; s < samples; s++) view[start + (y * columns + x) * samples + s] = black
        count++
      }
    }
  }
  return count
}
