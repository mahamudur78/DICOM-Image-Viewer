import type { DisplaySet, Study } from './types'

/**
 * Orders series for the initial grid: localizers (scouts) first so reference
 * lines show up on them, then the remaining series in study/series order.
 */
export function hangingOrder(studies: Study[]): DisplaySet[] {
  const displaySets = studies.flatMap((study) => study.series.map((series) => ({ study, series })))
  return [
    ...displaySets.filter(({ series }) => series.isLocalizer),
    ...displaySets.filter(({ series }) => !series.isLocalizer),
  ]
}
