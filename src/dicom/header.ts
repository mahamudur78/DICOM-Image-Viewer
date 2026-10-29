import dicomParser from 'dicom-parser'

const PIXEL_DATA_TAG = 'x7fe00010'
const IMPLICIT_VR_LE = '1.2.840.10008.1.2'
/** Most headers fit in this; larger ones (e.g. enhanced multi-frame) are re-read in full. */
const HEADER_BYTES = 256 * 1024

/**
 * Parses a DICOM header up to the pixel data. Files without the "DICM"
 * preamble (raw datasets, seen on some old CDs) are tried as implicit VR.
 */
export function parseHeaderBytes(bytes: Uint8Array) {
  const part10 = bytes.length > 132 && String.fromCharCode(...bytes.subarray(128, 132)) === 'DICM'
  return dicomParser.parseDicom(bytes, part10 ? { untilTag: PIXEL_DATA_TAG } : { untilTag: PIXEL_DATA_TAG, TransferSyntaxUID: IMPLICIT_VR_LE })
}

export function parseHeader(buffer: ArrayBuffer) {
  return parseHeaderBytes(new Uint8Array(buffer))
}

/**
 * Reads only the start of a file for its header. When the header does not
 * fit (the parse fails, or ends without reaching the pixel data), the whole
 * file is read: PDFs and reports have no pixel data and are needed whole anyway.
 */
export async function readHeader(file: Blob): Promise<dicomParser.DataSet> {
  if (file.size > HEADER_BYTES) {
    try {
      const dataSet = parseHeaderBytes(new Uint8Array(await file.slice(0, HEADER_BYTES).arrayBuffer()))
      if (dataSet.elements[PIXEL_DATA_TAG]) return dataSet
    } catch {
      // Header cut off by the slice; read everything below.
    }
  }
  return parseHeaderBytes(new Uint8Array(await file.arrayBuffer()))
}

// --- typed accessors -----------------------------------------------------------

/** Plain (ASCII) text value, e.g. codes, UIDs and numbers. */
export const text = (dataSet: dicomParser.DataSet, tag: string) => dataSet.string(tag)?.trim() || undefined

/** TextDecoder labels for Specific Character Set (0008,0005) terms. */
const CHARSETS: Record<string, string> = {
  'ISO_IR 100': 'iso-8859-1',
  'ISO_IR 101': 'iso-8859-2',
  'ISO_IR 109': 'iso-8859-3',
  'ISO_IR 110': 'iso-8859-4',
  'ISO_IR 144': 'iso-8859-5',
  'ISO_IR 127': 'iso-8859-6',
  'ISO_IR 126': 'iso-8859-7',
  'ISO_IR 138': 'iso-8859-8',
  'ISO_IR 148': 'iso-8859-9',
  'ISO_IR 203': 'iso-8859-15',
  'ISO_IR 13': 'shift_jis',
  'ISO_IR 166': 'windows-874',
  'ISO_IR 192': 'utf-8',
  GB18030: 'gb18030',
  GBK: 'gbk',
  'ISO 2022 IR 87': 'iso-2022-jp',
  'ISO 2022 IR 159': 'iso-2022-jp',
  'ISO 2022 IR 149': 'euc-kr',
  'ISO 2022 IR 58': 'gb2312',
}

/**
 * TextDecoder label for a Specific Character Set value. With code extensions
 * ("\\ISO 2022 IR 87") the multi-byte set decides; ISO 2022 single-byte terms
 * behave like their ISO_IR counterparts.
 */
export function charsetLabel(specificCharacterSet: string | undefined): string {
  const terms = (specificCharacterSet ?? '').split('\\').map((term) => term.trim().replace(/^ISO 2022 IR (\d+)$/, (m, n) => (CHARSETS[m] ? m : `ISO_IR ${n}`)))
  const multiByte = terms.find((term) => /^ISO 2022 IR (87|159|149|58)$/.test(term))
  const label = CHARSETS[multiByte ?? terms.find(Boolean) ?? '']
  return label ?? 'iso-8859-1'
}

const decoders = new Map<string, TextDecoder>()
function decoder(label: string) {
  let value = decoders.get(label)
  if (!value) {
    try {
      value = new TextDecoder(label)
    } catch {
      value = new TextDecoder('iso-8859-1')
    }
    decoders.set(label, value)
  }
  return value
}

/** ISO 2022 escape sequences that TextDecoder does not consume for euc-kr / gb2312. */
// oxlint-disable-next-line no-control-regex
const ESCAPES = /\x1b[$()*+-./][@-~A-Za-z]?[@-~]?/g

/**
 * Text value decoded with the object's character set, so names in
 * Bengali, Japanese, Chinese, Cyrillic, … show correctly. `charset` is the
 * root dataset's (0008,0005); sequence items inherit it.
 */
export function decodedText(dataSet: dicomParser.DataSet, tag: string, charset?: string): string | undefined {
  const element = dataSet.elements[tag]
  if (!element || element.length <= 0) return undefined
  const label = charsetLabel(charset ?? dataSet.string('x00080005'))
  const bytes = dataSet.byteArray.subarray(element.dataOffset, element.dataOffset + element.length)
  let value = decoder(label).decode(bytes)
  if (label === 'euc-kr' || label === 'gb2312') value = value.replace(ESCAPES, '')
  return value.replace(/[\0 ]+$/, '').trim() || undefined
}

export function number(dataSet: dicomParser.DataSet, tag: string): number | undefined {
  const value = Number(dataSet.string(tag))
  return dataSet.string(tag) !== undefined && Number.isFinite(value) ? value : undefined
}

export const numbers = (dataSet: dicomParser.DataSet, tag: string) =>
  dataSet.string(tag)?.split('\\').map(Number).filter(Number.isFinite)

/** First item of a sequence, if any. */
export const firstItem = (dataSet: dicomParser.DataSet | undefined, tag: string) =>
  dataSet?.elements[tag]?.items?.[0]?.dataSet
