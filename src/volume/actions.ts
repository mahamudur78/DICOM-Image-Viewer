// Making new images from a volume: a reformatted series along the MPR view,
// and a curved reformat along a drawn path.
import { metaData } from '@cornerstonejs/core'
import { getMprViewport } from '../cornerstone/mpr'
import { cprUp, mprGrid, planReformat, reformatSlice, useCpr } from '../cornerstone/mprTools'
import { newUid } from '../dicom/writer'
import { addFiles } from '../store/viewerActions'
import { useViewer } from '../store/viewerStore'
import { curvedReformat, type VolumeGrid } from './grid'
import { quantization, quantize, sliceToDicom, type SeriesSource } from './mprSeries'

const PLANE_NAMES = ['axial', 'sagittal', 'coronal', 'oblique'] as const

function range(grid: VolumeGrid) {
  let min = Infinity
  let max = -Infinity
  let integers = true
  const s = grid.scalars
  for (let i = 0; i < s.length; i++) {
    const v = s[i]
    if (v < min) min = v
    if (v > max) max = v
    if (integers && i % 97 === 0 && !Number.isInteger(v)) integers = false
  }
  return { min, max, integers }
}

function sourceOf(viewportId: string): SeriesSource | null {
  const view = useViewer.getState().volumeView
  if (!view) return null
  const { study, series } = view.displaySet
  const plane = metaData.get('imagePlaneModule', series.images[0].imageId) as { frameOfReferenceUID?: string } | undefined
  const voi = getMprViewport(viewportId)?.getProperties()?.voiRange
  return {
    patientName: study.patientName,
    patientId: study.patientId,
    studyInstanceUID: study.studyInstanceUID,
    studyDate: study.studyDate,
    modality: series.modality,
    frameOfReferenceUID: plane?.frameOfReferenceUID,
    window: voi ? { center: (voi.upper + voi.lower) / 2, width: voi.upper - voi.lower } : undefined,
  }
}

function planeName(normal: number[]) {
  const n = normal.map(Math.abs)
  const largest = Math.max(...n)
  return largest < 0.9 ? PLANE_NAMES[3] : largest === n[2] ? PLANE_NAMES[0] : largest === n[0] ? PLANE_NAMES[1] : PLANE_NAMES[2]
}

/**
 * Slices `spacing` mm apart along the active MPR view, covering the volume,
 * added to the open study as a new series. Returns the number of slices.
 */
export async function createMprSeries(spacing: number, onProgress: (done: number, total: number) => void) {
  const viewportId = useViewer.getState().mprViewportId
  const plan = planReformat(viewportId, spacing)
  const grid = mprGrid(viewportId)
  const source = sourceOf(viewportId)
  if (!plan || !grid || !source) return 0
  const { min, max, integers } = range(grid)
  const q = quantization(min, max, integers)
  const uid = newUid()
  const description = `MPR ${planeName(plan.normal)} ${spacing} mm`
  const files: File[] = []
  for (const [i, plane] of plan.planes.entries()) {
    const pixels = quantize(reformatSlice(grid, plane, min), q, min)
    const bytes = sliceToDicom(pixels, plane, source, { uid, number: 900, description, instance: i + 1, thickness: spacing }, q)
    files.push(new File([bytes as BlobPart], `mpr_${String(i + 1).padStart(4, '0')}.dcm`))
    onProgress(i + 1, plan.planes.length)
    // Lets the progress repaint on long series.
    if (i % 20 === 19) await new Promise((resolve) => setTimeout(resolve))
  }
  await addFiles(files.map((file) => ({ file, path: `MPR/${file.name}` })))
  return files.length
}

export interface CprImage {
  data: Float32Array
  columns: number
  rows: number
  /** Length of the path in mm. */
  length: number
  pixelSpacing: number
}

/** A straightened curved reformat along the drawn path. */
export function makeCpr(height: number, thickness: number, pixelSpacing?: number): CprImage | null {
  const { viewportId, points } = useCpr.getState()
  const up = cprUp()
  const grid = viewportId ? mprGrid(viewportId) : null
  if (!grid || !up || points.length < 2) return null
  const spacing = pixelSpacing ?? Math.min(...grid.spacing)
  const result = curvedReformat(grid, points, { up, height, pixelSpacing: spacing, thickness })
  return { ...result, pixelSpacing: spacing }
}

/** The window of the viewport the path was drawn on, to show the CPR the same way. */
export function cprWindow() {
  const { viewportId } = useCpr.getState()
  return (viewportId && getMprViewport(viewportId)?.getProperties()?.voiRange) || null
}

/** A CPR image as a one-image series in the open study (no plane geometry: it is curved). */
export async function addCprToStudy(image: CprImage) {
  const { viewportId } = useCpr.getState()
  const source = viewportId ? sourceOf(viewportId) : null
  if (!source) return
  const { min, max } = image.data.reduce((r, v) => (Number.isNaN(v) ? r : { min: Math.min(r.min, v), max: Math.max(r.max, v) }), { min: Infinity, max: -Infinity })
  const q = quantization(min, max, false)
  const plane = { origin: [0, 0, 0], row: [1, 0, 0], column: [0, 1, 0], pixelSpacing: image.pixelSpacing, columns: image.columns, rows: image.rows }
  const bytes = sliceToDicom(quantize(image.data, q, min), plane, { ...source, frameOfReferenceUID: undefined }, { uid: newUid(), number: 950, description: `CPR ${Math.round(image.length)} mm`, instance: 1, thickness: 0 }, q)
  await addFiles([{ file: new File([bytes as BlobPart], 'cpr.dcm'), path: 'CPR/cpr.dcm' }])
}

/** Draws reformat values into a canvas with a window (lower–upper). */
export function renderGray(data: Float32Array, columns: number, rows: number, window: { lower: number; upper: number }) {
  const canvas = document.createElement('canvas')
  canvas.width = columns
  canvas.height = rows
  const context = canvas.getContext('2d')!
  const image = context.createImageData(columns, rows)
  const span = Math.max(1e-6, window.upper - window.lower)
  for (let i = 0; i < data.length; i++) {
    const v = Number.isNaN(data[i]) ? 0 : Math.max(0, Math.min(255, ((data[i] - window.lower) / span) * 255))
    image.data.set([v, v, v, 255], i * 4)
  }
  context.putImageData(image, 0, 0)
  return canvas
}

