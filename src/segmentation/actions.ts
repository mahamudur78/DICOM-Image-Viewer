// Whole-segmentation actions: threshold, interpolation, results, 3D, TMTV
// and saving as DICOM SEG or RTSTRUCT.
import type { Types } from '@cornerstonejs/core'
import { MPR_VR_VIEWPORT_ID, VR_VIEWPORT_ID } from '../cornerstone/constants'
import { getViewport } from '../cornerstone/viewer'
import { useViewportRegistry } from '../cornerstone/viewportRegistry'
import { hideLabelSurfaces, labelMesh, showLabelSurfaces } from '../cornerstone/volume3dTools'
import { getImagePlane } from '../dicom/imagePlaneMetadata'
import { newUid } from '../dicom/writer'
import { downloadBlob, safeName } from '../export/files'
import { addFiles } from '../store/viewerActions'
import { useViewer, selectTargetViewportId } from '../store/viewerStore'
import { encodeStl } from '../volume/mesh'
import { cross, dot, indexToWorld, normalize } from '../volume/grid'
import { Recorder, clearSegment, interpolateSlices, segmentStats, sliceAxis, thresholdAll, tmtv, type SegmentStats, type TmtvResult } from './edit'
import { addSegment, baseSeriesOf, changed, edit, historyOf, labelGridOf, segmentsOf, useEditor, valuesOf } from './session'
import { writeRtStruct, writeSeg, type SliceImages } from './writeObjects'

/** The view direction of the target viewport (axial when unknown). */
function viewNormal() {
  const id = selectTargetViewportId(useViewer.getState())
  const camera = id ? (getViewport(id) as unknown as Types.IViewport | undefined)?.getCamera() : undefined
  return [...(camera?.viewPlaneNormal ?? [0, 0, 1])]
}

export async function thresholdVolume() {
  const { key, lower, upper } = useEditor.getState()
  const values = key && (await valuesOf(key))
  if (!values) return false
  return edit((grid, bit, recorder) => thresholdAll(grid, bit, values, lower, upper, recorder))
}

/** Fills the slices between drawn ones, along the axis the target view shows. */
export function interpolate() {
  let filled = 0
  edit((grid, bit, recorder) => (filled = interpolateSlices(grid, bit, sliceAxis(grid, viewNormal()), recorder)))
  return filled
}

export const clearActive = () => edit((grid, bit, recorder) => clearSegment(grid, bit, recorder))

/** Statistics of every segment, in the image's values (HU, SUV). */
export async function segmentationStats(key: string): Promise<Map<number, SegmentStats>> {
  const grid = labelGridOf(key)
  const values = await valuesOf(key)
  const out = new Map<number, SegmentStats>()
  if (!grid) return out
  for (const segment of segmentsOf(key)) out.set(segment.bit, segmentStats(grid, segment.bit, values ?? (() => NaN)))
  return out
}

/** TMTV on a PET series: lesions above the threshold go into a new "TMTV" segment. */
export async function runTmtv(key: string, threshold: { suv: number } | { percent: number }, within?: number): Promise<TmtvResult | null> {
  const values = await valuesOf(key)
  const grid = labelGridOf(key)
  if (!values || !grid) return null
  const bit = addSegment(key, 'TMTV')
  if (bit === null) return null
  const recorder = new Recorder(grid)
  const result = tmtv(grid, bit, values, threshold, recorder, { within })
  historyOf(key).push(recorder.finish())
  changed(key)
  return result
}

// --- 3D and STL --------------------------------------------------------------------------------------

export function threeDViewport() {
  const kinds = useViewportRegistry.getState().kinds
  return kinds[VR_VIEWPORT_ID] === 'volume3d' ? VR_VIEWPORT_ID : kinds[MPR_VR_VIEWPORT_ID] === 'volume3d' ? MPR_VR_VIEWPORT_ID : null
}

/** Surfaces of the visible segments in the 3D view; returns how many were made. */
export function showSurfaces(key: string) {
  const viewportId = threeDViewport()
  const grid = labelGridOf(key)
  if (!viewportId || !grid) return 0
  const surfaces = segmentsOf(key).flatMap((segment) => {
    if (!segment.visible) return []
    const made = labelMesh(grid, segment.bit)
    return made ? [{ bit: segment.bit, color: segment.color, polyData: made.polyData }] : []
  })
  showLabelSurfaces(viewportId, surfaces)
  return surfaces.length
}

export function hideSurfaces() {
  const viewportId = threeDViewport()
  if (viewportId) hideLabelSurfaces(viewportId)
}

export function downloadStl(key: string, bit: number) {
  const grid = labelGridOf(key)
  const segment = segmentsOf(key).find((s) => s.bit === bit)
  const made = grid && labelMesh(grid, bit)
  if (!made || !segment) return false
  downloadBlob(new Blob([encodeStl(made.mesh, `DicomLens segment ${segment.label}`)], { type: 'model/stl' }), `${safeName(segment.label)}.stl`)
  return true
}

// --- saving ----------------------------------------------------------------------------------------------

/** The base image at each slice of the label grid (same position within half a slice). */
function sliceImages(key: string): SliceImages {
  const grid = labelGridOf(key)
  const base = baseSeriesOf(key)
  if (!grid || !base) return []
  const normal = normalize(cross(grid.direction.slice(0, 3), grid.direction.slice(3, 6)))
  const images = base.series.images.flatMap((image) => {
    const plane = getImagePlane(image.imageId)
    return plane ? [{ image, at: dot(plane.imagePositionPatient, normal) }] : []
  })
  return Array.from({ length: grid.dimensions[2] }, (_, k) => {
    const at = dot(indexToWorld(grid, [0, 0, k]), normal)
    const match = images.find((i) => Math.abs(i.at - at) < grid.spacing[2] / 2)
    return match ? { sopClassUID: match.image.sopClassUID ?? '1.2.840.10008.5.1.4.1.1.2', sopInstanceUID: match.image.sopInstanceUID, frame: match.image.frame } : null
  })
}

function sourceOf(key: string, description: string, number: number) {
  const base = baseSeriesOf(key)!
  const { study, series } = base
  return {
    patientName: study.patientName,
    patientId: study.patientId,
    studyInstanceUID: study.studyInstanceUID,
    studyDate: study.studyDate,
    seriesInstanceUID: newUid(),
    seriesNumber: number,
    seriesDescription: description,
    modality: series.modality,
    referencedSeriesUID: series.seriesInstanceUID,
    frameOfReferenceUID: getImagePlane(series.images[0]?.imageId)?.frameOfReferenceUID ?? newUid(),
  }
}

async function addAndDownload(bytes: Uint8Array, name: string) {
  const file = new File([bytes as BlobPart], name, { type: 'application/dicom' })
  await addFiles([{ file, path: `DicomLens/${name}` }])
  downloadBlob(file, name)
}

export async function saveSeg(key: string, description: string) {
  const grid = labelGridOf(key)
  if (!grid || !baseSeriesOf(key)) return false
  const segments = segmentsOf(key).map((s) => ({ ...s, algorithmType: s.label === 'TMTV' || s.automatic ? 'SEMIAUTOMATIC' : 'MANUAL' }))
  const { bytes } = writeSeg(sourceOf(key, description, 993), grid, segments, sliceImages(key), description)
  await addAndDownload(bytes, `${safeName(description)}_SEG.dcm`)
  return true
}

export async function saveRtStruct(key: string, description: string) {
  const grid = labelGridOf(key)
  if (!grid || !baseSeriesOf(key)) return false
  const { bytes } = writeRtStruct(sourceOf(key, description, 994), grid, segmentsOf(key), sliceImages(key), description)
  await addAndDownload(bytes, `${safeName(description)}_RTSTRUCT.dcm`)
  return true
}
