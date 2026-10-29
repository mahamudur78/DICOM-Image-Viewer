// Opening objects that act on images: overlays (SEG, RTSTRUCT, RTDOSE,
// parametric maps), key images and presentation states.
import type { DisplaySet, Series, Study } from '../dicom/types'
import type { VolumeGrid } from '../volume/grid'
import { findBaseSeries, gridOfSeries } from './base'
import { startObjectOverlay } from '../functional/fusionStore'
import { t } from '../i18n'
import { notify } from '../notifications/toastStore'
import { showInCell, useViewer } from '../store/viewerStore'
import { readObject, type DataSet } from './dicom'
import { applyKeyObjects } from './keyImages'
import { showPresentationState } from './presentation'
import { gridForContours, parseRtStruct, rasterize } from './rtstruct'
import { parseRtPlan } from './rtplan'
import { segInfo, segLabels } from './seg'
import { doseInfo, parseParametricMap, parseRtDose } from './valueGrids'

const OVERLAY_KINDS = new Set(['seg', 'rtstruct', 'rtdose', 'pmap'])
export const isOverlayObject = (series: Series) => OVERLAY_KINDS.has(series.kind)

/** Opens an object from a cell: shows the images it belongs to there, with the object applied. */
export async function openObject(cell: number, object: DisplaySet): Promise<string | null> {
  const dataSet = await readObject(object.series.images[0].file)
  const { studies } = useViewer.getState()
  switch (object.series.kind) {
    case 'seg':
      return showSeg(cell, object, dataSet, studies)
    case 'rtstruct':
      return showStructures(cell, object, dataSet, studies)
    case 'rtdose':
      return showDose(cell, object, dataSet, studies)
    case 'pmap':
      return showMap(cell, object, dataSet, studies)
    case 'ko':
      return applyKeyObjects(cell, object, dataSet, studies)
    case 'pr':
      return showPresentationState(cell, object, dataSet, studies)
    default:
      return null
  }
}

function showOverlay(cell: number, base: DisplaySet, object: DisplaySet, grid: VolumeGrid & { scalars: Float32Array }, options: Parameters<typeof startObjectOverlay>[3]) {
  startObjectOverlay(base, object, grid, options)
  showInCell(cell, base)
  useViewer.setState({ panel: 'fusion' })
  return null
}

const notOpen = () => t('objects.baseNotOpen')

function showSeg(cell: number, object: DisplaySet, dataSet: DataSet, studies: Study[]) {
  const info = segInfo(dataSet)
  const base = findBaseSeries(studies, object.study, { instances: info.referencedInstances, seriesUID: info.referencedSeriesUID, frameOfReferenceUID: info.frameOfReferenceUID })
  const labels = segLabels(dataSet)
  if (!labels) return t('objects.noGeometry')
  if (!base) return notOpen()
  return showOverlay(cell, base, object, labels.grid as VolumeGrid & { scalars: Float32Array }, { mode: 'labels', segments: labels.segments.map((s) => ({ ...s, visible: true })) })
}

function showStructures(cell: number, object: DisplaySet, dataSet: DataSet, studies: Study[]) {
  const set = parseRtStruct(dataSet)
  const instances = set.rois.flatMap((roi) => roi.contours.flatMap((c) => c.sopInstanceUID ?? []))
  const base = findBaseSeries(studies, object.study, { instances, frameOfReferenceUID: set.frameOfReferenceUID })
  if (!base) return notOpen()
  const labels = rasterize(set, gridOfSeries(base.series) ?? gridForContours(set))
  return showOverlay(cell, base, object, labels.grid as VolumeGrid & { scalars: Float32Array }, { mode: 'labels', segments: labels.segments.map((s) => ({ ...s, visible: true })), style: { opacity: 0.25 } })
}

/** Prescription of the plan a dose belongs to, when that plan is open. */
async function prescribedDose(studies: Study[], planUID: string | undefined) {
  for (const study of studies)
    for (const series of study.series) {
      if (series.kind !== 'rtplan' || !series.images.some((image) => image.sopInstanceUID === planUID)) continue
      const plan = parseRtPlan(await readObject(series.images[0].file))
      const dose = plan.prescriptions.find((p) => p.dose)?.dose
      if (dose) return dose
    }
  return null
}

async function showDose(cell: number, object: DisplaySet, dataSet: DataSet, studies: Study[]) {
  const dose = parseRtDose(dataSet)
  if (!dose) return t('objects.noGeometry')
  const base = findBaseSeries(studies, object.study, { frameOfReferenceUID: dataSet.string('x00200052')?.trim() })
  if (!base) return notOpen()
  const reference = (await prescribedDose(studies, doseInfo(dataSet).planUID)) ?? dose.max
  return showOverlay(cell, base, object, dose.grid, {
    mode: 'dose',
    dose: { reference, isodose: true, wash: true },
    style: { colormap: 'jet', opacity: 0.35, lower: reference * 0.1, upper: reference * 1.07, threshold: reference * 0.1 },
  })
}

function showMap(cell: number, object: DisplaySet, dataSet: DataSet, studies: Study[]) {
  const map = parseParametricMap(dataSet)
  if (!map) return t('objects.noGeometry')
  const base = findBaseSeries(studies, object.study, { frameOfReferenceUID: dataSet.string('x00200052')?.trim() })
  if (!base) return notOpen()
  return showOverlay(cell, base, object, map.grid, { mode: 'colormap', style: { colormap: 'jet', opacity: 0.5, lower: Math.max(0, map.min), upper: map.max, threshold: map.max * 0.001 } })
}

/** Runs openObject and reports why it could not be shown. */
export async function openObjectInCell(cell: number, object: DisplaySet) {
  try {
    const problem = await openObject(cell, object)
    if (problem) notify(problem, 'info')
    return problem
  } catch (error) {
    const message = t('objects.failed', { error: error instanceof Error ? error.message : String(error) })
    notify(message, 'error')
    return message
  }
}
