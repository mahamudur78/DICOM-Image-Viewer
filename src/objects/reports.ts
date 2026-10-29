// Writing and applying reports of the images: measurement SR, key object
// selection and presentation states, from and to what the viewer shows.
import type { Types } from '@cornerstonejs/core'
import type { Annotation } from '@cornerstonejs/tools/types'
import { viewportIdAt } from '../cornerstone/constants'
import { getViewport } from '../cornerstone/viewer'
import { getImagePlane } from '../dicom/imagePlaneMetadata'
import { newUid } from '../dicom/writer'
import type { DisplaySet, ImageEntry, Series, Study } from '../dicom/types'
import { downloadBlob, safeName } from '../export/files'
import { t } from '../i18n'
import { toMeasurementFile } from '../measurements/fileFormat'
import { allMeasurements, loadMeasurementsFile, locateImage } from '../measurements/manage'
import { measureAnnotation, shapeOf, toolNameOf, type MeasurementResult } from '../measurements/measure'
import { annotationLines } from '../measurements/text'
import { notify } from '../notifications/toastStore'
import { addFiles, showReferencedImage } from '../store/viewerActions'
import { selectActiveDisplaySet, useViewer } from '../store/viewerStore'
import { isKeyImage } from './keyImages'
import { writeKeyObjects } from './keyObjects'
import { CONCEPTS, UNITS, toStoredMeasurements, worldToImage, writeMeasurementSr, type GraphicType, type ImagePlane, type MeasurementToWrite, type SrMeasurement } from './measurementSr'
import { planeOfImage } from './presentation'
import { writePresentationState, type PresentationGraphic } from './presentationState'
import type { ImageRef, ObjectSource } from './write'

/** Every loaded image by "sop|frame". */
function imagesBySop() {
  const map = new Map<string, { image: ImageEntry; series: Series; study: Study }>()
  for (const study of useViewer.getState().studies)
    for (const series of study.series) for (const image of series.images) if (image.imageId) map.set(`${image.sopInstanceUID}|${image.frame}`, { image, series, study })
  return map
}

/** Puts the measurements of a report on their images; returns how many were placed. */
export function showSrMeasurements(measurements: SrMeasurement[], cell: number) {
  const images = imagesBySop()
  const planeOf = (sop: string, frame: number) => {
    const found = images.get(`${sop}|${frame}`) ?? images.get(`${sop}|0`)
    return found ? planeOfImage(found.image.imageId) : null
  }
  const stored = toStoredMeasurements(measurements, planeOf)
  const { placed } = loadMeasurementsFile(toMeasurementFile(stored))
  const first = measurements.find((m) => images.has(`${m.image.sopInstanceUID}|${m.image.frame}`))
  if (first) showReferencedImage(cell, first.image.sopInstanceUID, first.image.frame || undefined)
  return placed
}

const sopClassOf = (image: ImageEntry) => image.sopClassUID ?? '1.2.840.10008.5.1.4.1.1.7'

function sourceFor(study: Study, series: Series, description: string, number: number): ObjectSource {
  return {
    patientName: study.patientName,
    patientId: study.patientId,
    studyInstanceUID: study.studyInstanceUID,
    studyDate: study.studyDate,
    seriesInstanceUID: newUid(),
    seriesNumber: number,
    seriesDescription: description,
    modality: series.modality,
  }
}

/** Adds a written object to the study (so it shows in the sidebar) and downloads it. */
async function addAndDownload(bytes: Uint8Array, name: string) {
  const file = new File([bytes as BlobPart], name, { type: 'application/dicom' })
  await addFiles([{ file, path: `DicomLens/${name}` }])
  downloadBlob(file, name)
}

// --- annotations as DICOM graphics ---------------------------------------------------------

interface Graphic {
  type: Exclude<GraphicType, 'MULTIPOINT'>
  points: [number, number][]
}

/** An annotation's shape in image coordinates (SR / GSPS conventions). */
function graphicOf(annotation: Annotation, plane: ImagePlane): Graphic | null {
  const shape = shapeOf(toolNameOf(annotation))
  const data = annotation.data as { handles?: { points?: Types.Point3[] }; contour?: { polyline?: Types.Point3[]; closed?: boolean } }
  const image = (world: number[]) => worldToImage(plane, world)
  const p = (data.handles?.points ?? []).map(image)
  switch (shape) {
    case 'length':
      return p.length >= 2 ? { type: 'POLYLINE', points: p.slice(0, 2) } : null
    case 'angle':
    case 'deviation':
      return p.length >= 3 ? { type: 'POLYLINE', points: p.slice(0, 3) } : null
    case 'cobb':
    case 'bidirectional':
      return p.length >= 2 ? { type: 'POLYLINE', points: p.slice(0, 2) } : null
    case 'ellipse':
      return p.length >= 4 ? { type: 'ELLIPSE', points: p.slice(0, 4) } : null
    case 'circle':
    case 'sphere':
      return p.length >= 2 ? { type: 'CIRCLE', points: p.slice(0, 2) } : null
    case 'rectangle':
      return p.length >= 4 ? { type: 'POLYLINE', points: [p[0], p[1], p[3], p[2], p[0]] } : null
    case 'contour': {
      const line = (data.contour?.polyline ?? []).map(image)
      if (line.length < 2) return null
      return { type: 'POLYLINE', points: data.contour?.closed !== false ? [...line, line[0]] : line }
    }
    case 'probe':
      return p.length ? { type: 'POINT', points: [p[0]] } : null
    default:
      return null
  }
}

/** The main value of a measurement as an SR NUM (concept, value, unit). */
function valueOf(annotation: Annotation, result: MeasurementResult): Pick<MeasurementToWrite, 'concept' | 'value' | 'unit'> | null {
  const mm = result.base === 'mm'
  if (result.area !== undefined) return { concept: CONCEPTS.area, value: result.area, unit: mm ? UNITS.mm2 : UNITS.none }
  if (result.angle !== undefined) return { concept: CONCEPTS.angle, value: result.angle, unit: UNITS.deg }
  if (result.longAxis !== undefined) return { concept: CONCEPTS.length, value: result.longAxis, unit: mm ? UNITS.mm : UNITS.none }
  if (result.length !== undefined) return { concept: CONCEPTS.length, value: result.length, unit: mm ? UNITS.mm : UNITS.none }
  if (result.value !== undefined) {
    const modality = locateImage((annotation.metadata as { referencedImageId?: string }).referencedImageId)?.series.modality
    return { concept: CONCEPTS.value, value: result.value, unit: modality === 'CT' ? UNITS.hu : UNITS.none }
  }
  return null
}

/** Measurements on loaded images, with their image, plane and shape. */
function measurementsOnImages(series?: Series) {
  return allMeasurements().flatMap((annotation) => {
    const imageId = (annotation.metadata as { referencedImageId?: string }).referencedImageId
    const location = locateImage(imageId)
    const plane = imageId ? planeOfImage(imageId) : null
    if (!location || !plane || (series && location.series.id !== series.id && location.series.id !== series.id.replace(/#.*$/, ''))) return []
    const graphic = graphicOf(annotation, plane)
    return graphic ? [{ annotation, location, graphic }] : []
  })
}

const refOf = (image: ImageEntry, series: Series): ImageRef & { seriesInstanceUID: string } => ({
  sopClassUID: sopClassOf(image),
  sopInstanceUID: image.sopInstanceUID,
  frame: image.frame,
  seriesInstanceUID: series.seriesInstanceUID,
})

// --- saving ------------------------------------------------------------------------------------

/** All measurements on images of the active study as a TID 1500 SR. */
export async function saveMeasurementSr() {
  const current = selectActiveDisplaySet(useViewer.getState())
  const found = measurementsOnImages().filter(({ location }) => !current || location.study === current.study)
  const study = current?.study ?? found[0]?.location.study
  const measurements = found.flatMap(({ annotation, location, graphic }): MeasurementToWrite[] => {
    const result = measureAnnotation(annotation)
    const value = result && valueOf(annotation, result)
    if (!value) return []
    const image = location.series.images[location.index]
    const label = (annotation.data as { label?: string }).label || t(`measure.tools.${toolNameOf(annotation)}`, { defaultValue: toolNameOf(annotation) })
    return [{ label, ...value, graphicType: graphic.type, points: graphic.points, image: refOf(image, location.series) }]
  })
  if (!study || !measurements.length) return notify(t('objects.nothingToSave'), 'info')
  const { bytes } = writeMeasurementSr(sourceFor(study, found[0].location.series, t('objects.measurementReport'), 990), measurements, t('objects.measurementReport'))
  await addAndDownload(bytes, `${safeName(study.patientName || 'measurements')}_SR.dcm`)
}

/** Key images of the active study as a Key Object Selection document. */
export async function saveKeyObjects() {
  const current = selectActiveDisplaySet(useViewer.getState())
  const study = current?.study ?? useViewer.getState().studies[0]
  if (!study) return
  const images = study.series.filter((s) => s.kind === 'image').flatMap((series) => series.images.filter((image) => isKeyImage(image)).map((image) => refOf(image, series)))
  const unique = [...new Map(images.map((i) => [`${i.sopInstanceUID}|${i.frame}`, i])).values()]
  if (!unique.length) return notify(t('objects.noKeyImages'), 'info')
  const { bytes } = writeKeyObjects(sourceFor(study, study.series[0], t('objects.keyImagesTitle'), 991), unique)
  await addAndDownload(bytes, `${safeName(study.patientName || 'key')}_KO.dcm`)
}

/** The active cell's view (window, rotation, flip, displayed area) and its measurements as a presentation state. */
export async function savePresentationState(cell = useViewer.getState().activeCell) {
  const displaySet: DisplaySet | null = useViewer.getState().cells[cell]
  const viewportId = viewportIdAt(cell)
  const viewport = getViewport(viewportId)
  const imageId = viewport?.getCurrentImageId()
  const plane = imageId ? planeOfImage(imageId) : null
  if (!displaySet || !viewport || !imageId || !plane) return notify(t('messages.selectSeries'))
  const { study, series } = displaySet
  const voi = viewport.getProperties().voiRange
  const presentation = viewport.getViewPresentation() as { rotation?: number; flipHorizontal?: boolean }
  const element = viewport.element
  const corners = [
    [0, 0],
    [element.clientWidth, 0],
    [0, element.clientHeight],
    [element.clientWidth, element.clientHeight],
  ].map((c) => worldToImage(plane, viewport.canvasToWorld(c as Types.Point2) as number[]))
  const size = getImagePlane(imageId) ?? { rows: 1, columns: 1 }
  const area = {
    topLeft: [Math.max(1, Math.floor(Math.min(...corners.map((c) => c[0]))) + 1), Math.max(1, Math.floor(Math.min(...corners.map((c) => c[1]))) + 1)] as [number, number],
    bottomRight: [Math.min(size.columns, Math.ceil(Math.max(...corners.map((c) => c[0])))), Math.min(size.rows, Math.ceil(Math.max(...corners.map((c) => c[1]))))] as [number, number],
  }
  const byImage = new Map<string, { image: ImageRef; graphics: Omit<PresentationGraphic, 'units'>[]; texts: { text: string; anchor: [number, number] }[] }>()
  for (const { annotation, location, graphic } of measurementsOnImages(series)) {
    const image = location.series.images[location.index]
    const key = `${image.sopInstanceUID}|${image.frame}`
    const entry = byImage.get(key) ?? { image: refOf(image, location.series), graphics: [], texts: [] }
    entry.graphics.push({ type: graphic.type, points: graphic.points, filled: false })
    const lines = annotationLines(annotation, measureAnnotation(annotation))
    const label = (annotation.data as { label?: string }).label
    const text = [label, ...lines].filter(Boolean).join(' · ')
    if (text) entry.texts.push({ text, anchor: graphic.points[0] })
    byImage.set(key, entry)
  }
  const { bytes } = writePresentationState(sourceFor(study, series, t('objects.presentationTitle'), 992), {
    label: series.description || 'VIEW',
    description: t('objects.presentationTitle'),
    images: series.images.filter((i) => i.imageId).map((image) => refOf(image, series)),
    voi: voi ? { center: (voi.upper + voi.lower) / 2, width: voi.upper - voi.lower } : undefined,
    rotation: presentation.rotation ?? 0,
    flip: !!presentation.flipHorizontal,
    area: area.bottomRight[0] > area.topLeft[0] && area.bottomRight[1] > area.topLeft[1] ? area : undefined,
    annotations: [...byImage.values()],
  })
  await addAndDownload(bytes, `${safeName(series.description || 'view')}_PR.dcm`)
}

