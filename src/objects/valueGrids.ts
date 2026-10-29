// Objects whose pixels are measured values on a 3D grid: RT Dose and
// parametric maps (e.g. ADC, perfusion, AI probability maps).
import { add, cross, normalize, scale, worldToIndex, type Vec3, type VolumeGrid } from '../volume/grid'
import { bytesOf, codeMeaning, firstItem, number, numbers, referenceOf, text, floats, type DataSet } from './dicom'
import { framePositions, frameGroup, planeLayout } from './frames'
import { gridForFrames, type PlaneLayout } from './labels'

export interface ValueGrid {
  grid: VolumeGrid & { scalars: Float32Array }
  unit: string
  min: number
  max: number
}

/** The stored pixel values of every frame, as numbers. */
function storedValues(dataSet: DataSet): ArrayLike<number> | null {
  const float = bytesOf(dataSet, 'x7fe00008')
  if (float) return new Float32Array(float.buffer.slice(float.byteOffset, float.byteOffset + float.byteLength))
  const double = bytesOf(dataSet, 'x7fe00009')
  if (double) return new Float64Array(double.buffer.slice(double.byteOffset, double.byteOffset + double.byteLength))
  const bytes = bytesOf(dataSet, 'x7fe00010')
  if (!bytes) return null
  const bits = dataSet.uint16('x00280100') ?? 16
  const signed = dataSet.uint16('x00280103') === 1
  const copy = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
  if (bits === 32) return signed ? new Int32Array(copy) : new Uint32Array(copy)
  if (bits === 8) return signed ? new Int8Array(copy) : new Uint8Array(copy)
  return signed ? new Int16Array(copy.slice(0, Math.floor(copy.byteLength / 2) * 2)) : new Uint16Array(copy.slice(0, Math.floor(copy.byteLength / 2) * 2))
}

/** Puts frame values into a grid covering the frames. */
function fill(layout: PlaneLayout, positions: Vec3[], valueOf: (frame: number, pixel: number) => number): ValueGrid['grid'] {
  const grid = gridForFrames(layout, positions)
  grid.scalars.fill(NaN)
  const [nx, ny, nz] = grid.dimensions
  positions.forEach((position, frame) => {
    const [oi, oj, k] = worldToIndex(grid, position).map(Math.round)
    if (k < 0 || k >= nz) return
    for (let y = 0; y < layout.rows; y++)
      for (let x = 0; x < layout.columns; x++) {
        const [i, j] = [x + oi, y + oj]
        if (i >= 0 && j >= 0 && i < nx && j < ny) grid.scalars[k * nx * ny + j * nx + i] = valueOf(frame, y * layout.columns + x)
      }
  })
  return grid
}

function finish(grid: ValueGrid['grid'], unit: string): ValueGrid {
  let min = Infinity
  let max = -Infinity
  for (const v of grid.scalars) {
    if (Number.isNaN(v)) continue
    if (v < min) min = v
    if (v > max) max = v
  }
  return { grid, unit, min: Number.isFinite(min) ? min : 0, max: Number.isFinite(max) ? max : 0 }
}

// --- RT Dose ---------------------------------------------------------------------------

export interface DoseInfo {
  /** GY or RELATIVE. */
  units: string
  type?: string
  summation?: string
  planUID?: string
}

export function doseInfo(dataSet: DataSet): DoseInfo {
  const plan = firstItem(dataSet, 'x300c0002')
  return { units: text(dataSet, 'x30040002') ?? 'GY', type: text(dataSet, 'x30040004'), summation: text(dataSet, 'x3004000a'), planUID: plan && referenceOf(plan)?.sopInstanceUID }
}

/** Dose in Gy (or relative), frames placed by the Grid Frame Offset Vector. */
export function parseRtDose(dataSet: DataSet): ValueGrid | null {
  const position = numbers(dataSet, 'x00200032')
  const orientation = numbers(dataSet, 'x00200037')
  const spacing = numbers(dataSet, 'x00280030')
  const rows = dataSet.uint16('x00280010') ?? 0
  const columns = dataSet.uint16('x00280011') ?? 0
  const frames = Math.max(1, number(dataSet, 'x00280008') ?? 1)
  const values = storedValues(dataSet)
  if (position?.length !== 3 || orientation?.length !== 6 || !values || !rows || !columns) return null
  const normal = normalize(cross(orientation.slice(0, 3), orientation.slice(3, 6)))
  const offsets = numbers(dataSet, 'x3004000c') ?? [0]
  // Offsets are relative to the first frame when the first is 0, otherwise positions along the normal.
  const base = offsets[0] === 0 ? 0 : offsets[0]
  const positions = Array.from({ length: frames }, (_, f) => add(position, scale(normal, (offsets[f] ?? f) - base)))
  const scaling = number(dataSet, 'x3004000e') ?? 1
  const size = rows * columns
  const layout: PlaneLayout = { orientation, pixelSpacing: [spacing?.[0] ?? 1, spacing?.[1] ?? 1], rows, columns }
  const units = text(dataSet, 'x30040002') ?? 'GY'
  return finish(fill(layout, positions, (frame, pixel) => values[frame * size + pixel] * scaling), units === 'GY' ? 'Gy' : '%')
}

// --- parametric map ----------------------------------------------------------------------

/** Values with the Real World Value Mapping (or rescale) applied, and their unit. */
export function parseParametricMap(dataSet: DataSet): (ValueGrid & { label?: string }) | null {
  const layout = planeLayout(dataSet)
  const values = storedValues(dataSet)
  if (!layout || !values) return null
  const frames = Math.max(1, number(dataSet, 'x00280008') ?? 1)
  const positions = framePositions(dataSet, frames)
  const first = frameGroup(dataSet, 0, 'x00409096')
  const slope = (first && (floats(first, 'x00409225', 8)[0] ?? number(first, 'x00409225'))) ?? number(dataSet, 'x00281053') ?? 1
  const intercept = (first && (floats(first, 'x00409224', 8)[0] ?? number(first, 'x00409224'))) ?? number(dataSet, 'x00281052') ?? 0
  const unit = (first && codeMeaning(first, 'x004008ea')) ?? ''
  const size = layout.rows * layout.columns
  const grid = fill(layout, positions, (frame, pixel) => values[frame * size + pixel] * (Number.isFinite(slope) ? slope : 1) + (Number.isFinite(intercept) ? intercept : 0))
  return { ...finish(grid, unit), label: (first && text(first, 'x00409210')) ?? text(dataSet, 'x0008103e') }
}
