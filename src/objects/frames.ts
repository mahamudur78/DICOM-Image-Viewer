// Geometry of multi-frame objects from their functional groups (SEG,
// parametric maps) or classic attributes.
import { firstItem, items, numbers, type DataSet } from './dicom'
import type { PlaneLayout } from './labels'

const SHARED = 'x52009229'
const PER_FRAME = 'x52009230'

/** A functional group macro of one frame: per-frame first, then shared. */
export function frameGroup(dataSet: DataSet, frame: number, macro: string): DataSet | undefined {
  return firstItem(items(dataSet, PER_FRAME)[frame], macro) ?? firstItem(firstItem(dataSet, SHARED), macro)
}

/** Orientation, pixel spacing and size shared by the frames. */
export function planeLayout(dataSet: DataSet): PlaneLayout | null {
  const orientation = numbers(frameGroup(dataSet, 0, 'x00209116') ?? dataSet, 'x00200037')
  const measures = frameGroup(dataSet, 0, 'x00289110') ?? dataSet
  const spacing = numbers(measures, 'x00280030')
  const rows = dataSet.uint16('x00280010')
  const columns = dataSet.uint16('x00280011')
  if (orientation?.length !== 6 || !rows || !columns) return null
  return {
    orientation,
    pixelSpacing: spacing?.length === 2 ? [spacing[0], spacing[1]] : [1, 1],
    rows,
    columns,
    thickness: numbers(measures, 'x00180050')?.[0] ?? numbers(measures, 'x00180088')?.[0],
  }
}

/** Image Position (Patient) of each frame. */
export function framePositions(dataSet: DataSet, frameCount: number): number[][] {
  return Array.from({ length: frameCount }, (_, frame) => numbers(frameGroup(dataSet, frame, 'x00209113') ?? dataSet, 'x00200032') ?? [0, 0, 0])
}
