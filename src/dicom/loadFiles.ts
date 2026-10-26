import { cache } from '@cornerstonejs/core'
import { wadouri } from '@cornerstonejs/dicom-image-loader'
import dicomParser from 'dicom-parser'
import { clearImagePlanes, recordImagePlane } from './imagePlaneMetadata'
import type { ImageEntry, Series, Study } from './types'

export interface LoadResult {
  studies: Study[]
  skipped: number
}

const PIXEL_DATA_TAG = 'x7fe00010'

export function parseHeader(buffer: ArrayBuffer) {
  return dicomParser.parseDicom(new Uint8Array(buffer), { untilTag: PIXEL_DATA_TAG })
}

/** Formats a DICOM PN value ("Doe^John") for display. */
export function formatPersonName(value: string | undefined) {
  return (value ?? '').split('^').filter(Boolean).join(' ').trim()
}

/** Formats a DICOM DA value ("20240131") as "2024-01-31". */
export function formatDate(value: string | undefined) {
  if (!value || value.length !== 8) return value ?? ''
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`
}

function sliceLocation(dataSet: dicomParser.DataSet): number | null {
  const position = dataSet.string('x00200032')?.split('\\').map(Number)
  const orientation = dataSet.string('x00200037')?.split('\\').map(Number)
  if (position?.length !== 3 || orientation?.length !== 6) return null

  // Project the image position onto the slice normal (row × column).
  const [rx, ry, rz, cx, cy, cz] = orientation
  const normal = [ry * cz - rz * cy, rz * cx - rx * cz, rx * cy - ry * cx]
  const value = position[0] * normal[0] + position[1] * normal[1] + position[2] * normal[2]
  return Number.isFinite(value) ? value : null
}

const LOCALIZER_DESCRIPTION = /scout|localizer|locator|topogram|surview|scanogram|survey/i

function isLocalizer(dataSet: dicomParser.DataSet, description: string) {
  const imageType = dataSet.string('x00080008') ?? ''
  return imageType.toUpperCase().includes('LOCALIZER') || LOCALIZER_DESCRIPTION.test(description)
}

function compareImages(a: ImageEntry, b: ImageEntry) {
  if (a.instanceNumber !== b.instanceNumber) return a.instanceNumber - b.instanceNumber
  if (a.sliceLocation !== null && b.sliceLocation !== null) return a.sliceLocation - b.sliceLocation
  return 0
}

/**
 * Frees decoded pixels and parsed datasets of previously opened files.
 * The file manager is deliberately not purged: it would restart ids at
 * `dicomfile:0`, which could collide with metadata cached for old files.
 */
export function releaseLoadedImages() {
  cache.purgeCache()
  wadouri.dataSetCacheManager.purge()
  clearImagePlanes()
}

/**
 * Reads DICOM headers locally, registers each file with the Cornerstone file
 * manager and groups the resulting image ids into studies and series.
 * Nothing is uploaded: files are only read in the browser.
 */
export async function loadFiles(
  files: File[],
  onProgress?: (done: number, total: number) => void,
): Promise<LoadResult> {
  const studies = new Map<string, Study>()
  const seriesByUID = new Map<string, Series>()
  let skipped = 0

  for (const [index, file] of files.entries()) {
    onProgress?.(index, files.length)
    try {
      const dataSet = parseHeader(await file.arrayBuffer())
      // Skip DICOMDIR, structured reports and other non-image objects.
      if (!dataSet.uint16('x00280010')) {
        skipped++
        continue
      }

      const studyUID = dataSet.string('x0020000d') ?? 'unknown-study'
      const seriesUID = dataSet.string('x0020000e') ?? `${studyUID}-unknown-series`

      let study = studies.get(studyUID)
      if (!study) {
        study = {
          studyInstanceUID: studyUID,
          patientName: formatPersonName(dataSet.string('x00100010')) || 'Anonymous',
          patientId: dataSet.string('x00100020') ?? '',
          studyDate: formatDate(dataSet.string('x00080020')),
          description: dataSet.string('x00081030') ?? '',
          series: [],
        }
        studies.set(studyUID, study)
      }

      let series = seriesByUID.get(seriesUID)
      if (!series) {
        series = {
          seriesInstanceUID: seriesUID,
          seriesNumber: Number(dataSet.string('x00200011') ?? 0) || 0,
          description: dataSet.string('x0008103e') ?? '',
          modality: dataSet.string('x00080060') ?? '',
          hasOrientation: !!dataSet.string('x00200037'),
          isLocalizer: false,
          images: [],
        }
        series.isLocalizer = isLocalizer(dataSet, series.description)
        seriesByUID.set(seriesUID, series)
        study.series.push(series)
      }

      const baseImageId = wadouri.fileManager.add(file)
      const instanceNumber = Number(dataSet.string('x00200013') ?? 0) || 0
      const location = sliceLocation(dataSet)
      const frames = Number(dataSet.string('x00280008') ?? 1) || 1

      if (frames > 1) {
        for (let frame = 1; frame <= frames; frame++) {
          recordImagePlane(`${baseImageId}?frame=${frame}`, dataSet)
          series.images.push({
            imageId: `${baseImageId}?frame=${frame}`,
            file,
            instanceNumber,
            sliceLocation: location,
          })
        }
      } else {
        recordImagePlane(baseImageId, dataSet)
        series.images.push({ imageId: baseImageId, file, instanceNumber, sliceLocation: location })
      }
    } catch {
      skipped++
    }
  }
  onProgress?.(files.length, files.length)

  for (const study of studies.values()) {
    study.series.sort((a, b) => a.seriesNumber - b.seriesNumber)
    // Array.sort is stable, so frames of one multi-frame file stay in order.
    for (const series of study.series) series.images.sort(compareImages)
  }

  return { studies: [...studies.values()], skipped }
}
