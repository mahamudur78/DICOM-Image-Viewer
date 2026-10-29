// Segmentations saved as DICOM SEG (binary frames) and as RT Structure Sets
// (contours traced on each slice).
import { dicomFile, newUid, type DicomElement } from '../dicom/writer'
import { isolines } from '../objects/dose'
import { hasBit, type Segment } from '../objects/labels'
import { codeSequence, commonElements, element, sequence, type ImageRef, type ObjectSource } from '../objects/write'
import { indexToWorld, type VolumeGrid } from '../volume/grid'

export const SEGMENTATION_STORAGE = '1.2.840.10008.5.1.4.1.1.66.4'
export const RT_STRUCTURE_SET = '1.2.840.10008.5.1.4.1.1.481.3'

/** sRGB (0–255) as DICOM CIELab (0–65535 scaled). */
export function rgbToDicomLab([r, g, b]: number[]): [number, number, number] {
  const linear = [r, g, b].map((c) => {
    const v = c / 255
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  })
  const x = (0.4124 * linear[0] + 0.3576 * linear[1] + 0.1805 * linear[2]) / 0.95047
  const y = 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]
  const z = (0.0193 * linear[0] + 0.1192 * linear[1] + 0.9505 * linear[2]) / 1.08883
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
  const L = 116 * f(y) - 16
  const A = 500 * (f(x) - f(y))
  const B = 200 * (f(y) - f(z))
  const clamp = (v: number) => Math.round(Math.max(0, Math.min(65535, v)))
  return [clamp((L * 65535) / 100), clamp(((A + 128) * 65535) / 255), clamp(((B + 128) * 65535) / 255)]
}

const ds = (values: number[]) => values.map((v) => Number(v.toFixed(4))).join('\\')

/** The image under each slice (k) of the grid, to reference from frames and contours. */
export type SliceImages = (ImageRef | null)[]

export interface SegmentToWrite extends Segment {
  /** MANUAL, SEMIAUTOMATIC or AUTOMATIC. */
  algorithmType: string
}

/** A binary DICOM SEG: one frame per non-empty slice of each segment. */
export function writeSeg(source: ObjectSource & { referencedSeriesUID: string }, grid: VolumeGrid, segments: SegmentToWrite[], images: SliceImages, label = 'SEGMENTATION') {
  const [nx, ny, nz] = grid.dimensions
  const size = nx * ny
  const frames: { segment: SegmentToWrite; k: number }[] = []
  for (const segment of segments)
    for (let k = 0; k < nz; k++) {
      let any = false
      for (let p = 0; p < size && !any; p++) any = hasBit(grid.scalars[k * size + p], segment.bit)
      if (any) frames.push({ segment, k })
    }
  const bits = new Uint8Array(Math.ceil((frames.length * size) / 8))
  frames.forEach(({ segment, k }, f) => {
    for (let p = 0; p < size; p++) {
      if (!hasBit(grid.scalars[k * size + p], segment.bit)) continue
      const bit = f * size + p
      bits[bit >> 3] |= 1 << (bit & 7)
    }
  })
  const row = grid.direction.slice(0, 3)
  const column = grid.direction.slice(3, 6)
  const referenced = images.filter((image): image is ImageRef => image !== null)
  const elements: DicomElement[] = [
    ...commonElements({ ...source, modality: 'SEG' }),
    element(0x0008, 0x0008, 'CS', 'DERIVED\\PRIMARY'),
    element(0x0062, 0x0001, 'CS', 'BINARY'),
    element(0x0070, 0x0080, 'CS', label.toUpperCase().replace(/[^A-Z0-9_ ]/g, '').slice(0, 16) || 'SEGMENTATION'),
    element(0x0070, 0x0081, 'LO', source.seriesDescription.slice(0, 64)),
    element(0x0070, 0x0084, 'PN', ''),
    element(0x0020, 0x9311, 'CS', 'NONE'),
    sequence(0x0062, 0x0002, segments.map((s) => [
      element(0x0062, 0x0004, 'US', s.number),
      element(0x0062, 0x0005, 'LO', s.label.slice(0, 64)),
      element(0x0062, 0x0008, 'CS', s.algorithmType),
      ...(s.algorithmType !== 'MANUAL' ? [element(0x0062, 0x0009, 'LO', s.algorithm ?? 'DicomLens')] : []),
      element(0x0062, 0x000d, 'US', rgbToDicomLab(s.color)),
      codeSequence(0x0062, 0x0003, ['85756007', 'SCT', 'Tissue']),
      codeSequence(0x0062, 0x000f, ['85756007', 'SCT', 'Tissue']),
    ])),
    sequence(0x0008, 0x1115, [[element(0x0020, 0x000e, 'UI', source.referencedSeriesUID), sequence(0x0008, 0x114a, referenced.map((r) => [element(0x0008, 0x1150, 'UI', r.sopClassUID), element(0x0008, 0x1155, 'UI', r.sopInstanceUID)]))]]),
    sequence(0x5200, 0x9229, [[
      sequence(0x0020, 0x9116, [[element(0x0020, 0x0037, 'DS', ds([...row, ...column]))]]),
      sequence(0x0028, 0x9110, [[element(0x0028, 0x0030, 'DS', ds([grid.spacing[1], grid.spacing[0]])), element(0x0018, 0x0050, 'DS', ds([grid.spacing[2]]))]]),
    ]]),
    sequence(0x5200, 0x9230, frames.map(({ segment, k }) => {
      const image = images[k]
      return [
        ...(image ? [sequence(0x0008, 0x9124, [[sequence(0x0008, 0x2112, [[element(0x0008, 0x1150, 'UI', image.sopClassUID), element(0x0008, 0x1155, 'UI', image.sopInstanceUID)]])]])] : []),
        sequence(0x0020, 0x9113, [[element(0x0020, 0x0032, 'DS', ds(indexToWorld(grid, [0, 0, k])))]]),
        sequence(0x0062, 0x000a, [[element(0x0062, 0x000b, 'US', segment.number)]]),
      ]
    })),
    element(0x0028, 0x0002, 'US', 1),
    element(0x0028, 0x0004, 'CS', 'MONOCHROME2'),
    element(0x0028, 0x0008, 'IS', frames.length),
    element(0x0028, 0x0010, 'US', ny),
    element(0x0028, 0x0011, 'US', nx),
    element(0x0028, 0x0100, 'US', 1),
    element(0x0028, 0x0101, 'US', 1),
    element(0x0028, 0x0102, 'US', 0),
    element(0x0028, 0x0103, 'US', 0),
    element(0x7fe0, 0x0010, 'OB', bits),
  ]
  const sopInstanceUID = newUid()
  return { bytes: dicomFile(SEGMENTATION_STORAGE, sopInstanceUID, elements), sopInstanceUID, frames: frames.length }
}

/** Closed outlines of a segment on slice k (grid index coordinates), traced between pixel centres. */
export function sliceContours(grid: VolumeGrid, bit: number, k: number): number[][][] {
  const [nx, ny] = grid.dimensions
  // A one-pixel empty border closes outlines at the edge of the grid.
  const width = nx + 2
  const height = ny + 2
  const field = new Float32Array(width * height)
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) if (hasBit(grid.scalars[k * nx * ny + j * nx + i], bit)) field[(j + 1) * width + i + 1] = 1
  const segments = isolines(field, width, height, 0.5)
  const key = (x: number, y: number) => `${Math.round(x * 1000)},${Math.round(y * 1000)}`
  const byStart = new Map<string, number[]>()
  segments.forEach(([x0, y0, x1, y1], n) => {
    for (const k2 of [key(x0, y0), key(x1, y1)]) byStart.set(k2, [...(byStart.get(k2) ?? []), n])
  })
  const used = new Uint8Array(segments.length)
  const loops: number[][][] = []
  for (let first = 0; first < segments.length; first++) {
    if (used[first]) continue
    used[first] = 1
    const [x0, y0, x1, y1] = segments[first]
    const loop = [[x0, y0], [x1, y1]]
    for (;;) {
      const [x, y] = loop[loop.length - 1]
      const next = (byStart.get(key(x, y)) ?? []).find((n) => !used[n])
      if (next === undefined) break
      used[next] = 1
      const [a0, b0, a1, b1] = segments[next]
      loop.push(key(a0, b0) === key(x, y) ? [a1, b1] : [a0, b0])
    }
    if (loop.length >= 4) loops.push(loop.slice(0, -1).map(([x, y]) => [x - 1, y - 1]))
  }
  return loops
}

/** An RT Structure Set with one ROI per segment, contoured on every slice. */
export function writeRtStruct(source: ObjectSource & { referencedSeriesUID: string; frameOfReferenceUID: string }, grid: VolumeGrid, segments: Segment[], images: SliceImages, label = 'DICOMLENS') {
  const nz = grid.dimensions[2]
  const rois = segments.map((segment) => {
    const contours: DicomElement[][] = []
    for (let k = 0; k < nz; k++)
      for (const loop of sliceContours(grid, segment.bit, k)) {
        const points = loop.flatMap(([x, y]) => indexToWorld(grid, [x, y, k]))
        const image = images[k]
        contours.push([
          ...(image ? [sequence(0x3006, 0x0016, [[element(0x0008, 0x1150, 'UI', image.sopClassUID), element(0x0008, 0x1155, 'UI', image.sopInstanceUID)]])] : []),
          element(0x3006, 0x0042, 'CS', 'CLOSED_PLANAR'),
          element(0x3006, 0x0046, 'IS', loop.length),
          element(0x3006, 0x0050, 'DS', ds(points)),
        ])
      }
    return { segment, contours }
  })
  const referenced = images.filter((image): image is ImageRef => image !== null)
  const elements: DicomElement[] = [
    ...commonElements({ ...source, modality: 'RTSTRUCT' }),
    element(0x3006, 0x0002, 'SH', label.slice(0, 16)),
    element(0x3006, 0x0008, 'DA', source.studyDate.replace(/-/g, '')),
    sequence(0x3006, 0x0010, [[
      element(0x0020, 0x0052, 'UI', source.frameOfReferenceUID),
      sequence(0x3006, 0x0012, [[
        element(0x0008, 0x1150, 'UI', '1.2.840.10008.3.1.2.3.1'),
        element(0x0008, 0x1155, 'UI', source.studyInstanceUID),
        sequence(0x3006, 0x0014, [[element(0x0020, 0x000e, 'UI', source.referencedSeriesUID), sequence(0x3006, 0x0016, referenced.map((r) => [element(0x0008, 0x1150, 'UI', r.sopClassUID), element(0x0008, 0x1155, 'UI', r.sopInstanceUID)]))]]),
      ]]),
    ]]),
    sequence(0x3006, 0x0020, rois.map(({ segment }) => [element(0x3006, 0x0022, 'IS', segment.number), element(0x3006, 0x0024, 'UI', source.frameOfReferenceUID), element(0x3006, 0x0026, 'LO', segment.label.slice(0, 64)), element(0x3006, 0x0036, 'CS', 'MANUAL')])),
    sequence(0x3006, 0x0039, rois.map(({ segment, contours }) => [element(0x3006, 0x002a, 'IS', segment.color.join('\\')), element(0x3006, 0x0084, 'IS', segment.number), ...(contours.length ? [sequence(0x3006, 0x0040, contours)] : [])])),
    sequence(0x3006, 0x0080, rois.map(({ segment }) => [element(0x3006, 0x0082, 'IS', segment.number), element(0x3006, 0x0084, 'IS', segment.number), element(0x3006, 0x00a4, 'CS', 'ORGAN'), element(0x3006, 0x00a6, 'PN', '')])),
  ]
  const sopInstanceUID = newUid()
  return { bytes: dicomFile(RT_STRUCTURE_SET, sopInstanceUID, elements), sopInstanceUID }
}
