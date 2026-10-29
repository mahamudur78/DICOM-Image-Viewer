// Key images: marked by the user or read from Key Object Selection documents;
// a cell can show only the key images of its series.
import { create } from 'zustand'
import type { DisplaySet, ImageEntry, Series, Study } from '../dicom/types'
import { t } from '../i18n'
import { showInCell, useViewer } from '../store/viewerStore'
import { findBaseSeries } from './base'
import type { DataSet } from './dicom'
import { readKeyObjects } from './keyObjects'

/** "sop|frame", or "sop|*" for every frame of an image. */
export const useKeyImages = create<{ keys: Record<string, true> }>()(() => ({ keys: {} }))

export const KEY_SUFFIX = '#key'

export const isKeyImage = (image: ImageEntry, keys = useKeyImages.getState().keys) => !!(keys[`${image.sopInstanceUID}|${image.frame}`] || keys[`${image.sopInstanceUID}|*`])

export function toggleKeyImage(image: ImageEntry) {
  const keys = { ...useKeyImages.getState().keys }
  if (isKeyImage(image, keys)) {
    delete keys[`${image.sopInstanceUID}|${image.frame}`]
    delete keys[`${image.sopInstanceUID}|*`]
  } else keys[`${image.sopInstanceUID}|${image.frame}`] = true
  useKeyImages.setState({ keys })
}

export function addKeys(refs: { sopInstanceUID: string; frames?: number[] }[]) {
  const keys = { ...useKeyImages.getState().keys }
  for (const ref of refs) for (const frame of ref.frames?.length ? ref.frames : ['*']) keys[`${ref.sopInstanceUID}|${frame}`] = true
  useKeyImages.setState({ keys })
}

/** The series without its key-image filter. */
export const originalId = (series: Series) => (series.id.endsWith(KEY_SUFFIX) ? series.id.slice(0, -KEY_SUFFIX.length) : series.id)

/** The key images of a series as a series of their own (null without any). */
export function keyOnlySeries(series: Series): Series | null {
  const keys = useKeyImages.getState().keys
  const images = series.images.filter((image) => isKeyImage(image, keys))
  if (!images.length) return null
  return { ...series, id: `${series.id}${KEY_SUFFIX}`, description: `${series.description} ★`, images }
}

/** Switches a cell between all images of its series and only the key ones. */
export function toggleKeyFilter(cell: number) {
  const { cells, studies } = useViewer.getState()
  const current = cells[cell]
  if (!current) return false
  if (current.series.id.endsWith(KEY_SUFFIX)) {
    const original = studies.flatMap((s) => s.series).find((s) => s.id === originalId(current.series))
    if (original) showInCell(cell, { study: current.study, series: original })
    return true
  }
  const filtered = keyOnlySeries(current.series)
  if (!filtered) return false
  showInCell(cell, { study: current.study, series: filtered })
  return true
}

/** Reads a KO document: its images become key images, shown alone in the cell. */
export function applyKeyObjects(cell: number, object: DisplaySet, dataSet: DataSet, studies: Study[]) {
  const ko = readKeyObjects(dataSet)
  addKeys(ko.images)
  const base = findBaseSeries(studies, object.study, { instances: ko.images.map((i) => i.sopInstanceUID) })
  if (!base) return t('objects.baseNotOpen')
  const filtered = keyOnlySeries(base.series)
  showInCell(cell, { study: base.study, series: filtered ?? base.series })
  return null
}
