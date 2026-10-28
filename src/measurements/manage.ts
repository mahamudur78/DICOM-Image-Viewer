// Managing measurements: listing, selecting, deleting (undoable), copying,
// calibration, and saving to / loading from files.
import { Enums as CoreEnums, eventTarget, getRenderingEngine, metaData, utilities, type Types } from '@cornerstonejs/core'
import { Enums as ToolEnums, annotation as csAnnotation, utilities as toolUtilities } from '@cornerstonejs/tools'
import type { Annotation } from '@cornerstonejs/tools/types'
import { create } from 'zustand'
import { RENDERING_ENGINE_ID, viewportIdAt } from '../cornerstone/constants'
import { getViewport, rememberIndex, setImageIndex } from '../cornerstone/viewer'
import type { Series, Study } from '../dicom/types'
import { askForm } from '../dialogs/dialogStore'
import { t } from '../i18n'
import { notify } from '../notifications/toastStore'
import { setActiveCell, showInCell, useViewer } from '../store/viewerStore'
import { parseMeasurementFile, toCsv, toMeasurementFile, type StoredMeasurement, type Vec3 } from './fileFormat'
import { joinGroup } from './groups'
import { measureAnnotation, measureData, pointsOf, setUserCalibration, toolNameOf } from './measure'
import { annotationLines } from './text'
import { CalibrationTool, MEASUREMENT_TOOLS } from './tools'

const { DefaultHistoryMemo } = utilities.HistoryMemo

/** Tools whose annotations are measurements the user keeps (not the calibration line). */
const LISTED_TOOLS = new Set(MEASUREMENT_TOOLS.map((d) => d.Class.toolName).filter((name) => name !== CalibrationTool.toolName))

/** Bumped whenever annotations change, so the panel re-reads them. */
export const useMeasurementVersion = create(() => ({ version: 0 }))
const changed = () => useMeasurementVersion.setState((s) => ({ version: s.version + 1 }))

export const allMeasurements = () => csAnnotation.state.getAllAnnotations().filter((a) => LISTED_TOOLS.has(toolNameOf(a)))

const imageIdOf = (annotation: Annotation) => (annotation.metadata as { referencedImageId?: string }).referencedImageId

export function renderAnnotations() {
  const engine = getRenderingEngine(RENDERING_ENGINE_ID)
  if (engine) toolUtilities.triggerAnnotationRenderForViewportIds(engine.getViewports().map((v) => v.id))
}

let installed = false

/** Listens to annotation events once Cornerstone is initialised. */
export function installMeasurementEvents() {
  if (installed) return
  installed = true
  // Text stays readable over bright image areas.
  const style = csAnnotation.config.style
  const defaults = style.getDefaultToolStyles()
  style.setDefaultToolStyles({ ...defaults, global: { ...defaults.global, textBoxBackground: 'rgba(0, 0, 0, 0.55)' } })
  const { Events } = ToolEnums
  for (const event of [
    Events.ANNOTATION_ADDED,
    Events.ANNOTATION_MODIFIED,
    Events.ANNOTATION_REMOVED,
    Events.ANNOTATION_SELECTION_CHANGE,
    Events.ANNOTATION_VISIBILITY_CHANGE,
  ]) {
    eventTarget.addEventListener(event, changed)
  }
  eventTarget.addEventListener(Events.ANNOTATION_COMPLETED, (event: Event) => {
    const { annotation } = (event as CustomEvent<{ annotation: Annotation }>).detail
    joinGroup(annotation)
    if (toolNameOf(annotation) === CalibrationTool.toolName) void calibrateFrom(annotation)
    changed()
  })
  // Pixel statistics need the image; areas drawn before it loaded update once it has.
  eventTarget.addEventListener(CoreEnums.Events.IMAGE_LOADED, changed)
}

// --- where measurements are ------------------------------------------------------

export interface ImageLocation {
  study: Study
  series: Series
  index: number
}

/** The series and image index of an image id in the open studies. */
export function locateImage(imageId: string | undefined): ImageLocation | null {
  if (!imageId) return null
  for (const study of useViewer.getState().studies) {
    for (const series of study.series) {
      const index = series.images.findIndex((image) => image.imageId === imageId)
      if (index >= 0) return { study, series, index }
    }
  }
  return null
}

/** Shows the image a measurement is on: in a cell already showing its series, else in the active cell. */
export function showMeasurement(annotation: Annotation) {
  const location = locateImage(imageIdOf(annotation))
  csAnnotation.selection.setAnnotationSelected(annotation.annotationUID!, true)
  if (!location) return renderAnnotations()
  const { cells, activeCell, layout } = useViewer.getState()
  const visible = layout.rows * layout.cols
  const cell = cells.findIndex((c, i) => i < visible && c?.series.id === location.series.id)
  if (cell >= 0) {
    setActiveCell(cell)
    void setImageIndex(viewportIdAt(cell), location.index)
  } else {
    rememberIndex(viewportIdAt(activeCell), location.series.id, location.index)
    showInCell(activeCell, { study: location.study, series: location.series })
  }
  renderAnnotations()
}

// --- editing -----------------------------------------------------------------

const UID = (annotation: Annotation) => annotation.annotationUID!

/** Removes measurements; one undo brings them all back. */
export function deleteMeasurements(annotations: Annotation[]) {
  if (annotations.length === 0) return
  DefaultHistoryMemo.startGroupRecording()
  for (const annotation of annotations) {
    DefaultHistoryMemo.push({
      restoreMemo: (undo?: boolean) => {
        if (undo) csAnnotation.state.addAnnotation(annotation, undefined as unknown as string)
        else csAnnotation.state.removeAnnotation(UID(annotation))
        renderAnnotations()
      },
    })
    csAnnotation.state.removeAnnotation(UID(annotation))
  }
  DefaultHistoryMemo.endGroupRecording()
  renderAnnotations()
  changed()
}

export const selectedMeasurements = () => {
  const selected = new Set(csAnnotation.selection.getAnnotationsSelected())
  return allMeasurements().filter((a) => selected.has(UID(a)))
}

export function measurementsOnImage(imageId: string | undefined) {
  return imageId ? allMeasurements().filter((a) => imageIdOf(a) === imageId) : []
}

export function measurementsInSeries(series: Series | undefined) {
  if (!series) return []
  const ids = new Set(series.images.map((image) => image.imageId))
  return allMeasurements().filter((a) => ids.has(imageIdOf(a) ?? ''))
}

export const canUndo = () => DefaultHistoryMemo.canUndo
export const canRedo = () => DefaultHistoryMemo.canRedo

export function undo() {
  DefaultHistoryMemo.undo()
  renderAnnotations()
  changed()
}

export function redo() {
  DefaultHistoryMemo.redo()
  renderAnnotations()
  changed()
}

export function setLabel(annotation: Annotation, label: string) {
  ;(annotation.data as { label?: string }).label = label
  annotation.invalidated = true
  renderAnnotations()
  changed()
}

export function setColor(annotation: Annotation, color: string | null) {
  csAnnotation.config.style.setAnnotationStyles(UID(annotation), color ? { color, colorHighlighted: color, colorSelected: color, textBoxColor: color, textBoxColorHighlighted: color, textBoxColorSelected: color } : {})
  renderAnnotations()
  changed()
}

export const colorOf = (annotation: Annotation) =>
  (csAnnotation.config.style.getAnnotationToolStyles?.(UID(annotation)) as { color?: string } | undefined)?.color

export const isHidden = (annotation: Annotation) => !csAnnotation.visibility.isAnnotationVisible(UID(annotation))

export function setHidden(annotations: Annotation[], hidden: boolean) {
  for (const annotation of annotations) csAnnotation.visibility.setAnnotationVisibility(UID(annotation), !hidden)
  renderAnnotations()
  changed()
}

/** Asks for a new label of a measurement. */
export async function renameMeasurement(annotation: Annotation) {
  const current = (annotation.data as { label?: string }).label ?? ''
  const values = await askForm('measure.renameTitle', [{ name: 'label', label: 'measure.label', type: 'text', value: current }], 'dialogs.apply')
  if (values) setLabel(annotation, values.label.trim())
}

// --- copy to another image ---------------------------------------------------------

const cloneData = <T>(value: T): T => JSON.parse(JSON.stringify(value, (key, v) => (key === 'instance' || key === 'pointsManager' || key === 'cachedStats' ? undefined : v)))

/**
 * Copies measurements onto the image shown in a viewport, moving their
 * points straight onto its plane (the same place on a neighbouring slice).
 */
export function copyToViewport(annotations: Annotation[], viewportId: string) {
  const viewport = getViewport(viewportId)
  const imageId = viewport?.getCurrentImageId?.()
  if (!viewport || !imageId) return 0
  const { normal, point } = planeOf(viewport)
  const project = (p: Types.Point3): Types.Point3 => {
    const offset = (p[0] - point[0]) * normal[0] + (p[1] - point[1]) * normal[1] + (p[2] - point[2]) * normal[2]
    return [p[0] - offset * normal[0], p[1] - offset * normal[1], p[2] - offset * normal[2]]
  }
  DefaultHistoryMemo.startGroupRecording()
  let copied = 0
  for (const source of annotations) {
    if (imageIdOf(source) === imageId) continue
    const data = cloneData(source.data) as Annotation['data'] & { groupId?: string; contour?: { polyline: Types.Point3[] } }
    data.handles = { ...data.handles, points: pointsOf(source).map(project) }
    if (data.contour?.polyline) data.contour.polyline = data.contour.polyline.map(project)
    data.cachedStats = {}
    delete data.groupId
    const copy: Annotation = {
      annotationUID: utilities.uuidv4(),
      highlighted: false,
      invalidated: true,
      isLocked: false,
      isVisible: true,
      metadata: { ...viewport.getViewReference(), toolName: toolNameOf(source) },
      data,
    }
    csAnnotation.state.addAnnotation(copy, viewport.element)
    DefaultHistoryMemo.push({
      restoreMemo: (undo?: boolean) => {
        if (undo) csAnnotation.state.removeAnnotation(UID(copy))
        else csAnnotation.state.addAnnotation(copy, undefined as unknown as string)
        renderAnnotations()
      },
    })
    copied++
  }
  DefaultHistoryMemo.endGroupRecording()
  renderAnnotations()
  changed()
  return copied
}

function planeOf(viewport: Types.IStackViewport) {
  const camera = viewport.getCamera()
  return { normal: camera.viewPlaneNormal!, point: camera.focalPoint! }
}

/** Measurements copied with "copy", pasted onto another image with "paste". */
let clipboard: Annotation[] = []

export function copyMeasurements(annotations: Annotation[]) {
  clipboard = annotations
  if (annotations.length) notify(t('measure.copied', { count: annotations.length }), 'info')
}

export const hasCopiedMeasurements = () => clipboard.length > 0

export function pasteMeasurements(viewportId: string) {
  const live = new Set(allMeasurements())
  const count = copyToViewport(clipboard.filter((a) => live.has(a)), viewportId)
  if (!count) notify(t('measure.nothingPasted'), 'info')
}

// --- calibration ---------------------------------------------------------------

/** Calibration lines already handled: Cornerstone can report a line as completed more than once. */
const calibrationLines = new Set<string>()

/** After a calibration line is drawn: asks its real length and calibrates the line's series. */
async function calibrateFrom(line: Annotation) {
  if (calibrationLines.has(UID(line))) return
  calibrationLines.add(UID(line))
  const imageId = imageIdOf(line)
  // The line is only a tool for calibrating; it goes once the tool has finished with it.
  await new Promise((resolve) => setTimeout(resolve))
  csAnnotation.state.removeAnnotation(UID(line))
  renderAnnotations()
  if (!imageId) return
  // Measured without any earlier user calibration of this series.
  const location = locateImage(imageId)
  const imageIds = location?.series.images.map((image) => image.imageId) ?? [imageId]
  setUserCalibration(imageIds, null)
  const measured = measureData(toolNameOf(line), line.data, `imageId:${imageId}`)
  if (!measured?.length) return
  const values = await askForm(
    'measure.calibrateTitle',
    [{ name: 'mm', label: 'measure.calibrateLength', type: 'number', value: '', min: 0.001, required: true }],
    'dialogs.apply',
  )
  const mm = Number(values?.mm)
  if (!values || !(mm > 0)) return
  setUserCalibration(imageIds, mm / measured.length)
  invalidateAll()
  notify(t('measure.calibrated', { mm }), 'success')
}

export function clearCalibration(imageId: string | undefined) {
  const location = locateImage(imageId)
  setUserCalibration(location?.series.images.map((image) => image.imageId) ?? (imageId ? [imageId] : []), null)
  invalidateAll()
}

function invalidateAll() {
  for (const annotation of csAnnotation.state.getAllAnnotations()) annotation.invalidated = true
  renderAnnotations()
  changed()
}

// --- rows, CSV and files ----------------------------------------------------------

export interface MeasurementRow {
  annotation: Annotation
  toolName: string
  label: string
  lines: string[]
  location: ImageLocation | null
}

export function measurementRows(): MeasurementRow[] {
  return allMeasurements().map((annotation) => {
    const result = measureAnnotation(annotation)
    const data = annotation.data as { label?: string; text?: string }
    return {
      annotation,
      toolName: toolNameOf(annotation),
      label: data.label ?? '',
      lines: annotationLines(annotation, result),
      location: locateImage(imageIdOf(annotation)),
    }
  })
}

const toolLabel = (toolName: string) => t(`measure.tools.${toolName}`, { defaultValue: toolName })

export function measurementsCsv(rows = measurementRows()) {
  return toCsv([
    [t('measure.csv.series'), t('measure.csv.image'), t('measure.csv.tool'), t('measure.csv.label'), t('measure.csv.values')],
    ...rows.map((row) => [
      row.location ? `${row.location.series.seriesNumber} ${row.location.series.description}`.trim() : 'MPR',
      row.location ? row.location.index + 1 : '',
      toolLabel(row.toolName),
      row.label,
      row.lines.join('; '),
    ]),
  ])
}

export function downloadText(text: string, fileName: string, type: string) {
  const link = document.createElement('a')
  link.href = URL.createObjectURL(new Blob([text], { type }))
  link.download = fileName
  link.click()
  setTimeout(() => URL.revokeObjectURL(link.href), 1000)
}

/** Measurements on loaded images as a file; MPR measurements (no image) are left out. */
export function measurementsFile() {
  const stored = allMeasurements().flatMap((annotation): StoredMeasurement[] => {
    const location = locateImage(imageIdOf(annotation))
    if (!location) return []
    const image = location.series.images[location.index]
    const data = annotation.data as Annotation['data'] & { contour?: { polyline: Vec3[]; closed: boolean }; spline?: { type: string }; groupId?: string; groupIndex?: number }
    const metadata = annotation.metadata as { viewPlaneNormal?: Vec3; viewUp?: Vec3 }
    return [
      {
        toolName: toolNameOf(annotation),
        sopInstanceUID: image.sopInstanceUID,
        frame: image.frame,
        color: colorOf(annotation),
        hidden: isHidden(annotation) || undefined,
        data: {
          points: pointsOf(annotation) as Vec3[],
          polyline: data.contour?.polyline,
          closed: data.contour?.closed,
          splineType: data.spline?.type,
          label: data.label,
          groupId: data.groupId,
          groupIndex: data.groupIndex,
        },
        viewPlaneNormal: metadata.viewPlaneNormal,
        viewUp: metadata.viewUp,
      },
    ]
  })
  return { text: toMeasurementFile(stored), count: stored.length }
}

/** Adds the measurements of a file to the images they belong to; returns how many were placed and skipped. */
export function loadMeasurementsFile(text: string) {
  const entries = parseMeasurementFile(text)
  const images = new Map<string, string>()
  for (const study of useViewer.getState().studies) {
    for (const series of study.series) for (const image of series.images) if (image.imageId) images.set(`${image.sopInstanceUID}|${image.frame}`, image.imageId)
  }
  let placed = 0
  for (const entry of entries) {
    const imageId = images.get(`${entry.sopInstanceUID}|${entry.frame}`)
    if (!imageId || !LISTED_TOOLS.has(entry.toolName)) continue
    const annotation = restoreAnnotation(entry, imageId)
    csAnnotation.state.addAnnotation(annotation, undefined as unknown as string)
    if (entry.color) setColor(annotation, entry.color)
    if (entry.hidden) csAnnotation.visibility.setAnnotationVisibility(UID(annotation), false)
    placed++
  }
  renderAnnotations()
  changed()
  return { placed, skipped: entries.length - placed }
}

function restoreAnnotation(entry: StoredMeasurement, imageId: string): Annotation {
  const plane = metaData.get('imagePlaneModule', imageId) as { frameOfReferenceUID?: string; rowCosines?: number[]; columnCosines?: number[] } | undefined
  const { points, polyline, closed, splineType, ...rest } = entry.data
  const data: Record<string, unknown> = {
    ...rest,
    handles: {
      points,
      activeHandleIndex: null,
      textBox: { hasMoved: false, worldPosition: [0, 0, 0], worldBoundingBox: { topLeft: [0, 0, 0], topRight: [0, 0, 0], bottomLeft: [0, 0, 0], bottomRight: [0, 0, 0] } },
    },
    cachedStats: {},
  }
  if (polyline) data.contour = { polyline, closed: closed ?? true }
  if (splineType) data.spline = { type: splineType, resolution: 20 }
  return {
    annotationUID: utilities.uuidv4(),
    highlighted: false,
    invalidated: true,
    isLocked: false,
    isVisible: true,
    metadata: {
      toolName: entry.toolName,
      referencedImageId: imageId,
      FrameOfReferenceUID: plane?.frameOfReferenceUID as string,
      viewPlaneNormal: entry.viewPlaneNormal ?? cross(plane?.rowCosines, plane?.columnCosines),
      viewUp: entry.viewUp,
    },
    data: data as Annotation['data'],
  }
}

function cross(a = [1, 0, 0], b = [0, 1, 0]): Types.Point3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
}

// --- redaction in exports -----------------------------------------------------------

/** Redaction boxes on a viewport's current image, as polygons in canvas (CSS pixel) coordinates. */
export function redactionPolygons(viewportId: string): Types.Point2[][] {
  const viewport = getViewport(viewportId)
  const imageId = viewport?.getCurrentImageId?.()
  if (!viewport || !imageId) return []
  return allMeasurements()
    .filter((a) => toolNameOf(a) === 'Redaction' && imageIdOf(a) === imageId)
    .map((a) => {
      const [topLeft, topRight, bottomLeft, bottomRight] = pointsOf(a).map((p) => viewport.worldToCanvas(p))
      return [topLeft, topRight, bottomRight, bottomLeft]
    })
}
