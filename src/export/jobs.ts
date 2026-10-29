// Jobs on the original files: saving them, and saving anonymized copies.
import type { DisplaySet, Series, Study } from '../dicom/types'
import { redactionPixelBoxes } from '../measurements/manage'
import { selectCurrentDisplaySet, useViewer } from '../store/viewerStore'
import type { AnonymizeOptions, Change } from './anonymize'
import { filesOf } from './convert'
import { anonymizeFile } from './dicomEdit'
import type { PixelBox } from './dicomValues'
import type { Progress } from './exportImages'
import { safeName, saveFiles, stamp, type OutputFile } from './files'

export type FileScope = 'image' | 'series' | 'study' | 'all'

interface ScopedFile {
  file: File
  imageIds: string[]
  folder: string
}

const folderOf = (study: Study, series: Series) =>
  `${safeName(`${study.studyDate}_${study.description || study.studyInstanceUID.slice(-8)}`)}/${safeName(`${series.seriesNumber}_${series.description || series.modality}`)}`

/** The files a scope covers, each once, with the image ids of its frames. */
export function filesInScope(scope: FileScope, displaySet: DisplaySet | null | undefined = selectCurrentDisplaySet(useViewer.getState()), index = 0): ScopedFile[] {
  const { studies } = useViewer.getState()
  const series: { study: Study; series: Series }[] =
    scope === 'all'
      ? studies.flatMap((study) => study.series.map((s) => ({ study, series: s })))
      : scope === 'study' && displaySet
        ? displaySet.study.series.map((s) => ({ study: displaySet.study, series: s }))
        : displaySet
          ? [displaySet]
          : []
  const out: ScopedFile[] = []
  const seen = new Set<File>()
  for (const { study, series: s } of series) {
    for (const [file, imageIds] of filesOf(s)) {
      if (seen.has(file)) continue
      seen.add(file)
      out.push({ file, imageIds, folder: folderOf(study, s) })
    }
  }
  if (scope === 'image' && displaySet) {
    const file = displaySet.series.images[index]?.file
    return out.filter((f) => f.file === file)
  }
  return out
}

const dicomName = (file: File) => (/\.dcm$/i.test(file.name) ? file.name : `${file.name}.dcm`)

/** The original DICOM files, in study/series folders inside a ZIP. */
export async function exportOriginals(scope: Exclude<FileScope, 'image'>, onProgress: (p: Progress) => void) {
  const files = filesInScope(scope)
  const out: OutputFile[] = files.map(({ file, folder }) => ({ name: files.length > 1 ? `${folder}/${dicomName(file)}` : dicomName(file), data: file }))
  onProgress({ done: files.length, total: files.length })
  await saveFiles(out, `dicom-${stamp()}.zip`)
  return out.length
}

export interface AnonymizeReport {
  files: number
  /** Changes by file name, for the report. */
  changes: { file: string; changes: Change[] }[]
  redactedFiles: number
}

const frameOf = (imageId: string) => Number(/[?&]frame=(\d+)/.exec(imageId)?.[1] ?? 1) - 1

/** Anonymized copies (with a report.csv) in a ZIP; redaction boxes are burned into the pixels. */
export async function anonymizeFiles(scope: FileScope, index: number, options: AnonymizeOptions, onProgress: (p: Progress) => void, signal?: AbortSignal): Promise<AnonymizeReport> {
  const files = filesInScope(scope, undefined, index)
  const uidMap = new Map<string, string>()
  const out: OutputFile[] = []
  const report: AnonymizeReport = { files: 0, changes: [], redactedFiles: 0 }
  for (const [i, { file, imageIds }] of files.entries()) {
    if (signal?.aborted) break
    const boxes: PixelBox[] = imageIds.flatMap((imageId) => redactionPixelBoxes(imageId).map((box) => ({ ...box, frame: frameOf(imageId) })))
    const result = await anonymizeFile(file, options, uidMap, imageIds, boxes)
    const name = `anonymized/${String(i + 1).padStart(4, '0')}.dcm`
    out.push({ name, data: result.data })
    report.changes.push({ file: name, changes: result.changes })
    if (result.changes.some((c) => c.tag === '7FE00010')) report.redactedFiles++
    report.files++
    onProgress({ done: i + 1, total: files.length })
  }
  if (signal?.aborted) return report
  // What changed, file by file (old values are not written: they may identify the patient).
  const lines = ['File,Tag,Action,New value', ...report.changes.flatMap(({ file, changes }) => changes.map((c) => [file, c.tag, c.action, c.after.replace(/[",\n]/g, ' ')].join(',')))]
  out.push({ name: 'anonymized/report.csv', data: new Blob([lines.join('\r\n') + '\r\n'], { type: 'text/csv' }) })
  await saveFiles(out, `anonymized-${stamp()}.zip`)
  return report
}
