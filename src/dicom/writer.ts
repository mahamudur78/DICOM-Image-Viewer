// Minimal DICOM Part 10 writer (explicit VR little endian), used to turn
// ordinary images into Secondary Capture objects in the browser. The same
// format is written by scripts/dicom-writer.mjs for test data.

export const EXPLICIT_VR_LE = '1.2.840.10008.1.2.1'
const IMPLEMENTATION_CLASS_UID = '1.2.826.0.1.3680043.10.1395.99'
const LONG_VRS = new Set(['OB', 'OW', 'SQ', 'UN', 'UT', 'UC', 'UR'])

export interface DicomElement {
  tag: number
  bytes: Uint8Array
}

type Value = string | number | number[] | Uint8Array

function encode(vr: string, value: Value): Uint8Array {
  if (value instanceof Uint8Array) return value
  if (vr === 'US' || vr === 'UL') {
    const values = [value].flat() as number[]
    const size = vr === 'US' ? 2 : 4
    const view = new DataView(new ArrayBuffer(values.length * size))
    values.forEach((v, i) => (size === 2 ? view.setUint16(i * 2, v, true) : view.setUint32(i * 4, v, true)))
    return new Uint8Array(view.buffer)
  }
  // UTF-8; objects with non-ASCII text must declare Specific Character Set "ISO_IR 192".
  return new TextEncoder().encode(Array.isArray(value) ? value.join('\\') : String(value))
}

const concat = (parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((sum, p) => sum + p.length, 0))
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

export function element(group: number, elem: number, vr: string, value: Value): DicomElement {
  let bytes = encode(vr, value)
  if (bytes.length % 2) bytes = concat([bytes, Uint8Array.of(vr === 'UI' || vr === 'OB' ? 0 : 0x20)])
  const long = LONG_VRS.has(vr)
  const header = new DataView(new ArrayBuffer(long ? 12 : 8))
  header.setUint16(0, group, true)
  header.setUint16(2, elem, true)
  header.setUint8(4, vr.charCodeAt(0))
  header.setUint8(5, vr.charCodeAt(1))
  if (long) header.setUint32(8, bytes.length, true)
  else header.setUint16(6, bytes.length, true)
  return { tag: group * 0x10000 + elem, bytes: concat([new Uint8Array(header.buffer), bytes]) }
}

/** A sequence (SQ) of defined-length items, each a list of elements. */
export function sequence(group: number, elem: number, items: DicomElement[][]): DicomElement {
  const itemBytes = items.map((elements) => {
    const body = concat([...elements].sort((a, b) => a.tag - b.tag).map((e) => e.bytes))
    const header = new DataView(new ArrayBuffer(8))
    header.setUint16(0, 0xfffe, true)
    header.setUint16(2, 0xe000, true)
    header.setUint32(4, body.length, true)
    return concat([new Uint8Array(header.buffer), body])
  })
  return element(group, elem, 'SQ', concat(itemBytes))
}

/** Builds a Part 10 file: preamble, file meta group and the dataset (sorted by tag). */
export function dicomFile(sopClassUID: string, sopInstanceUID: string, elements: DicomElement[]): Uint8Array {
  const metaBody = concat(
    [
      element(0x0002, 0x0001, 'OB', Uint8Array.of(0, 1)),
      element(0x0002, 0x0002, 'UI', sopClassUID),
      element(0x0002, 0x0003, 'UI', sopInstanceUID),
      element(0x0002, 0x0010, 'UI', EXPLICIT_VR_LE),
      element(0x0002, 0x0012, 'UI', IMPLEMENTATION_CLASS_UID),
    ].map((e) => e.bytes),
  )
  const meta = concat([element(0x0002, 0x0000, 'UL', metaBody.length).bytes, metaBody])
  const dataset = [element(0x0008, 0x0016, 'UI', sopClassUID), element(0x0008, 0x0018, 'UI', sopInstanceUID), ...elements]
    .sort((a, b) => a.tag - b.tag)
    .map((e) => e.bytes)
  return concat([new Uint8Array(128), Uint8Array.from('DICM', (c) => c.charCodeAt(0)), meta, ...dataset])
}

/**
 * A new UID under the UUID-derived root 2.25 (PS3.5 B.2), which needs no
 * registered organization root.
 */
export function newUid() {
  const hex = crypto.randomUUID().replace(/-/g, '')
  return `2.25.${BigInt(`0x${hex}`).toString()}`
}

/** DICOM DA and TM values for a date. */
export function dicomDateTime(date: Date) {
  const pad = (n: number, width = 2) => String(n).padStart(width, '0')
  return {
    date: `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`,
    time: `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`,
  }
}
