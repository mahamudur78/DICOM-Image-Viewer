// The image series an object belongs to, and grids with a series' geometry.
import { getImagePlane } from '../dicom/imagePlaneMetadata'
import type { DisplaySet, Series, Study } from '../dicom/types'
import { gridForFrames } from './labels'

export const imageSeries = (study: Study) => study.series.filter((s) => s.kind === 'image' && s.images.length > 0)

const frameOfReference = (series: Series) => getImagePlane(series.images[0]?.imageId)?.frameOfReferenceUID

/**
 * The image series an object belongs to: the one holding its referenced
 * images, then its referenced series, then the largest one in its frame of reference.
 */
export function findBaseSeries(studies: Study[], study: Study, hints: { instances?: string[]; seriesUID?: string; frameOfReferenceUID?: string }): DisplaySet | null {
  const candidates = [study, ...studies.filter((s) => s !== study && s.patientId === study.patientId)]
  const instances = new Set(hints.instances ?? [])
  for (const s of candidates) {
    const series = imageSeries(s).find((x) => x.images.some((image) => instances.has(image.sopInstanceUID)))
    if (series) return { study: s, series }
  }
  for (const s of candidates) {
    const series = imageSeries(s).find((x) => hints.seriesUID && x.seriesInstanceUID === hints.seriesUID)
    if (series) return { study: s, series }
  }
  for (const s of candidates) {
    const series = imageSeries(s)
      .filter((x) => hints.frameOfReferenceUID && frameOfReference(x) === hints.frameOfReferenceUID)
      .sort((a, b) => b.images.length - a.images.length)[0]
    if (series) return { study: s, series }
  }
  return null
}

/** A grid with the geometry of a series' images (for rasterizing structures on it). */
export function gridOfSeries(series: Series) {
  const planes = series.images.map((image) => getImagePlane(image.imageId)).filter((p) => p !== undefined)
  const first = planes[0]
  if (!first) return null
  return gridForFrames(
    { orientation: [...first.rowCosines, ...first.columnCosines], pixelSpacing: [first.rowPixelSpacing, first.columnPixelSpacing], rows: first.rows, columns: first.columns },
    planes.map((p) => p.imagePositionPatient),
  )
}

