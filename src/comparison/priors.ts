// Studies of the same patient over time, and matching a series to its
// counterpart in another study (for side-by-side comparison).
import { sortImages } from '../dicom/parse'
import { groupByPatient } from '../dicom/studyTree'
import type { DisplaySet, Series, Study } from '../dicom/types'

const patientKey = (study: Study) => study.patientId || study.patientName || 'unknown'

/** The patient's other studies, newest first, that are older than (or dated like) this one. */
export function priorStudies(studies: Study[], current: Study): Study[] {
  const group = groupByPatient(studies).find((g) => g.key === patientKey(current))
  if (!group) return []
  return group.studies.filter((s) => s !== current && s.studyInstanceUID !== current.studyInstanceUID && s.studyDate <= current.studyDate)
}

const words = (text: string) =>
  text
    .toLocaleLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)

/**
 * How well a series matches another: the same modality is required; the same
 * plane, shared description words and a similar number of images add points.
 */
export function seriesSimilarity(a: Series, b: Series) {
  if (a.kind !== 'image' || b.kind !== 'image' || a.modality !== b.modality) return -1
  let score = 0
  if (a.plane && a.plane === b.plane) score += 2
  const aw = new Set(words(a.description))
  const bw = words(b.description)
  if (aw.size && bw.length) score += (3 * bw.filter((w) => aw.has(w)).length) / Math.max(aw.size, bw.length)
  if (a.isLocalizer === b.isLocalizer) score += 1
  const counts = [a.images.length, b.images.length]
  if (Math.min(...counts) / Math.max(...counts, 1) > 0.5) score += 0.5
  return score
}

/** The series of the most recent prior study that best matches a series, or null. */
export function findPriorMatch(studies: Study[], current: DisplaySet): DisplaySet | null {
  for (const study of priorStudies(studies, current.study)) {
    let best: { series: Series; score: number } | null = null
    for (const series of study.series) {
      const score = seriesSimilarity(current.series, series)
      if (score >= 0 && (!best || score > best.score)) best = { series, score }
    }
    if (best) return { study, series: best.series }
  }
  return null
}

/**
 * Adds newly loaded studies to the open ones. Series of a study that is
 * already open are added to it (the same series gets its new images).
 */
export function mergeStudies(open: Study[], added: Study[]): Study[] {
  const merged = open.map((study) => ({ ...study, series: [...study.series] }))
  for (const study of added) {
    const existing = merged.find((s) => s.studyInstanceUID === study.studyInstanceUID)
    if (!existing) {
      merged.push(study)
      continue
    }
    for (const series of study.series) {
      const index = existing.series.findIndex((s) => s.id === series.id)
      if (index < 0) existing.series.push(series)
      else {
        const old = existing.series[index]
        existing.series[index] = { ...old, images: sortImages([...old.images, ...series.images], old.sortMode) }
      }
    }
    existing.series.sort((a, b) => a.seriesNumber - b.seriesNumber)
  }
  return groupByPatient(merged).flatMap((patient) => patient.studies)
}
