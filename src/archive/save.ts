// Saving open studies into the archive and opening archived ones.
import type { SourceFile } from '../dicom/collectFiles'
import type { Study } from '../dicom/types'
import { t } from '../i18n'
import { notify } from '../notifications/toastStore'
import { useSettings } from '../store/settingsStore'
import { selectCurrentDisplaySet, useViewer } from '../store/viewerStore'
import { fitsLimit, type ArchivedStudy } from './archive'
import { listStudies, saveStudy } from './db'

/** The files of a study (each once), with the paths they were opened from. */
export function studyFiles(study: Study): SourceFile[] {
  const seen = new Set<File>()
  const files: SourceFile[] = []
  for (const series of study.series)
    for (const image of series.images) {
      if (seen.has(image.file)) continue
      seen.add(image.file)
      files.push({ file: image.file, path: image.path })
    }
  return files
}

/** Saves the study in view (or the first open one); returns whether it was saved. */
export async function saveCurrentStudy(study = selectCurrentDisplaySet(useViewer.getState())?.study ?? useViewer.getState().studies[0]) {
  if (!study) return false
  const files = studyFiles(study)
  const bytes = files.reduce((sum, f) => sum + f.file.size, 0)
  const stored = await listStudies()
  const limit = useSettings.getState().archiveLimitMb
  if (!fitsLimit(stored, study.studyInstanceUID, bytes, limit)) {
    notify(t('archive.full', { limit }), 'error')
    return false
  }
  const previous = stored.find((s) => s.id === study.studyInstanceUID)
  const record: ArchivedStudy = {
    id: study.studyInstanceUID,
    patientName: study.patientName,
    patientId: study.patientId,
    studyDate: study.studyDate,
    description: study.description,
    modalities: [...new Set(study.series.map((s) => s.modality).filter(Boolean))],
    series: study.series.length,
    files: files.length,
    bytes,
    keywords: previous?.keywords ?? [],
    status: previous?.status ?? 'unread',
    savedAt: Date.now(),
  }
  await saveStudy(record, files)
  notify(t('archive.saved', { name: study.patientName || study.description || t('viewport.anonymous') }), 'success')
  return true
}
