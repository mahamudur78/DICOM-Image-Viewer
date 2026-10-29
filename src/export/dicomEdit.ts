// Changing DICOM files with dcmjs (loaded only when needed): editing tags,
// anonymizing, decompressing pixel data, and burning redactions into pixels.
import type { DicomDict } from 'dcmjs'
import { imageLoader, type Types } from '@cornerstonejs/core'
import { anonymizeDataset, markDeidentified, type AnonymizeOptions, type Change } from './anonymize'
import { blackenPixels, EXPLICIT_VR_LE, isCompressed, setValue, type PixelBox, type TagEdit } from './dicomValues'

export const loadDcmjs = async () => (await import('dcmjs')).default

export async function readDicom(file: Blob): Promise<DicomDict> {
  const dcmjs = await loadDcmjs()
  return dcmjs.data.DicomMessage.readFile(await file.arrayBuffer(), { ignoreErrors: true })
}

export function writeDicom(dicom: DicomDict): Blob {
  return new Blob([dicom.write({ allowInvalidVRLength: true })], { type: 'application/dicom' })
}

/** The VR of a tag from the dcmjs dictionary. */
export async function vrOf(tag: string): Promise<string | null> {
  const dcmjs = await loadDcmjs()
  return dcmjs.data.DicomMetaDictionary.dictionary[`(${tag.slice(0, 4)},${tag.slice(4)})`]?.vr ?? null
}

/** Applies edits and, optionally, gives the file a new SOP Instance UID. */
export async function editFile(file: Blob, edits: TagEdit[], newInstanceUid: boolean): Promise<Blob> {
  const dcmjs = await loadDcmjs()
  const dicom = await readDicom(file)
  for (const { tag, vr, value } of edits) {
    if (value === null) delete dicom.dict[tag]
    else setValue(dicom.dict, tag, vr, value)
  }
  if (newInstanceUid) {
    const uid = dcmjs.data.DicomMetaDictionary.uid()
    dicom.dict['00080018'] = { vr: 'UI', Value: [uid] }
    dicom.meta['00020003'] = { vr: 'UI', Value: [uid] }
  }
  return writeDicom(dicom)
}

// --- pixel data ---------------------------------------------------------------------

/**
 * Replaces compressed pixel data with uncompressed explicit VR little endian,
 * decoded by the image loader (raw stored values, without rescaling). Colour
 * images come out as RGB, interleaved.
 */
export async function decompress(dicom: DicomDict, imageIds: string[]) {
  const frames: Uint8Array[] = []
  let image: Types.IImage | null = null
  for (const imageId of imageIds) {
    image = await imageLoader.loadImage(imageId, { preScale: { enabled: false } } as never)
    let pixels = image.getPixelData() as ArrayLike<number> & { buffer: ArrayBuffer; byteOffset: number; byteLength: number; BYTES_PER_ELEMENT: number }
    if (image.color) {
      // The loader gives RGBA for colour images; DICOM RGB has three samples.
      const count = image.rows * image.columns
      if (pixels.length === count * 4) {
        const rgb = new Uint8Array(count * 3)
        for (let i = 0; i < count; i++) rgb.set([pixels[i * 4], pixels[i * 4 + 1], pixels[i * 4 + 2]], i * 3)
        pixels = rgb
      }
    }
    frames.push(new Uint8Array(pixels.buffer.slice(pixels.byteOffset, pixels.byteOffset + pixels.byteLength)))
  }
  if (!image) return
  const total = frames.reduce((n, f) => n + f.length, 0)
  const data = new Uint8Array(total + (total % 2))
  let offset = 0
  for (const frame of frames) {
    data.set(frame, offset)
    offset += frame.length
  }
  const bits = data.length / (frames.length * image.rows * image.columns * (image.color ? 3 : 1)) >= 2 ? 16 : 8
  dicom.dict['7FE00010'] = { vr: bits === 16 ? 'OW' : 'OB', Value: [data.buffer] }
  dicom.meta['00020010'] = { vr: 'UI', Value: [EXPLICIT_VR_LE] }
  if (image.color) {
    dicom.dict['00280004'] = { vr: 'CS', Value: ['RGB'] }
    dicom.dict['00280002'] = { vr: 'US', Value: [3] }
    dicom.dict['00280006'] = { vr: 'US', Value: [0] }
    dicom.dict['00280100'] = { vr: 'US', Value: [8] }
    dicom.dict['00280101'] = { vr: 'US', Value: [8] }
    dicom.dict['00280102'] = { vr: 'US', Value: [7] }
  }
  if (bits === 16 && !image.color) {
    // Keep Bits Allocated consistent with what the decoder produced.
    dicom.dict['00280100'] = { vr: 'US', Value: [16] }
  }
}

// --- anonymizing a file -----------------------------------------------------------------

export interface AnonymizedFile {
  data: Blob
  changes: Change[]
}

/**
 * Anonymizes one file. `uidMap` is shared by every file of a run. Redaction
 * boxes are burned into the pixels (compressed images are decompressed first).
 */
export async function anonymizeFile(file: Blob, options: AnonymizeOptions, uidMap: Map<string, string>, imageIds: string[], boxes: PixelBox[]): Promise<AnonymizedFile> {
  const dcmjs = await loadDcmjs()
  const dicom = await readDicom(file)
  const newUid = () => dcmjs.data.DicomMetaDictionary.uid()
  const changes = anonymizeDataset(dicom.dict, options, uidMap, newUid)
  changes.push(...markDeidentified(dicom.dict, options))
  // The file meta header names the instance too.
  const sop = dicom.dict['00080018']?.Value?.[0]
  if (sop) dicom.meta['00020003'] = { vr: 'UI', Value: [sop] }
  if (boxes.length) {
    if (isCompressed(dicom)) await decompress(dicom, imageIds)
    const pixels = blackenPixels(dicom, boxes)
    if (pixels) {
      dicom.dict['00280301'] = { vr: 'CS', Value: ['NO'] }
      changes.push({ tag: '7FE00010', action: 'replaced', before: '', after: `${pixels} redacted pixels` })
    }
  }
  return { data: writeDicom(dicom), changes }
}
