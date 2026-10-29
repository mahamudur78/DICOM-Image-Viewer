// Dynamic series in the app's terms: phases of a series, and a series per phase.
import type { Series } from '../dicom/types'
import { splitPhases, type Phases } from './phases'

const cache = new WeakMap<Series, Phases | null>()

/** The phases of a dynamic series, or null (cached per series object). */
export function phasesOf(series: Series | undefined | null): Phases | null {
  if (!series || series.kind !== 'image' || series.images.length < 2) return null
  if (!cache.has(series)) cache.set(series, splitPhases(series.images))
  return cache.get(series)!
}

const phaseSeriesCache = new WeakMap<Series, Series[]>()

/** One series per phase (each a stack, or a volume for MPR and 3D). */
export function phaseSeries(series: Series): Series[] {
  const cached = phaseSeriesCache.get(series)
  if (cached) return cached
  const phases = phasesOf(series)
  if (!phases) return []
  const list = phases.byPhase.map((indexes, i) => ({
    ...series,
    id: `${series.id}#t${i + 1}`,
    description: `${series.description || series.modality} (t${i + 1})`,
    images: indexes.map((index) => series.images[index]),
  }))
  phaseSeriesCache.set(series, list)
  return list
}
