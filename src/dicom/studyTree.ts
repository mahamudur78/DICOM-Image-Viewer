import type { Series, Study } from './types'

export interface PatientGroup {
  key: string
  name: string
  id: string
  studies: Study[]
}

/** Groups studies by patient (ID, else name); newest study first within a patient. */
export function groupByPatient(studies: Study[]): PatientGroup[] {
  const groups = new Map<string, PatientGroup>()
  for (const study of studies) {
    const key = study.patientId || study.patientName || 'unknown'
    let group = groups.get(key)
    if (!group) {
      group = { key, name: study.patientName, id: study.patientId, studies: [] }
      groups.set(key, group)
    }
    group.studies.push(study)
  }
  for (const group of groups.values()) group.studies.sort((a, b) => b.studyDate.localeCompare(a.studyDate))
  return [...groups.values()]
}

const normalize = (text: string) => text.toLocaleLowerCase().normalize('NFKD')

/**
 * Studies matching a search. A query that matches the patient or the study
 * keeps the whole study; otherwise only matching series are kept. Every word
 * must match somewhere ("ct chest" finds a CT series in a chest study).
 */
export function filterStudies(studies: Study[], query: string): Study[] {
  const words = normalize(query).split(/\s+/).filter(Boolean)
  if (words.length === 0) return studies
  const matches = (...texts: string[]) => {
    const haystack = normalize(texts.join(' '))
    return words.every((word) => haystack.includes(word))
  }
  return studies.flatMap((study) => {
    const studyText = [study.patientName, study.patientId, study.description, study.studyDate]
    if (matches(...studyText)) return [study]
    const series = study.series.filter((s: Series) => matches(...studyText, s.description, s.modality, String(s.seriesNumber)))
    return series.length ? [{ ...study, series }] : []
  })
}
