// The local archive's records: searching, CSV, and size limits (pure).

export const STATUSES = ['unread', 'inProgress', 'reviewed', 'urgent', 'signed'] as const
export type StudyStatus = (typeof STATUSES)[number]

export interface ArchivedStudy {
  /** Study Instance UID. */
  id: string
  patientName: string
  patientId: string
  /** YYYY-MM-DD */
  studyDate: string
  description: string
  modalities: string[]
  series: number
  files: number
  bytes: number
  keywords: string[]
  status: StudyStatus
  /** ms since 1970 */
  savedAt: number
}

/** Studies matching every word of a search (patient, ID, description, modality, keywords) and a status. */
export function filterStudies(studies: ArchivedStudy[], query: string, status: StudyStatus | 'all' = 'all') {
  const words = query.toLocaleLowerCase().split(/\s+/).filter(Boolean)
  return studies
    .filter((s) => status === 'all' || s.status === status)
    .filter((s) => {
      const text = [s.patientName, s.patientId, s.description, s.studyDate, ...s.modalities, ...s.keywords].join(' ').toLocaleLowerCase()
      return words.every((word) => text.includes(word))
    })
    .sort((a, b) => b.studyDate.localeCompare(a.studyDate) || b.savedAt - a.savedAt)
}

/** Keywords from user text: comma separated, trimmed, without duplicates. */
export const parseKeywords = (text: string) => [...new Set(text.split(',').map((k) => k.trim()).filter(Boolean))]

const cell = (value: string | number) => {
  const text = String(value)
  const safe = /^[=+@\t\r-]/.test(text) ? `'${text}` : text
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

export function studiesCsv(studies: ArchivedStudy[]) {
  const header = ['Patient', 'Patient ID', 'Study date', 'Description', 'Modalities', 'Series', 'Files', 'Size (MB)', 'Status', 'Keywords', 'Saved']
  const rows = studies.map((s) => [
    s.patientName,
    s.patientId,
    s.studyDate,
    s.description,
    s.modalities.join(' '),
    s.series,
    s.files,
    (s.bytes / 1024 / 1024).toFixed(1),
    s.status,
    s.keywords.join('; '),
    new Date(s.savedAt).toISOString(),
  ])
  return [header, ...rows].map((row) => row.map(cell).join(',')).join('\r\n') + '\r\n'
}

/** Whether a study of `bytes` fits under the limit next to what is stored (replacing an older copy of itself). */
export function fitsLimit(stored: ArchivedStudy[], id: string, bytes: number, limitMb: number) {
  const others = stored.filter((s) => s.id !== id).reduce((sum, s) => sum + s.bytes, 0)
  return others + bytes <= limitMb * 1024 * 1024
}
