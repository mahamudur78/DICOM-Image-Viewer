// DICOM tags as rows for the tag panel and its exports: nested sequence items
// are expanded under their sequence, and two files can be compared.
import type dicomParser from 'dicom-parser'
import { decodedText } from './header'
import { TAG_DICTIONARY } from './tagDictionary'

export interface TagRow {
  /** "(0010,0010)"; rows inside sequence items repeat their item path in `path`. */
  tag: string
  /** Unique key: the item path and the tag, e.g. "(0008,1140)[1](0008,1155)". */
  path: string
  name: string
  vr: string
  value: string
  /** 0 at the top level, +1 per sequence item. */
  depth: number
}

const MAX_VALUE_LENGTH = 200
const MAX_DEPTH = 6
const MAX_ITEMS = 100

export const formatTag = (tag: string) => `(${tag.slice(1, 5)},${tag.slice(5, 9)})`.toUpperCase()

function readValue(dataSet: dicomParser.DataSet, element: dicomParser.Element, vr: string): string {
  if (element.items) return `[${element.items.length} item(s)]`
  if (element.length === 0) return ''
  const count = (bytes: number) => Math.max(1, Math.floor(element.length / bytes))
  const join = (read: (index: number) => number | undefined, bytes: number) =>
    Array.from({ length: Math.min(count(bytes), 16) }, (_, i) => read(i)).join('\\')
  switch (vr) {
    case 'US':
      return join((i) => dataSet.uint16(element.tag, i), 2)
    case 'SS':
      return join((i) => dataSet.int16(element.tag, i), 2)
    case 'UL':
      return join((i) => dataSet.uint32(element.tag, i), 4)
    case 'SL':
      return join((i) => dataSet.int32(element.tag, i), 4)
    case 'FL':
      return join((i) => dataSet.float(element.tag, i), 4)
    case 'FD':
      return join((i) => dataSet.double(element.tag, i), 8)
    case 'OB':
    case 'OW':
    case 'OF':
    case 'OD':
    case 'OL':
    case 'UN':
      return `[binary: ${element.length} bytes]`
    case 'AT':
      return `(${(dataSet.uint16(element.tag, 0) ?? 0).toString(16).padStart(4, '0')},${(dataSet.uint16(element.tag, 1) ?? 0).toString(16).padStart(4, '0')})`.toUpperCase()
    case 'PN':
    case 'LO':
    case 'SH':
    case 'ST':
    case 'LT':
    case 'UT':
    case 'UC':
      // Free text may use the object's character set (e.g. UTF-8 or Japanese).
      return decodedText(dataSet, element.tag) ?? ''
    default:
      return dataSet.string(element.tag) ?? ''
  }
}

export function nameOf(tag: string) {
  const name = TAG_DICTIONARY[tag]?.[1]
  if (name) return name
  return parseInt(tag.slice(1, 5), 16) % 2 === 1 ? 'Private tag' : ''
}

/** Rows of a dataset; sequence items follow their sequence, one level deeper. */
export function buildRows(dataSet: dicomParser.DataSet, depth = 0, prefix = ''): TagRow[] {
  return Object.values(dataSet.elements)
    .sort((a, b) => a.tag.localeCompare(b.tag))
    .flatMap((element) => {
      const vr = element.vr ?? TAG_DICTIONARY[element.tag]?.[0] ?? (element.items ? 'SQ' : 'UN')
      const value = readValue(dataSet, element, vr)
      const path = `${prefix}${formatTag(element.tag)}`
      const row: TagRow = {
        tag: formatTag(element.tag),
        path,
        name: nameOf(element.tag),
        vr,
        value: value.length > MAX_VALUE_LENGTH ? `${value.slice(0, MAX_VALUE_LENGTH)}…` : value,
        depth,
      }
      if (!element.items || depth >= MAX_DEPTH) return [row]
      const items = element.items.slice(0, MAX_ITEMS).flatMap((item, i) => [
        { tag: '', path: `${path}[${i + 1}]`, name: `Item ${i + 1}`, vr: '', value: '', depth: depth + 1 },
        ...(item.dataSet ? buildRows(item.dataSet, depth + 1, `${path}[${i + 1}]`) : []),
      ])
      return [row, ...items]
    })
}

// --- exports ----------------------------------------------------------------------

/** Plain text, indented by sequence depth, like a DICOM dump. */
export function rowsToText(rows: TagRow[]) {
  return rows.map((row) => `${'  '.repeat(row.depth)}${row.tag || '>'} ${row.vr.padEnd(2)} ${row.name}${row.value ? ` = ${row.value}` : ''}`).join('\n') + '\n'
}

export function rowsToCsv(rows: TagRow[], file = '') {
  const cell = (value: string) => (/[",\n\r]/.test(value) || /^[=+@-]/.test(value) ? `"${(/^[=+@-]/.test(value) ? `'${value}` : value).replace(/"/g, '""')}"` : value)
  const header = [...(file ? ['File'] : []), 'Path', 'Tag', 'Name', 'VR', 'Value']
  return [header, ...rows.map((row) => [...(file ? [file] : []), row.path, row.tag, row.name, row.vr, row.value])].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n'
}

export interface TagJson {
  tag: string
  name: string
  vr: string
  value?: string
  items?: TagJson[][]
}

/** Nested JSON: sequences hold their items' tags. */
export function rowsToJson(rows: TagRow[]): TagJson[] {
  const root: TagJson[] = []
  // Stack of the open lists at each depth.
  const lists: TagJson[][] = [root]
  for (const row of rows) {
    lists.length = row.depth + 1
    if (!row.tag) {
      // An item of the last sequence at depth - 1.
      const item: TagJson[] = []
      const sequence = findSequence(lists[row.depth - 1])
      sequence.items = [...(sequence.items ?? []), item]
      lists[row.depth] = item
      continue
    }
    const entry: TagJson = { tag: row.tag, name: row.name, vr: row.vr, ...(row.vr === 'SQ' ? {} : { value: row.value }) }
    lists[row.depth].push(entry)
  }
  return root
}

const findSequence = (list: TagJson[]) => [...list].reverse().find((entry) => entry.vr === 'SQ')!

// --- comparison -----------------------------------------------------------------------

export interface TagDifference {
  path: string
  tag: string
  name: string
  a: string | null
  b: string | null
}

/** Tags whose value differs between two files, or that only one of them has. */
export function diffRows(a: TagRow[], b: TagRow[]): TagDifference[] {
  const byPath = (rows: TagRow[]) => new Map(rows.filter((r) => r.tag).map((r) => [r.path, r]))
  const left = byPath(a)
  const right = byPath(b)
  const paths = [...new Set([...left.keys(), ...right.keys()])].sort()
  return paths.flatMap((path) => {
    const x = left.get(path)
    const y = right.get(path)
    if (x && y && x.value === y.value) return []
    const row = (x ?? y)!
    return [{ path, tag: row.tag, name: row.name, a: x?.value ?? null, b: y?.value ?? null }]
  })
}
