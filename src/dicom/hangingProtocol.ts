import type { DisplaySet, Study } from './types'

/**
 * Orders series for the initial grid: localizers (scouts) first so reference
 * lines show up on them, then images, then videos, reports and PDFs, each
 * in study/series order.
 */
export function hangingOrder(studies: Study[]): DisplaySet[] {
  const displaySets = studies.flatMap((study) => study.series.map((series) => ({ study, series })))
  const images = displaySets.filter(({ series }) => series.kind === 'image')
  return [
    ...images.filter(({ series }) => series.isLocalizer),
    ...images.filter(({ series }) => !series.isLocalizer),
    ...displaySets.filter(({ series }) => series.kind !== 'image'),
  ]
}
