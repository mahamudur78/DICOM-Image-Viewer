export type ImageFormat = 'jpeg' | 'png' | 'gif' | 'bmp' | 'webp' | 'tiff'
export type FileType = { type: 'dicom' } | { type: 'zip' } | { type: 'image'; format: ImageFormat } | { type: 'unknown' }

const startsWith = (bytes: Uint8Array, signature: number[], offset = 0) =>
  signature.every((value, i) => bytes[offset + i] === value)

const ascii = (text: string) => [...text].map((c) => c.charCodeAt(0))

/**
 * Identifies a file from its first bytes (at least 132). Files without the
 * DICOM preamble are reported as unknown here; the header parser still tries them.
 */
export function sniffBytes(bytes: Uint8Array): FileType {
  if (bytes.length >= 132 && startsWith(bytes, ascii('DICM'), 128)) return { type: 'dicom' }
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]) || startsWith(bytes, [0x50, 0x4b, 0x05, 0x06])) return { type: 'zip' }
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return { type: 'image', format: 'jpeg' }
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47])) return { type: 'image', format: 'png' }
  if (startsWith(bytes, ascii('GIF8'))) return { type: 'image', format: 'gif' }
  if (startsWith(bytes, ascii('BM'))) return { type: 'image', format: 'bmp' }
  if (startsWith(bytes, ascii('RIFF')) && startsWith(bytes, ascii('WEBP'), 8)) return { type: 'image', format: 'webp' }
  if (startsWith(bytes, [0x49, 0x49, 0x2a, 0x00]) || startsWith(bytes, [0x4d, 0x4d, 0x00, 0x2a])) {
    return { type: 'image', format: 'tiff' }
  }
  return { type: 'unknown' }
}

export async function sniffFile(file: Blob): Promise<FileType> {
  return sniffBytes(new Uint8Array(await file.slice(0, 132).arrayBuffer()))
}

/** DICOMDIR is named so on CDs (ISO 9660 may add ";1"). */
export const isDicomdirPath = (path: string) => /(^|\/)dicomdir(;1)?$/i.test(path)
