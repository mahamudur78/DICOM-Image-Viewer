import { cache } from '@cornerstonejs/core'
import { wadouri } from '@cornerstonejs/dicom-image-loader'
import type dicomParser from 'dicom-parser'
import type { SourceFile } from './collectFiles'
import { applyDicomdir, referencedFiles } from './dicomdir'
import { isDicomdirPath, sniffFile, type ImageFormat } from './fileType'
import { framesOf, frameOfReference } from './frames'
import { decodedText, number, numbers, readHeader, text } from './header'
import { clearImagePlanes, recordFrameLuts, recordImagePlane } from './imagePlaneMetadata'
import { imageToDicom, newImportStudy } from './imageImport'
import {
  formatDate,
  formatPersonName,
  frameRateOf,
  isLocalizer,
  objectName,
  parseDicomDateTime,
  sequenceKey,
  seriesKindOf,
  sliceLocation,
  sortImages,
  SOP_CLASS,
} from './parse'
import type { ImageEntry, LoadIssue, Series, SeriesKind, Study } from './types'
import { groupByPatient } from './studyTree'
import { extractZip, isZipPath, type AskPassword } from './zip'

export { parseHeader } from './header'

export interface LoadResult {
  studies: Study[]
  issues: LoadIssue[]
}

export interface LoadOptions {
  onProgress?: (done: number, total: number) => void
  askPassword: AskPassword
}

/** Files read at the same time; overlaps disk I/O without flooding memory. */
const CONCURRENCY = 8

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

interface Parsed {
  source: SourceFile
  dataSet: dicomParser.DataSet
}

/** Series being assembled: entries with the key of the sequence they belong to. */
interface SeriesDraft {
  series: Series
  keys: string[]
}

/**
 * Reads files locally (ZIPs, DICOMDIR folders and ordinary images included),
 * registers images with the Cornerstone file manager and groups everything
 * into studies and series. Nothing is uploaded: files are only read in the browser.
 */
export async function loadFiles(inputs: SourceFile[], options: LoadOptions): Promise<LoadResult> {
  const issues: LoadIssue[] = []
  const queue: SourceFile[] = []
  let done = 0
  let total = inputs.length
  const progress = () => options.onProgress?.(done, total)

  // 1. ZIP archives (by name; unnamed ones are found by their bytes below).
  for (const input of inputs) {
    if (!isZipPath(input.path)) {
      queue.push(input)
      continue
    }
    const zip = await extractZip(input, options.askPassword)
    queue.push(...zip.files)
    issues.push(...zip.issues)
    total += zip.files.length - 1
    progress()
  }

  // 2. A DICOMDIR limits its folder to the files it references.
  const dicomdirs = queue.filter((f) => isDicomdirPath(f.path))
  let files = queue.filter((f) => !isDicomdirPath(f.path))
  for (const dicomdir of dicomdirs) {
    try {
      const references = referencedFiles(await readHeader(dicomdir.file))
      const applied = applyDicomdir(dicomdir.path, references, files)
      if (files.length === 0) issues.push({ path: dicomdir.path, reason: 'dicomdirOnly' })
      else issues.push(...applied.issues)
      files = applied.kept
    } catch {
      issues.push({ path: dicomdir.path, reason: 'corrupt' })
    }
  }
  total = files.length

  // 3. Headers, a few files at a time. Ordinary images wait until we know
  // whether the selection holds DICOM (see below).
  const parsed: Parsed[] = []
  const images: { source: SourceFile; format: ImageFormat }[] = []
  const pending = [...files]

  const readOne = async (source: SourceFile) => {
    try {
      const type = await sniffFile(source.file)
      if (type.type === 'image') return void images.push({ source, format: type.format })
      if (type.type === 'zip') {
        const zip = await extractZip(source, options.askPassword)
        issues.push(...zip.issues)
        pending.push(...zip.files)
        total += zip.files.length
        return
      }
      parsed.push({ source, dataSet: await readHeader(source.file) })
    } catch {
      issues.push({ path: source.path, reason: (await sniffFile(source.file)).type === 'dicom' ? 'corrupt' : 'notDicom' })
    }
  }

  const runPool = async () => {
    const worker = async () => {
      for (let source = pending.shift(); source; source = pending.shift()) {
        await readOne(source)
        done++
        progress()
      }
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, worker))
  }
  progress()
  await runPool()

  // 4. Images picked on their own are always imported; images inside folders
  // only when there is no DICOM (CD folders often hold viewer icons).
  const importable = parsed.length === 0 ? images : images.filter(({ source }) => !source.path.includes('/'))
  if (importable.length) {
    const study = newImportStudy()
    for (const [index, { source, format }] of importable.entries()) {
      try {
        pending.push(...(await imageToDicom(source, format, study, index + 1)))
      } catch {
        issues.push({ path: source.path, reason: 'imageFailed' })
      }
    }
    total += pending.length
    await runPool()
  }

  return { studies: buildStudies(parsed, issues), issues }
}

// --- grouping ---------------------------------------------------------------------

function buildStudies(parsed: Parsed[], issues: LoadIssue[]): Study[] {
  const studies = new Map<string, Study>()
  const drafts = new Map<string, SeriesDraft>()
  const seen = new Set<string>()

  for (const { source, dataSet } of parsed) {
    const sopClassUID = text(dataSet, 'x00080016') ?? text(dataSet, 'x00020002')
    const sopInstanceUID = text(dataSet, 'x00080018')
    if (sopClassUID === SOP_CLASS.mediaStorageDirectory) continue // a DICOMDIR in a ZIP or under another name

    const kind = seriesKindOf(sopClassUID, text(dataSet, 'x00020010'), !!dataSet.uint16('x00280010'))
    if (!kind) {
      // Random binary files can parse as a raw dataset; without any identity they are not DICOM.
      const isDicom = sopClassUID || text(dataSet, 'x0020000d')
      issues.push(
        isDicom
          ? { path: source.path, reason: 'unsupportedObject', detail: objectName(sopClassUID) }
          : { path: source.path, reason: 'notDicom' },
      )
      continue
    }
    if (sopInstanceUID) {
      if (seen.has(sopInstanceUID)) {
        issues.push({ path: source.path, reason: 'duplicate' })
        continue
      }
      seen.add(sopInstanceUID)
    }

    const charset = dataSet.string('x00080005')
    const studyUID = text(dataSet, 'x0020000d') ?? 'unknown-study'
    let study = studies.get(studyUID)
    if (!study) {
      study = {
        studyInstanceUID: studyUID,
        patientName: formatPersonName(decodedText(dataSet, 'x00100010', charset)),
        patientId: decodedText(dataSet, 'x00100020', charset) ?? '',
        studyDate: formatDate(text(dataSet, 'x00080020')),
        description: decodedText(dataSet, 'x00081030', charset) ?? '',
        series: [],
      }
      studies.set(studyUID, study)
    }

    const seriesUID = text(dataSet, 'x0020000e') ?? `${studyUID}-unknown-series`
    // Reports, PDFs and videos of one series are listed separately from its images.
    const draftKey = kind === 'image' ? seriesUID : `${seriesUID}|${kind}|${sopInstanceUID ?? source.path}`
    let draft = drafts.get(draftKey)
    if (!draft) {
      const description = decodedText(dataSet, 'x0008103e', charset) ?? ''
      draft = {
        series: {
          id: draftKey,
          seriesInstanceUID: seriesUID,
          seriesNumber: number(dataSet, 'x00200011') ?? 0,
          description: kind === 'image' ? description : description || documentTitle(dataSet, kind, charset),
          modality: text(dataSet, 'x00080060') ?? '',
          kind,
          hasOrientation: !!dataSet.string('x00200037') || !!dataSet.elements.x52009229,
          isLocalizer: isLocalizer(dataSet.string('x00080008'), description),
          frameRate: frameRateOf(number(dataSet, 'x00181063'), number(dataSet, 'x00180040'), number(dataSet, 'x00082144')),
          frameTimeVector: numbers(dataSet, 'x00181065') ?? null,
          sortMode: 'instance',
          images: [],
        },
        keys: [],
      }
      drafts.set(draftKey, draft)
      study.series.push(draft.series)
    }
    addEntries(draft, source, dataSet, kind)
  }

  for (const study of studies.values()) {
    study.series = study.series.flatMap((series) => splitSequences(drafts.get(series.id)!))
    study.series.sort((a, b) => a.seriesNumber - b.seriesNumber)
  }
  // The same order as the sidebar: by patient, newest study first.
  return groupByPatient([...studies.values()]).flatMap((patient) => patient.studies)
}

/** Title shown for a report, PDF or video series without a description. */
function documentTitle(dataSet: dicomParser.DataSet, kind: SeriesKind, charset: string | undefined) {
  if (kind === 'pdf') return decodedText(dataSet, 'x00420010', charset) ?? 'PDF'
  if (kind === 'sr') {
    const concept = dataSet.elements.x0040a043?.items?.[0]?.dataSet
    return (concept && decodedText(concept, 'x00080104', charset)) ?? 'Report'
  }
  return 'Video'
}

function addEntries(draft: SeriesDraft, source: SourceFile, dataSet: dicomParser.DataSet, kind: SeriesKind) {
  const instanceNumber = number(dataSet, 'x00200013') ?? 0
  const acquisitionTime =
    parseDicomDateTime(text(dataSet, 'x00080022'), text(dataSet, 'x00080032')) ??
    parseDicomDateTime(text(dataSet, 'x00080023'), text(dataSet, 'x00080033'))
  const base = { file: source.file, path: source.path, instanceNumber, acquisitionTime, sopInstanceUID: text(dataSet, 'x00080018') ?? '' }

  if (kind !== 'image') {
    draft.series.images.push({ ...base, imageId: '', sliceLocation: null, frame: 0 })
    draft.keys.push('')
    return
  }

  const baseImageId = wadouri.fileManager.add(source.file)
  const rows = dataSet.uint16('x00280010') ?? 0
  const columns = dataSet.uint16('x00280011') ?? 0
  const frameCount = Math.max(1, number(dataSet, 'x00280008') ?? 1)
  const frameOfReferenceUID = frameOfReference(dataSet)

  framesOf(dataSet, frameCount).forEach((frame, i) => {
    const imageId = frameCount > 1 ? `${baseImageId}?frame=${i + 1}` : baseImageId
    recordImagePlane(imageId, { ...frame, rows, columns, frameOfReferenceUID })
    recordFrameLuts(imageId, frame)
    draft.series.images.push({
      ...base,
      imageId,
      sliceLocation: sliceLocation(frame.position, frame.orientation),
      frame: frameCount > 1 ? i + 1 : 0,
    })
    draft.keys.push(sequenceKey({ ...frame, rows, columns }))
  })
}

/**
 * Splits a series that holds several sequences (different orientation, size,
 * echo time or b-value) into one display set each, numbered "(1/2)", "(2/2)".
 */
function splitSequences({ series, keys }: SeriesDraft): Series[] {
  const groups = new Map<string, ImageEntry[]>()
  series.images.forEach((image, i) => {
    const group = groups.get(keys[i]) ?? []
    group.push(image)
    groups.set(keys[i], group)
  })
  if (groups.size <= 1) return [{ ...series, images: sortImages(series.images, series.sortMode) }]

  const parts = [...groups.values()]
    .map((images) => sortImages(images, series.sortMode))
    .sort((a, b) => a[0].instanceNumber - b[0].instanceNumber)
  return parts.map((images, i) => ({
    ...series,
    id: `${series.id}#${i + 1}`,
    description: `${series.description || series.modality} (${i + 1}/${parts.length})`,
    isLocalizer: series.isLocalizer,
    images,
  }))
}
