// Reading helpers for non-image objects (sequences, binary numbers, codes).
import dicomParser from 'dicom-parser'
import { decodedText, firstItem, number, numbers, text } from '../dicom/header'

export type DataSet = dicomParser.DataSet

/** Parses a whole file (pixel data and all). */
export async function readObject(file: Blob): Promise<DataSet> {
  return dicomParser.parseDicom(new Uint8Array(await file.arrayBuffer()))
}

/** The items of a sequence. */
export const items = (dataSet: DataSet | undefined, tag: string): DataSet[] =>
  (dataSet?.elements[tag]?.items ?? []).flatMap((item) => (item.dataSet ? [item.dataSet] : []))

/** Floats (FL) or doubles (FD) of an element. */
export function floats(dataSet: DataSet | undefined, tag: string, size: 4 | 8 = 4): number[] {
  const element = dataSet?.elements[tag]
  if (!dataSet || !element) return []
  const count = element.length / size
  return Array.from({ length: count }, (_, i) => (size === 4 ? dataSet.float(tag, i) : dataSet.double(tag, i)) ?? NaN)
}

/** Unsigned shorts (US) of an element. */
export function ushorts(dataSet: DataSet | undefined, tag: string): number[] {
  const element = dataSet?.elements[tag]
  if (!dataSet || !element) return []
  return Array.from({ length: element.length / 2 }, (_, i) => dataSet.uint16(tag, i) ?? 0)
}

/** Signed longs (SL) of an element. */
export function slongs(dataSet: DataSet | undefined, tag: string): number[] {
  const element = dataSet?.elements[tag]
  if (!dataSet || !element) return []
  return Array.from({ length: element.length / 4 }, (_, i) => dataSet.int32(tag, i) ?? 0)
}

/** The raw bytes of an element (e.g. pixel or waveform data). */
export function bytesOf(dataSet: DataSet, tag: string): Uint8Array | null {
  const element = dataSet.elements[tag]
  if (!element || element.length <= 0) return null
  return dataSet.byteArray.subarray(element.dataOffset, element.dataOffset + element.length)
}

export interface Code {
  value?: string
  scheme?: string
  meaning?: string
}

export function codeOf(item: DataSet | undefined): Code | undefined {
  if (!item) return undefined
  return { value: text(item, 'x00080100'), scheme: text(item, 'x00080102'), meaning: decodedText(item, 'x00080104') }
}

/** Meaning of the first code item of a sequence. */
export const codeMeaning = (dataSet: DataSet | undefined, tag: string) => {
  const code = codeOf(firstItem(dataSet, tag))
  return code?.meaning ?? code?.value
}

export { decodedText, firstItem, number, numbers, text }

/** Referenced SOP instance of an item (Referenced SOP Instance UID and frames). */
export function referenceOf(item: DataSet): { sopClassUID?: string; sopInstanceUID: string; frames?: number[] } | null {
  const sopInstanceUID = text(item, 'x00081155')
  if (!sopInstanceUID) return null
  const frames = numbers(item, 'x00081160')
  return { sopClassUID: text(item, 'x00081150'), sopInstanceUID, ...(frames?.length && { frames }) }
}
