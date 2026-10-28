// Pure helpers for DICOM header values. They take plain strings (not
// dicom-parser datasets) so they can be unit tested without any files.
import type { ImageEntry } from './types'

/** Formats a DICOM PN value ("Doe^John") for display. */
export function formatPersonName(value: string | undefined) {
  return (value ?? '').split('^').filter(Boolean).join(' ').trim()
}

/** Formats a DICOM DA value ("20240131") as "2024-01-31". */
export function formatDate(value: string | undefined) {
  if (!value || value.length !== 8) return value ?? ''
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`
}

const parseNumbers = (value: string | undefined) => value?.split('\\').map(Number)

/**
 * Position of a slice along its normal (row × column direction), from the
 * ImagePositionPatient and ImageOrientationPatient values.
 */
export function sliceLocation(position: string | undefined, orientation: string | undefined): number | null {
  const p = parseNumbers(position)
  const o = parseNumbers(orientation)
  if (p?.length !== 3 || o?.length !== 6) return null

  const [rx, ry, rz, cx, cy, cz] = o
  const normal = [ry * cz - rz * cy, rz * cx - rx * cz, rx * cy - ry * cx]
  const value = p[0] * normal[0] + p[1] * normal[1] + p[2] * normal[2]
  return Number.isFinite(value) ? value : null
}

const LOCALIZER_DESCRIPTION = /scout|localizer|locator|topogram|surview|scanogram|survey/i

/** Scout / localizer / topogram, from ImageType or the series description. */
export function isLocalizer(imageType: string | undefined, description: string) {
  return (imageType ?? '').toUpperCase().includes('LOCALIZER') || LOCALIZER_DESCRIPTION.test(description)
}

/** Sorts by instance number, then by position along the slice normal. */
export function compareImages(a: Pick<ImageEntry, 'instanceNumber' | 'sliceLocation'>, b: typeof a) {
  if (a.instanceNumber !== b.instanceNumber) return a.instanceNumber - b.instanceNumber
  if (a.sliceLocation !== null && b.sliceLocation !== null) return a.sliceLocation - b.sliceLocation
  return 0
}
