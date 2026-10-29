// Shared parts of the objects we write (SR, KO, GSPS): patient, study and
// series attributes, and SR content items.
import { dicomDateTime, element, sequence, type DicomElement } from '../dicom/writer'

export interface ObjectSource {
  patientName: string
  patientId: string
  studyInstanceUID: string
  /** YYYY-MM-DD or YYYYMMDD */
  studyDate: string
  seriesInstanceUID: string
  seriesNumber: number
  seriesDescription: string
  modality: string
  frameOfReferenceUID?: string
}

export function commonElements(source: ObjectSource, now = new Date()): DicomElement[] {
  const { date, time } = dicomDateTime(now)
  return [
    element(0x0008, 0x0005, 'CS', 'ISO_IR 192'),
    element(0x0008, 0x0020, 'DA', source.studyDate.replace(/-/g, '')),
    element(0x0008, 0x0023, 'DA', date),
    element(0x0008, 0x0033, 'TM', time),
    element(0x0008, 0x0060, 'CS', source.modality),
    element(0x0008, 0x0070, 'LO', 'DicomLens'),
    element(0x0008, 0x103e, 'LO', source.seriesDescription.slice(0, 64)),
    element(0x0010, 0x0010, 'PN', source.patientName),
    element(0x0010, 0x0020, 'LO', source.patientId),
    element(0x0020, 0x000d, 'UI', source.studyInstanceUID),
    element(0x0020, 0x000e, 'UI', source.seriesInstanceUID),
    element(0x0020, 0x0011, 'IS', source.seriesNumber),
    element(0x0020, 0x0013, 'IS', 1),
    ...(source.frameOfReferenceUID ? [element(0x0020, 0x0052, 'UI', source.frameOfReferenceUID)] : []),
  ]
}

export type CodeTuple = [value: string, scheme: string, meaning: string]

export const codeItem = ([value, scheme, meaning]: CodeTuple): DicomElement[] => [
  element(0x0008, 0x0100, 'SH', value),
  element(0x0008, 0x0102, 'SH', scheme),
  element(0x0008, 0x0104, 'LO', meaning),
]

export const codeSequence = (group: number, elem: number, code: CodeTuple) => sequence(group, elem, [codeItem(code)])

export interface ImageRef {
  sopClassUID: string
  sopInstanceUID: string
  /** 1-based frame, 0 for single-frame images. */
  frame: number
}

export const referencedSop = (ref: ImageRef): DicomElement[] => [
  element(0x0008, 0x1150, 'UI', ref.sopClassUID),
  element(0x0008, 0x1155, 'UI', ref.sopInstanceUID),
  ...(ref.frame > 0 ? [element(0x0008, 0x1160, 'IS', ref.frame)] : []),
]

/** An SR content item (PS3.3 C.17.3). */
export function contentItem(relationship: string | null, valueType: string, concept: CodeTuple | null, value: DicomElement[] = [], children: DicomElement[][] = []): DicomElement[] {
  return [
    ...(relationship ? [element(0x0040, 0xa010, 'CS', relationship)] : []),
    element(0x0040, 0xa040, 'CS', valueType),
    ...(concept ? [codeSequence(0x0040, 0xa043, concept)] : []),
    ...(valueType === 'CONTAINER' ? [element(0x0040, 0xa050, 'CS', 'SEPARATE')] : []),
    ...value,
    ...(children.length ? [sequence(0x0040, 0xa730, children)] : []),
  ]
}

export const floatBytes = (values: number[]) => new Uint8Array(Float32Array.from(values).buffer)
export const int32Bytes = (values: number[]) => new Uint8Array(Int32Array.from(values).buffer)

/** Current Requested Procedure Evidence: the referenced images by series. */
export function evidence(studyInstanceUID: string, images: (ImageRef & { seriesInstanceUID: string })[]) {
  const bySeries = new Map<string, ImageRef[]>()
  for (const image of images) bySeries.set(image.seriesInstanceUID, [...(bySeries.get(image.seriesInstanceUID) ?? []), image])
  return sequence(0x0040, 0xa375, [
    [
      element(0x0020, 0x000d, 'UI', studyInstanceUID),
      sequence(0x0008, 0x1115, [...bySeries].map(([series, refs]) => [element(0x0020, 0x000e, 'UI', series), sequence(0x0008, 0x1199, refs.map(referencedSop))])),
    ],
  ])
}

export { element, sequence }
