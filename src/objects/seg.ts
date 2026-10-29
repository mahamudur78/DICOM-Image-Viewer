// DICOM Segmentation (SEG): binary or fractional frames per segment, turned
// into a label grid on the segmentation's own planes.
import { bytesOf, firstItem, items, number, referenceOf, text, ushorts, type DataSet } from './dicom'
import { framePositions, frameGroup, planeLayout } from './frames'
import { MAX_SEGMENTS, SEGMENT_COLORS, dicomLabToRgb, gridForFrames, paintFrame, type LabelGrid, type Segment } from './labels'

export interface SegInfo {
  segments: Segment[]
  frameOfReferenceUID?: string
  /** Series the segmentation was drawn on. */
  referencedSeriesUID?: string
  /** Images it was drawn on (from frames and the referenced series). */
  referencedInstances: string[]
  label?: string
}

function segmentsOf(dataSet: DataSet): Segment[] {
  return items(dataSet, 'x00620002')
    .slice(0, MAX_SEGMENTS)
    .map((item, bit) => {
      const lab = ushorts(item, 'x0062000d')
      return {
        bit,
        number: item.uint16('x00620004') ?? bit + 1,
        label: text(item, 'x00620005') ?? `Segment ${bit + 1}`,
        color: lab.length === 3 ? dicomLabToRgb(lab) : SEGMENT_COLORS[bit % SEGMENT_COLORS.length],
        automatic: text(item, 'x00620008') === 'AUTOMATIC' || text(item, 'x00620008') === 'SEMIAUTOMATIC',
        algorithm: text(item, 'x00620009'),
      }
    })
}

export function segInfo(dataSet: DataSet): SegInfo {
  const referencedSeries = firstItem(dataSet, 'x00081115')
  const fromSeries = items(referencedSeries, 'x0008114a').flatMap((item) => referenceOf(item)?.sopInstanceUID ?? [])
  const fromFrames = items(dataSet, 'x52009230').flatMap((frame) =>
    items(firstItem(frame, 'x00089124'), 'x00082112').flatMap((item) => referenceOf(item)?.sopInstanceUID ?? []),
  )
  return {
    segments: segmentsOf(dataSet),
    frameOfReferenceUID: text(dataSet, 'x00200052'),
    referencedSeriesUID: referencedSeries && text(referencedSeries, 'x0020000e'),
    referencedInstances: [...new Set([...fromSeries, ...fromFrames])],
    label: text(dataSet, 'x00700080'),
  }
}

/** The segments as a label grid; null when the frames have no geometry. */
export function segLabels(dataSet: DataSet): LabelGrid | null {
  const layout = planeLayout(dataSet)
  const pixels = bytesOf(dataSet, 'x7fe00010')
  if (!layout || !pixels) return null
  const frameCount = Math.max(1, number(dataSet, 'x00280008') ?? 1)
  const positions = framePositions(dataSet, frameCount)
  const segments = segmentsOf(dataSet)
  const grid = gridForFrames(layout, positions)
  const size = layout.rows * layout.columns
  const fractional = text(dataSet, 'x00620001') === 'FRACTIONAL'
  const maxFraction = number(dataSet, 'x0062000e') ?? 255
  const bitsAllocated = dataSet.uint16('x00280100') ?? 1
  for (let frame = 0; frame < frameCount; frame++) {
    const segmentNumber = frameGroup(dataSet, frame, 'x0062000a')?.uint16('x0062000b') ?? 1
    const segment = segments.find((s) => s.number === segmentNumber)
    if (!segment) continue
    const start = frame * size
    const on =
      bitsAllocated === 1
        ? (i: number) => ((pixels[(start + i) >> 3] >> ((start + i) & 7)) & 1) === 1
        : (i: number) => (fractional ? pixels[start + i] / maxFraction >= 0.5 : pixels[start + i] > 0)
    paintFrame(grid, positions[frame], layout.columns, layout.rows, segment.bit, on)
  }
  return { grid, segments }
}
