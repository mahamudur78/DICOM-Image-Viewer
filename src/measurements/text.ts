// Text shown next to measurements on the image and in the panel.
import { metaData } from '@cornerstonejs/core'
import { annotation as csAnnotation } from '@cornerstonejs/tools'
import type { Annotation } from '@cornerstonejs/tools/types'
import { t } from '../i18n'
import { getScaling } from '../dicom/imagePlaneMetadata'
import { useSettings } from '../store/settingsStore'
import { formatArea, formatLength, formatVolume, round } from './geometry'
import { groupResult, type GroupResult } from './groups'
import { measureData, type CalibrationSource, type MeasurementResult } from './measure'

/** Short tag after values whose spacing is not the image's own Pixel Spacing. */
const SOURCE_TAGS: Partial<Record<CalibrationSource, string>> = {
  ermf: 'measure.tagErmf',
  imager: 'measure.tagImager',
  user: 'measure.tagUser',
  us: 'measure.tagUs',
}

/** Unit of pixel values: HU for CT, SUV for PET scaled by the loader. */
export function valueUnit(imageId: string | undefined) {
  if (!imageId) return ''
  const modality = (metaData.get('generalSeriesModule', imageId) as { modality?: string } | undefined)?.modality
  if (modality === 'CT') return 'HU'
  if (modality === 'PT') return getScaling(imageId) ? 'SUV' : ''
  return ''
}

const value = (v: number, unit: string) => `${round(v)}${unit ? ` ${unit}` : ''}`

/** One line per value of a measurement result. */
export function resultLines(result: MeasurementResult, imageId: string | undefined, detailed = false): string[] {
  const unit = useSettings.getState().measureUnit
  const tag = SOURCE_TAGS[result.source] ? ` (${t(SOURCE_TAGS[result.source]!)})` : ''
  const length = (mm: number) => formatLength(mm, result.base, unit) + tag
  const pixelUnit = valueUnit(imageId)
  const lines: string[] = []
  if (result.length !== undefined) lines.push(length(result.length))
  if (result.angle !== undefined) lines.push(`${round(result.angle)}°`)
  if (result.longAxis !== undefined) lines.push(t('measure.longAxis', { value: length(result.longAxis) }))
  if (result.shortAxis !== undefined) lines.push(t('measure.shortAxis', { value: length(result.shortAxis) }))
  if (result.area !== undefined) lines.push(t('measure.area', { value: formatArea(result.area, result.base, unit) + tag }))
  if (detailed && result.perimeter !== undefined) lines.push(t('measure.perimeter', { value: length(result.perimeter) }))
  if (result.value !== undefined) lines.push(value(result.value, pixelUnit))
  const stats = result.stats
  if (stats) {
    lines.push(t('measure.mean', { mean: round(stats.mean), sd: round(stats.stdDev), unit: pixelUnit }).trim())
    lines.push(t('measure.minMax', { min: round(stats.min), max: round(stats.max) }))
    if (detailed && Number.isFinite(stats.median)) lines.push(t('measure.median', { value: value(stats.median, pixelUnit) }))
    if (detailed && stats.count) lines.push(t('measure.pixels', { count: stats.count }))
  }
  if (result.peak !== undefined && Number.isFinite(result.peak)) lines.push(t('measure.peak', { value: value(result.peak, pixelUnit) }))
  const sphere = result.sphere
  if (sphere) {
    const where = t(sphere.threeD ? 'measure.sphere3d' : 'measure.sphere2d')
    lines.push(t('measure.sphereMax', { value: value(sphere.max, pixelUnit), where }))
    lines.push(t('measure.sphereMean', { value: value(sphere.mean, pixelUnit) }))
    if (Number.isFinite(sphere.peak)) lines.push(t('measure.spherePeak', { value: value(sphere.peak, pixelUnit) }))
    if (sphere.threeD) lines.push(t('measure.volume', { value: formatVolume(sphere.volume * 1000, 'mm', unit) }))
  }
  return lines
}

export function groupLines(group: GroupResult): string[] {
  const unit = useSettings.getState().measureUnit
  const position = t('measure.groupPosition', { index: group.index + 1, size: group.size })
  if (group.ratio !== undefined) return [position, t('measure.ratio', { value: round(group.ratio) })]
  if (group.volume !== undefined) return [position, t('measure.volume', { value: formatVolume(group.volume, group.base!, unit) })]
  return [position]
}

const labelOf = (data: object) => (data as { label?: string }).label

/** The annotation that owns some data (tools only pass the data to text callbacks). */
const ownerOf = (data: object) => csAnnotation.state.getAllAnnotations().find((a) => a.data === data)

/**
 * A `getTextLines` configuration for a measurement tool. Rectangle and
 * circle ROIs pass a list of targets, the other tools a single one.
 */
export function textLinesFor(toolName: string) {
  return (data: object, targets: string | string[]) => {
    const targetId = Array.isArray(targets) ? targets[0] : targets
    const label = labelOf(data)
    const result = targetId ? measureData(toolName, data, targetId) : null
    const imageId = targetId?.startsWith('imageId:') ? targetId.slice('imageId:'.length) : undefined
    const lines = [...(label ? [label] : []), ...(result ? resultLines(result, imageId) : [])]
    const owner = ownerOf(data)
    const group = owner && groupResult(owner)
    // Only the last member shows the group's value, so it appears once.
    if (group && group.index === group.size - 1) lines.push(...groupLines(group).slice(1))
    else if (group) lines.push(groupLines(group)[0])
    return lines
  }
}

/** Panel text of an annotation: its values and, for groups, the group's value. */
export function annotationLines(annotation: Annotation, result: MeasurementResult | null) {
  const imageId = (annotation.metadata as { referencedImageId?: string }).referencedImageId
  const group = groupResult(annotation)
  return [...(result ? resultLines(result, imageId, true) : []), ...(group ? groupLines(group) : [])]
}
