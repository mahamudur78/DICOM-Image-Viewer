// De-identification by the DICOM PS3.15 Basic Application Level
// Confidentiality Profile (Annex E), with its common options. Works on dcmjs
// datasets (tags as "GGGGEEEE" with { vr, Value }), recursing into sequences.
import type { DicomDataset, DicomEntry } from 'dcmjs'

/** D: replace with a dummy value, Z: empty, X: remove, U: new UID (the same for the same old UID). */
export type Action = 'D' | 'Z' | 'X' | 'U'

/** The profile's actions for attributes found in everyday images (Table E.1-1). */
export const BASIC_PROFILE: Record<string, Action> = {
  // Patient
  '00100010': 'Z', // Patient's Name (replaced by the new name when given)
  '00100020': 'Z', // Patient ID (replaced by the new ID when given)
  '00100021': 'X',
  '00100030': 'Z',
  '00100032': 'X',
  '00100040': 'Z',
  '00101000': 'X',
  '00101001': 'X',
  '00101002': 'X',
  '00101005': 'X',
  '00101010': 'X',
  '00101020': 'X',
  '00101030': 'X',
  '00101040': 'X',
  '00101060': 'X',
  '00101080': 'X',
  '00101081': 'X',
  '00101090': 'X',
  '00102150': 'X',
  '00102152': 'X',
  '00102154': 'X',
  '00102160': 'X',
  '00102180': 'X',
  '001021A0': 'X',
  '001021B0': 'X',
  '001021C0': 'X',
  '001021D0': 'X',
  '001021F0': 'X',
  '00102203': 'X',
  '00104000': 'X',
  // People and places
  '00080080': 'X',
  '00080081': 'X',
  '00080082': 'X',
  '00080090': 'Z',
  '00080092': 'X',
  '00080094': 'X',
  '00080096': 'X',
  '00081010': 'X',
  '00081040': 'X',
  '00081048': 'X',
  '00081049': 'X',
  '00081050': 'X',
  '00081052': 'X',
  '00081060': 'X',
  '00081062': 'X',
  '00081070': 'X',
  '00081072': 'X',
  '00081080': 'X',
  '00081084': 'X',
  '00081120': 'X',
  '00082111': 'X',
  '00181000': 'X',
  '00181004': 'X',
  '00181005': 'X',
  '00181007': 'X',
  '00181008': 'X',
  '00181009': 'X',
  '00181030': 'X',
  '00181400': 'X',
  '00321032': 'X',
  '00321033': 'X',
  '00321060': 'X',
  '00321070': 'X',
  '00324000': 'X',
  '00380010': 'X',
  '00380300': 'X',
  '00380400': 'X',
  '00380500': 'X',
  '00400006': 'X',
  '00400007': 'X',
  '00400241': 'X',
  '00400242': 'X',
  '00400243': 'X',
  '00400244': 'X',
  '00400245': 'X',
  '00400253': 'X',
  '00400254': 'X',
  '00400275': 'X',
  '00400280': 'X',
  '00401001': 'X',
  '00402016': 'X',
  '00402017': 'X',
  '00402400': 'X',
  '00403001': 'X',
  '0040A027': 'X',
  '0040A730': 'X',
  '00204000': 'X',
  '00080050': 'Z', // Accession Number
  '00200010': 'Z', // Study ID
  '00081030': 'X', // Study Description
  '0008103E': 'X', // Series Description
  '00081032': 'X',
  // Dates and times
  '00080020': 'Z',
  '00080021': 'X',
  '00080022': 'X',
  '00080023': 'Z',
  '00080024': 'X',
  '00080025': 'X',
  '0008002A': 'X',
  '00080030': 'Z',
  '00080031': 'X',
  '00080032': 'X',
  '00080033': 'Z',
  '00080034': 'X',
  '00080035': 'X',
  '00080012': 'X',
  '00080013': 'X',
  '00181012': 'X',
  '00181014': 'X',
  '00181200': 'X',
  '00181201': 'X',
  '00321050': 'X',
  '00321051': 'X',
  '00400002': 'X',
  '00400003': 'X',
  '00400004': 'X',
  '00400005': 'X',
  '00400250': 'X',
  '00400251': 'X',
  // Unique identifiers
  '00080018': 'U',
  '0020000D': 'U',
  '0020000E': 'U',
  '00200052': 'U',
  '00200200': 'U',
  '00081155': 'U',
  '0040A124': 'U',
  '00880140': 'U',
  '00049000': 'U',
  '00280303': 'X',
  '00083010': 'U',
  '00189937': 'U',
  '30060024': 'U',
  '300600C2': 'U',
  '0040DB0D': 'U',
}

/** Attributes the "retain descriptions" option keeps. */
const DESCRIPTIONS = new Set(['00081030', '0008103E', '00181030', '00321060', '00400254', '00204000'])

/** Dates and times the "retain dates" option keeps (Retain Longitudinal Temporal Information). */
const DATE_TAGS = new Set(['00080020', '00080021', '00080022', '00080023', '0008002A', '00080030', '00080031', '00080032', '00080033', '00080012', '00080013'])

export interface AnonymizeOptions {
  /** New Patient's Name and ID (empty: blank, as the profile says). */
  patientName: string
  patientId: string
  retainDates: boolean
  retainDescriptions: boolean
  /** Private (odd group) attributes are removed unless kept. */
  keepPrivate: boolean
  /** UIDs are replaced (consistently) unless kept. */
  keepUids: boolean
}

export const DEFAULT_ANONYMIZE: AnonymizeOptions = {
  patientName: 'ANONYMOUS',
  patientId: '',
  retainDates: false,
  retainDescriptions: false,
  keepPrivate: false,
  keepUids: false,
}

export interface Change {
  tag: string
  action: 'replaced' | 'emptied' | 'removed' | 'newUid' | 'added'
  before: string
  after: string
}

const isPrivate = (tag: string) => parseInt(tag.slice(0, 4), 16) % 2 === 1

const show = (entry: DicomEntry | undefined) => {
  if (!entry) return ''
  if (entry.vr === 'SQ') return `[${entry.Value?.length ?? 0} item(s)]`
  if (['OB', 'OW', 'OF', 'OD', 'UN'].includes(entry.vr)) return '[binary]'
  return (entry.Value ?? []).map((v) => (typeof v === 'object' && v !== null ? ((v as { Alphabetic?: string }).Alphabetic ?? '') : String(v))).join('\\')
}

const textValue = (vr: string, value: string) => (vr === 'PN' ? [{ Alphabetic: value }] : [value])

/**
 * De-identifies a dataset in place and returns what changed. `uidMap` keeps
 * replaced UIDs consistent across every file of one run (a study stays one study).
 */
export function anonymizeDataset(dataset: DicomDataset, options: AnonymizeOptions, uidMap: Map<string, string>, newUid: () => string, prefix = ''): Change[] {
  const changes: Change[] = []
  const record = (tag: string, action: Change['action'], before: string, after: string) => changes.push({ tag: `${prefix}${tag}`, action, before, after })

  for (const tag of Object.keys(dataset)) {
    const entry = dataset[tag]
    if (isPrivate(tag) && !options.keepPrivate) {
      delete dataset[tag]
      record(tag, 'removed', show(entry), '')
      continue
    }
    const action = BASIC_PROFILE[tag]
    if (entry.vr === 'SQ' && action !== 'X') {
      // Attributes inside sequence items follow the same rules.
      ;(entry.Value as DicomDataset[] | undefined)?.forEach((item, i) => changes.push(...anonymizeDataset(item, options, uidMap, newUid, `${prefix}${tag}[${i + 1}].`)))
      continue
    }
    if (!action) continue
    if (options.retainDates && DATE_TAGS.has(tag)) continue
    if (options.retainDescriptions && DESCRIPTIONS.has(tag)) continue
    const before = show(entry)

    if (tag === '00100010' || tag === '00100020') {
      const value = tag === '00100010' ? options.patientName : options.patientId
      dataset[tag] = { vr: entry.vr, Value: value ? textValue(entry.vr, value) : [] }
      if (before !== value) record(tag, value ? 'replaced' : 'emptied', before, value)
    } else if (action === 'U') {
      if (options.keepUids) continue
      const values = (entry.Value ?? []).map((uid) => {
        const old = String(uid)
        if (!uidMap.has(old)) uidMap.set(old, newUid())
        return uidMap.get(old)!
      })
      dataset[tag] = { vr: entry.vr, Value: values }
      record(tag, 'newUid', before, values.join('\\'))
    } else if (action === 'Z' || action === 'D') {
      dataset[tag] = { vr: entry.vr, Value: [] }
      if (before) record(tag, 'emptied', before, '')
    } else {
      delete dataset[tag]
      record(tag, 'removed', before, '')
    }
  }
  return changes
}

/** Marks a dataset as de-identified (PS3.15 E.1.1) and lists the method. */
export function markDeidentified(dataset: DicomDataset, options: AnonymizeOptions): Change[] {
  const codes = ['113100 Basic Application Confidentiality Profile']
  if (options.retainDates) codes.push('113106 Retain Longitudinal Temporal Information Full Dates Option')
  if (options.retainDescriptions) codes.push('113105 Clean Descriptors Option (descriptions retained)')
  if (options.keepUids) codes.push('113110 Retain UIDs Option')
  const method = `DicomLens: ${codes.join('; ')}`
  dataset['00120062'] = { vr: 'CS', Value: ['YES'] }
  dataset['00120063'] = { vr: 'LO', Value: [method.slice(0, 64)] }
  return [
    { tag: '00120062', action: 'added', before: '', after: 'YES' },
    { tag: '00120063', action: 'added', before: '', after: method.slice(0, 64) },
  ]
}

/** Images that may show patient details in their pixels (PS3.15 E.1.1: burned-in annotation). */
export function mayHaveBurnedInText(dataset: DicomDataset) {
  const burned = show(dataset['00280301']).toUpperCase()
  if (burned === 'YES') return true
  if (burned === 'NO') return false
  return ['US', 'SC', 'ES', 'XC', 'OT', 'GM', 'SM', 'DOC'].includes(show(dataset['00080060']).toUpperCase())
}
