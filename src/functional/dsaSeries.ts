// DSA of an angiography run: its frames loaded as values, subtracted with the
// chosen masks and shifts, and added to the study as a new series.
import { imageLoader } from '@cornerstonejs/core'
import { newUid } from '../dicom/writer'
import type { DisplaySet } from '../dicom/types'
import { imageGeometry, pixelValues } from '../measurements/measure'
import { addFiles, selectSeries } from '../store/viewerActions'
import { useViewer } from '../store/viewerStore'
import { quantization, quantize, sliceToDicom } from '../volume/mprSeries'
import { findShift, maskForFrame, subtract, type Region, type Shift } from './dsa'

export interface DsaOptions {
  mask: number
  /** Split mask: from a frame on, another mask. */
  ranges: { from: number; mask: number }[]
  /** Pixel shift found per frame (motion correction), or the manual one for every frame. */
  autoShift: boolean
  shift: Shift
  /** 0–1 of the mask kept (anatomy landmarks). */
  landmark: number
}

export interface Frames {
  width: number
  height: number
  values: Float32Array[]
  spacing: number
}

/** Every frame of a series as values (all must have one size). */
export async function loadFrames(displaySet: DisplaySet): Promise<Frames | null> {
  const imageIds = displaySet.series.images.map((image) => image.imageId)
  const values: Float32Array[] = []
  let width = 0
  let height = 0
  for (const imageId of imageIds) {
    const image = await imageLoader.loadAndCacheImage(imageId)
    const value = pixelValues(imageId)
    if (!value) return null
    if (!width) [width, height] = [image.columns, image.rows]
    if (image.columns !== width || image.rows !== height) return null
    values.push(Float32Array.from({ length: width * height }, (_, i) => value(i)))
  }
  const g = imageGeometry(imageIds[0])
  return { width, height, values, spacing: g?.spacingX ?? 1 }
}

/** The middle of the image (at most 128 px square), where motion is looked for. */
function centreRegion(width: number, height: number, margin: number): Region {
  const w = Math.min(128, Math.floor(width / 2))
  const h = Math.min(128, Math.floor(height / 2))
  const x0 = Math.max(margin, Math.floor((width - w) / 2))
  const y0 = Math.max(margin, Math.floor((height - h) / 2))
  return { x0, y0, x1: Math.min(width - 1 - margin, x0 + w - 1), y1: Math.min(height - 1 - margin, y0 + h - 1) }
}

export const SHIFT_RANGE = 10

/** The mask and shift used for a frame. */
export function frameSettings(frames: Frames, frame: number, options: DsaOptions) {
  const mask = maskForFrame(frame, options.ranges, options.mask)
  const shift = options.autoShift
    ? findShift(frames.values[frame], frames.values[mask], frames.width, frames.height, centreRegion(frames.width, frames.height, SHIFT_RANGE), SHIFT_RANGE)
    : options.shift
  return { mask, shift }
}

export function subtractFrame(frames: Frames, frame: number, options: DsaOptions) {
  const { mask, shift } = frameSettings(frames, frame, options)
  return subtract(frames.values[frame], frames.values[mask], frames.width, frames.height, { shift, landmark: options.landmark })
}

/** Subtracts every frame and adds the result to the study as "DSA", then shows it. */
export async function addDsaSeries(displaySet: DisplaySet, frames: Frames, options: DsaOptions) {
  const results = frames.values.map((_, frame) => subtractFrame(frames, frame, options))
  let min = Infinity
  let max = -Infinity
  for (const r of results) for (const v of r) [min, max] = [Math.min(min, v), Math.max(max, v)]
  const q = quantization(min, max, Number.isInteger(min) && Number.isInteger(max))
  const { study, series } = displaySet
  const uid = newUid()
  const plane = { origin: [0, 0, 0], row: [1, 0, 0], column: [0, 1, 0], pixelSpacing: frames.spacing, columns: frames.width, rows: frames.height }
  // Centre the window on zero (no change), wide enough for the vessels.
  const extent = Math.max(Math.abs(min), Math.abs(max)) || 1
  const source = { patientName: study.patientName, patientId: study.patientId, studyInstanceUID: study.studyInstanceUID, studyDate: study.studyDate, modality: series.modality, window: { center: 0, width: extent } }
  const files = results.map((values, i) => {
    const bytes = sliceToDicom(quantize(values, q, 0), plane, source, { uid, number: 900 + series.seriesNumber, description: `DSA ${series.description || series.modality}`.trim(), instance: i + 1, thickness: 0 }, q)
    return { file: new File([bytes as BlobPart], `dsa_${i + 1}.dcm`), path: `DSA/dsa_${i + 1}.dcm` }
  })
  await addFiles(files)
  for (const s of useViewer.getState().studies) {
    const added = s.series.find((candidate) => candidate.seriesInstanceUID === uid)
    if (added) return selectSeries(s, added)
  }
}
