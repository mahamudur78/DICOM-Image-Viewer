// Key Object Selection documents: which images are key, with a title and note.
import { dicomFile, newUid } from '../dicom/writer'
import { codeMeaning, decodedText, firstItem, items, referenceOf, text, type DataSet } from './dicom'
import { commonElements, contentItem, element, evidence, referencedSop, sequence, type ImageRef, type ObjectSource } from './write'

export const KEY_OBJECT_SELECTION = '1.2.840.10008.5.1.4.1.1.88.59'

export interface KeyObjects {
  title: string
  description?: string
  images: { sopInstanceUID: string; frames?: number[] }[]
}

export function readKeyObjects(dataSet: DataSet): KeyObjects {
  const content = items(dataSet, 'x0040a730')
  const description = content.find((item) => text(item, 'x0040a040') === 'TEXT')
  const images = content.flatMap((item) => {
    if (text(item, 'x0040a040') !== 'IMAGE') return []
    const ref = referenceOf(firstItem(item, 'x00081199') ?? item)
    return ref ? [{ sopInstanceUID: ref.sopInstanceUID, ...(ref.frames && { frames: ref.frames }) }] : []
  })
  return { title: codeMeaning(dataSet, 'x0040a043') ?? 'Key images', description: description && decodedText(description, 'x0040a160'), images }
}

/** Titles of PS3.16 CID 7010 that make sense to offer. */
export const KEY_TITLES = {
  ofInterest: ['113000', 'DCM', 'Of Interest'],
  forReferring: ['113002', 'DCM', 'For Referring Provider'],
  forTeaching: ['113004', 'DCM', 'For Teaching'],
  qualityIssue: ['113001', 'DCM', 'Rejected for Quality Reasons'],
} as const

export function writeKeyObjects(source: ObjectSource, images: (ImageRef & { seriesInstanceUID: string })[], description = '', title: readonly [string, string, string] = KEY_TITLES.ofInterest) {
  const sopInstanceUID = newUid()
  const elements = [
    ...commonElements({ ...source, modality: 'KO' }),
    sequence(0x0040, 0xa504, [[element(0x0008, 0x0105, 'CS', 'DCMR'), element(0x0040, 0xdb00, 'CS', '2010')]]),
    evidence(source.studyInstanceUID, images),
    ...contentItem(null, 'CONTAINER', [...title], [], [
      ...(description ? [contentItem('CONTAINS', 'TEXT', ['113012', 'DCM', 'Key Object Description'], [element(0x0040, 0xa160, 'UT', description)])] : []),
      ...images.map((image) => contentItem('CONTAINS', 'IMAGE', null, [sequence(0x0008, 0x1199, [referencedSop(image)])])),
    ]),
  ]
  return { bytes: dicomFile(KEY_OBJECT_SELECTION, sopInstanceUID, elements), sopInstanceUID }
}
