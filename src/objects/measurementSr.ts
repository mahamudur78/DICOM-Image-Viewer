// Measurement reports (TID 1500): reading their image measurements as our
// measurements, and writing ours as one.
import type { StoredMeasurement, Vec3 } from '../measurements/fileFormat'
import { dicomFile, newUid, type DicomElement } from '../dicom/writer'
import { codeMeaning, decodedText, firstItem, floats, items, referenceOf, text, type DataSet } from './dicom'
import { codeItem, commonElements, contentItem, element, evidence, floatBytes, referencedSop, sequence, type CodeTuple, type ImageRef, type ObjectSource } from './write'

export const COMPREHENSIVE_SR = '1.2.840.10008.5.1.4.1.1.88.33'

export type GraphicType = 'POINT' | 'MULTIPOINT' | 'POLYLINE' | 'CIRCLE' | 'ELLIPSE'

export interface SrMeasurement {
  /** Tracking identifier or finding of the measurement group. */
  label?: string
  /** Concept of the value, e.g. "Length". */
  concept?: string
  value?: number
  unit?: string
  graphicType: GraphicType
  /** Image (column, row) pairs; (0, 0) is the outer corner of the first pixel. */
  points: [number, number][]
  image: { sopInstanceUID: string; frame: number }
}

const pairs = (values: number[]) => Array.from({ length: Math.floor(values.length / 2) }, (_, i): [number, number] => [values[i * 2], values[i * 2 + 1]])

function scoordOf(item: DataSet): Omit<SrMeasurement, 'label' | 'concept' | 'value' | 'unit'> | null {
  const graphicType = text(item, 'x00700023') as GraphicType | undefined
  const imageItem = items(item, 'x0040a730').find((child) => text(child, 'x0040a040') === 'IMAGE')
  const reference = imageItem && firstItem(imageItem, 'x00081199')
  const ref = reference && referenceOf(reference)
  if (!graphicType || !ref) return null
  return { graphicType, points: pairs(floats(item, 'x00700022')), image: { sopInstanceUID: ref.sopInstanceUID, frame: ref.frames?.[0] ?? 0 } }
}

/** The measurements of a report that are drawn on images (spatial coordinates). */
export function readSrMeasurements(dataSet: DataSet): SrMeasurement[] {
  const out: SrMeasurement[] = []
  const visit = (item: DataSet, label: string | undefined, depth: number) => {
    if (depth > 50) return
    const children = items(item, 'x0040a730')
    // A measurement group names its measurements by its tracking identifier.
    const tracking = children.find((child) => text(firstItem(child, 'x0040a043') ?? child, 'x00080100') === '112039')
    const groupLabel = (tracking && decodedText(tracking, 'x0040a160')) ?? label
    for (const child of children) {
      const type = text(child, 'x0040a040')
      if (type === 'NUM') {
        const scoord = items(child, 'x0040a730').find((c) => text(c, 'x0040a040') === 'SCOORD')
        const shape = scoord && scoordOf(scoord)
        if (shape) {
          const measured = firstItem(child, 'x0040a300')
          const unitItem = measured && firstItem(measured, 'x004008ea')
          out.push({
            ...shape,
            label: groupLabel,
            concept: codeMeaning(child, 'x0040a043'),
            value: measured ? Number(text(measured, 'x0040a30a')) : undefined,
            unit: unitItem && (text(unitItem, 'x00080100') ?? undefined),
          })
          continue
        }
      }
      if (type === 'SCOORD') {
        const shape = scoordOf(child)
        if (shape) out.push({ ...shape, label: groupLabel, concept: codeMeaning(child, 'x0040a043') })
        continue
      }
      visit(child, groupLabel, depth + 1)
    }
  }
  visit(dataSet, undefined, 0)
  return out
}

export interface ImagePlane {
  /** Image Position (Patient): centre of the first pixel. */
  origin: number[]
  row: number[]
  column: number[]
  /** mm between columns, and between rows. */
  spacing: [number, number]
}

/** World point of an image coordinate (pixel corners at whole numbers, as in SR and GSPS). */
export function imageToWorld(plane: ImagePlane, [x, y]: [number, number]): Vec3 {
  const [cx, cy] = [(x - 0.5) * plane.spacing[0], (y - 0.5) * plane.spacing[1]]
  return [0, 1, 2].map((n) => plane.origin[n] + cx * plane.row[n] + cy * plane.column[n]) as Vec3
}

/** Image coordinate of a world point (the inverse of imageToWorld). */
export function worldToImage(plane: ImagePlane, world: number[]): [number, number] {
  const d = [0, 1, 2].map((n) => world[n] - plane.origin[n])
  const along = (v: number[]) => d[0] * v[0] + d[1] * v[1] + d[2] * v[2]
  return [along(plane.row) / plane.spacing[0] + 0.5, along(plane.column) / plane.spacing[1] + 0.5]
}

/** Our measurement tools for report measurements, placed on their images. */
export function toStoredMeasurements(measurements: SrMeasurement[], planeOf: (sopInstanceUID: string, frame: number) => ImagePlane | null): StoredMeasurement[] {
  return measurements.flatMap((m): StoredMeasurement[] => {
    const plane = planeOf(m.image.sopInstanceUID, m.image.frame)
    if (!plane || !m.points.length) return []
    const world = m.points.map((p) => imageToWorld(plane, p))
    const base = { sopInstanceUID: m.image.sopInstanceUID, frame: m.image.frame }
    const label = m.label
    switch (m.graphicType) {
      case 'POINT':
        return [{ ...base, toolName: 'Probe', data: { points: [world[0]], label } }]
      case 'CIRCLE':
        return world.length >= 2 ? [{ ...base, toolName: 'CircleROI', data: { points: [world[0], world[1]], label } }] : []
      case 'ELLIPSE':
        return world.length >= 4 ? [{ ...base, toolName: 'EllipticalROI', data: { points: world.slice(0, 4), label } }] : []
      case 'POLYLINE': {
        if (world.length === 2) return [{ ...base, toolName: 'Length', data: { points: world, label } }]
        if (world.length === 3 && /angle/i.test(m.concept ?? '')) return [{ ...base, toolName: 'Angle', data: { points: world, label } }]
        const closed = m.points.length > 3 && m.points[0][0] === m.points.at(-1)![0] && m.points[0][1] === m.points.at(-1)![1]
        const polyline = closed ? world.slice(0, -1) : world
        return [{ ...base, toolName: 'PlanarFreehandROI', data: { points: [], polyline, closed: closed || /area/i.test(m.concept ?? ''), label } }]
      }
      default:
        return []
    }
  })
}

// --- writing ----------------------------------------------------------------------------

export interface MeasurementToWrite {
  label: string
  concept: CodeTuple
  value: number
  unit: CodeTuple
  graphicType: GraphicType
  points: [number, number][]
  image: ImageRef & { seriesInstanceUID: string }
}

export const UNITS: Record<string, CodeTuple> = {
  mm: ['mm', 'UCUM', 'millimeter'],
  cm: ['cm', 'UCUM', 'centimeter'],
  mm2: ['mm2', 'UCUM', 'square millimeter'],
  deg: ['deg', 'UCUM', 'degree'],
  hu: ["[hnsf'U]", 'UCUM', 'Hounsfield unit'],
  none: ['1', 'UCUM', 'no units'],
}

export const CONCEPTS: Record<string, CodeTuple> = {
  length: ['410668003', 'SCT', 'Length'],
  area: ['42798000', 'SCT', 'Area'],
  angle: ['ANGLE', '99DCMLENS', 'Angle'],
  mean: ['373098007', 'SCT', 'Mean'],
  value: ['VALUE', '99DCMLENS', 'Pixel value'],
}

/** A TID 1500 Comprehensive SR with one measurement group per measurement. */
export function writeMeasurementSr(source: ObjectSource, measurements: MeasurementToWrite[], title = 'Measurements'): { bytes: Uint8Array; sopInstanceUID: string } {
  const groups = measurements.map((m) =>
    contentItem('CONTAINS', 'CONTAINER', ['125007', 'DCM', 'Measurement Group'], [], [
      contentItem('HAS OBS CONTEXT', 'TEXT', ['112039', 'DCM', 'Tracking Identifier'], [element(0x0040, 0xa160, 'UT', m.label)]),
      contentItem('CONTAINS', 'NUM', m.concept, [sequence(0x0040, 0xa300, [[element(0x0040, 0xa30a, 'DS', Number(m.value.toPrecision(10))), sequence(0x0040, 0x08ea, [codeItem(m.unit)])]])], [
        contentItem('INFERRED FROM', 'SCOORD', null, [element(0x0070, 0x0023, 'CS', m.graphicType), element(0x0070, 0x0022, 'FL', floatBytes(m.points.flat()))], [
          contentItem('SELECTED FROM', 'IMAGE', null, [sequence(0x0008, 0x1199, [referencedSop(m.image)])]),
        ]),
      ]),
    ]),
  )
  const sopInstanceUID = newUid()
  const elements: DicomElement[] = [
    ...commonElements({ ...source, modality: 'SR', seriesDescription: title }),
    element(0x0040, 0xa491, 'CS', 'COMPLETE'),
    element(0x0040, 0xa493, 'CS', 'UNVERIFIED'),
    sequence(0x0040, 0xa504, [[element(0x0008, 0x0105, 'CS', 'DCMR'), element(0x0040, 0xdb00, 'CS', '1500')]]),
    evidence(source.studyInstanceUID, measurements.map((m) => m.image)),
    ...contentItem(null, 'CONTAINER', ['126000', 'DCM', 'Imaging Measurement Report'], [], [contentItem('CONTAINS', 'CONTAINER', ['126010', 'DCM', 'Imaging Measurements'], [], groups)]),
  ]
  return { bytes: dicomFile(COMPREHENSIVE_SR, sopInstanceUID, elements), sopInstanceUID }
}
