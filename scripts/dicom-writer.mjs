// Minimal DICOM Part 10 writer (explicit VR little endian) for synthetic test data.
import { writeFileSync } from 'node:fs'

export const EXPLICIT_VR_LE = '1.2.840.10008.1.2.1'
export const UID_ROOT = '1.2.826.0.1.3680043.10.1395' // arbitrary demo UID root

const LONG_VRS = new Set(['OB', 'OW', 'OF', 'OD', 'SQ', 'UN', 'UT', 'UC', 'UR'])

function encodeValue(vr, value) {
  if (value instanceof Uint8Array) return Buffer.from(value)
  if (vr === 'US') {
    const values = [value].flat()
    const bytes = Buffer.alloc(values.length * 2)
    values.forEach((v, i) => bytes.writeUInt16LE(v, i * 2))
    return bytes
  }
  if (vr === 'UL') {
    const bytes = Buffer.alloc(4)
    bytes.writeUInt32LE(value)
    return bytes
  }
  return Buffer.from(String(value), 'latin1')
}

/** One data element. `value` is a string, number(s), bytes, or (for SQ) an array of item element arrays. */
export function element(group, elem, vr, value) {
  let bytes =
    vr === 'SQ' ? Buffer.concat(value.map((itemElements) => sequenceItem(itemElements))) : encodeValue(vr, value)
  if (bytes.length % 2) bytes = Buffer.concat([bytes, Buffer.from(vr === 'UI' || vr === 'OB' ? [0] : [0x20])])

  const header = Buffer.alloc(LONG_VRS.has(vr) ? 12 : 8)
  header.writeUInt16LE(group, 0)
  header.writeUInt16LE(elem, 2)
  header.write(vr, 4, 'latin1')
  if (LONG_VRS.has(vr)) header.writeUInt32LE(bytes.length, 8)
  else header.writeUInt16LE(bytes.length, 6)
  return Object.assign(Buffer.concat([header, bytes]), { tag: group * 0x10000 + elem })
}

function sequenceItem(elements) {
  const body = Buffer.concat(sortByTag(elements))
  const header = Buffer.alloc(8)
  header.writeUInt16LE(0xfffe, 0)
  header.writeUInt16LE(0xe000, 2)
  header.writeUInt32LE(body.length, 4)
  return Buffer.concat([header, body])
}

const sortByTag = (elements) => [...elements].sort((a, b) => a.tag - b.tag)

/** Builds a Part 10 file: preamble, file meta group and the (tag-sorted) dataset. */
export function dicomFile({ sopClassUID, sopInstanceUID, elements, transferSyntax = EXPLICIT_VR_LE }) {
  const metaBody = Buffer.concat([
    element(0x0002, 0x0001, 'OB', new Uint8Array([0, 1])),
    element(0x0002, 0x0002, 'UI', sopClassUID),
    element(0x0002, 0x0003, 'UI', sopInstanceUID),
    element(0x0002, 0x0010, 'UI', transferSyntax),
    element(0x0002, 0x0012, 'UI', `${UID_ROOT}.99`),
  ])
  const meta = Buffer.concat([element(0x0002, 0x0000, 'UL', metaBody.length), metaBody])
  const dataset = Buffer.concat(
    sortByTag([element(0x0008, 0x0016, 'UI', sopClassUID), element(0x0008, 0x0018, 'UI', sopInstanceUID), ...elements]),
  )
  return Buffer.concat([Buffer.alloc(128), Buffer.from('DICM'), meta, dataset])
}

export function writeDicomFile(path, options) {
  writeFileSync(path, dicomFile(options))
}

/** Little-endian 16-bit pixel data from signed values. */
export function int16Pixels(values) {
  const bytes = Buffer.alloc(values.length * 2)
  values.forEach((value, i) => bytes.writeInt16LE(value, i * 2))
  return new Uint8Array(bytes)
}

/** Little-endian 16-bit pixel data from unsigned values. */
export function uint16Pixels(values) {
  const bytes = Buffer.alloc(values.length * 2)
  values.forEach((value, i) => bytes.writeUInt16LE(value, i * 2))
  return new Uint8Array(bytes)
}

/**
 * Encapsulated (compressed/video) pixel data: undefined length, an empty
 * basic offset table, one item per fragment, then a sequence delimiter.
 */
export function encapsulatedPixelData(fragments) {
  const item = (bytes) => {
    const padded = bytes.length % 2 ? Buffer.concat([bytes, Buffer.from([0])]) : bytes
    const header = Buffer.alloc(8)
    header.writeUInt16LE(0xfffe, 0)
    header.writeUInt16LE(0xe000, 2)
    header.writeUInt32LE(padded.length, 4)
    return Buffer.concat([header, padded])
  }
  const header = Buffer.alloc(12)
  header.writeUInt16LE(0x7fe0, 0)
  header.writeUInt16LE(0x0010, 2)
  header.write('OB', 4, 'latin1')
  header.writeUInt32LE(0xffffffff, 8)
  const delimiter = Buffer.alloc(8)
  delimiter.writeUInt16LE(0xfffe, 0)
  delimiter.writeUInt16LE(0xe0dd, 2)
  return Object.assign(Buffer.concat([header, item(Buffer.alloc(0)), ...fragments.map(item), delimiter]), {
    tag: 0x7fe00010,
  })
}
