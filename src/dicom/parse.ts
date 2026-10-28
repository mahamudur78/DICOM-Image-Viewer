// Pure helpers for DICOM header values. They take plain strings (not
// dicom-parser datasets) so they can be unit tested without any files.
import type { ImageEntry, SortMode } from './types'

/**
 * Formats a DICOM PN value ("Doe^John") for display. Japanese, Chinese and
 * Korean names may add ideographic and phonetic groups after "="; the
 * alphabetic name is shown with the ideographic one in parentheses.
 */
export function formatPersonName(value: string | undefined) {
  const [alphabetic = '', ideographic = ''] = (value ?? '')
    .split('=')
    .map((group) => group.split('^').map((part) => part.trim()).filter(Boolean).join(' '))
  if (alphabetic && ideographic) return `${alphabetic} (${ideographic})`
  return alphabetic || ideographic
}

/** Formats a DICOM DA value ("20240131") as "2024-01-31". */
export function formatDate(value: string | undefined) {
  if (!value || value.length !== 8) return value ?? ''
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`
}

/**
 * Position of a slice along its normal (row × column direction), from the
 * ImagePositionPatient and ImageOrientationPatient values.
 */
export function sliceLocation(position: number[] | undefined, orientation: number[] | undefined): number | null {
  if (position?.length !== 3 || orientation?.length !== 6) return null
  const [rx, ry, rz, cx, cy, cz] = orientation
  const normal = [ry * cz - rz * cy, rz * cx - rx * cz, rx * cy - ry * cx]
  const value = position[0] * normal[0] + position[1] * normal[1] + position[2] * normal[2]
  return Number.isFinite(value) ? value : null
}

const LOCALIZER_DESCRIPTION = /scout|localizer|locator|topogram|surview|scanogram|survey/i

/** Scout / localizer / topogram, from ImageType or the series description. */
export function isLocalizer(imageType: string | undefined, description: string) {
  return (imageType ?? '').toUpperCase().includes('LOCALIZER') || LOCALIZER_DESCRIPTION.test(description)
}

// --- series kind ------------------------------------------------------------------

export type VideoCodec = 'mpeg2' | 'h264' | 'hevc'

/** Transfer syntaxes whose pixel data is a video stream. */
export const VIDEO_TRANSFER_SYNTAXES: Record<string, VideoCodec> = {
  '1.2.840.10008.1.2.4.100': 'mpeg2',
  '1.2.840.10008.1.2.4.100.1': 'mpeg2',
  '1.2.840.10008.1.2.4.101': 'mpeg2',
  '1.2.840.10008.1.2.4.101.1': 'mpeg2',
  '1.2.840.10008.1.2.4.102': 'h264',
  '1.2.840.10008.1.2.4.102.1': 'h264',
  '1.2.840.10008.1.2.4.103': 'h264',
  '1.2.840.10008.1.2.4.103.1': 'h264',
  '1.2.840.10008.1.2.4.104': 'h264',
  '1.2.840.10008.1.2.4.104.1': 'h264',
  '1.2.840.10008.1.2.4.105': 'h264',
  '1.2.840.10008.1.2.4.105.1': 'h264',
  '1.2.840.10008.1.2.4.106': 'h264',
  '1.2.840.10008.1.2.4.106.1': 'h264',
  '1.2.840.10008.1.2.4.107': 'hevc',
  '1.2.840.10008.1.2.4.108': 'hevc',
}

export const SOP_CLASS = {
  encapsulatedPdf: '1.2.840.10008.5.1.4.1.1.104.1',
  mediaStorageDirectory: '1.2.840.10008.1.3.10',
  secondaryCapture: '1.2.840.10008.5.1.4.1.1.7',
}

/** Names of common objects we cannot display yet, for the "skipped files" list. */
const OBJECT_NAMES: Record<string, string> = {
  '1.2.840.10008.5.1.4.1.1.481.3': 'RT Structure Set',
  '1.2.840.10008.5.1.4.1.1.481.5': 'RT Plan',
  '1.2.840.10008.5.1.4.1.1.481.8': 'RT Ion Plan',
  '1.2.840.10008.5.1.4.1.1.11.1': 'Grayscale Presentation State',
  '1.2.840.10008.5.1.4.1.1.88.59': 'Key Object Selection',
  '1.2.840.10008.5.1.4.1.1.9.1.1': '12-lead ECG',
  '1.2.840.10008.5.1.4.1.1.9.1.2': 'General ECG',
  '1.2.840.10008.5.1.4.1.1.9.2.1': 'Hemodynamic Waveform',
  '1.2.840.10008.5.1.4.1.1.9.4.1': 'Basic Voice Audio',
  '1.2.840.10008.5.1.4.1.1.66': 'Raw Data',
}

export const objectName = (sopClassUID: string | undefined) =>
  (sopClassUID && OBJECT_NAMES[sopClassUID]) || sopClassUID || 'unknown'

/**
 * How an object is displayed, or null when it cannot be (yet). Key Object
 * Selection is an SR class but holds no readable report, so it is excluded.
 */
export function seriesKindOf(sopClassUID: string | undefined, transferSyntax: string | undefined, hasRows: boolean) {
  if (transferSyntax && VIDEO_TRANSFER_SYNTAXES[transferSyntax]) return 'video'
  if (sopClassUID === SOP_CLASS.encapsulatedPdf) return 'pdf'
  if (sopClassUID?.startsWith('1.2.840.10008.5.1.4.1.1.88.') && sopClassUID !== '1.2.840.10008.5.1.4.1.1.88.59') {
    return 'sr'
  }
  return hasRows ? 'image' : null
}

// --- timing -------------------------------------------------------------------------

/**
 * Cine frame rate in frames per second, from Frame Time (ms), Cine Rate or
 * Recommended Display Frame Rate, in that order; null when none is usable.
 */
export function frameRateOf(frameTime?: number, cineRate?: number, recommendedRate?: number): number | null {
  if (frameTime && frameTime > 0) return clampRate(1000 / frameTime)
  for (const rate of [cineRate, recommendedRate]) if (rate && rate > 0) return clampRate(rate)
  return null
}

const clampRate = (rate: number) => Math.round(Math.min(120, Math.max(0.5, rate)) * 100) / 100

/** "HHMMSS.ffffff" (also "HH:MM:SS" from old files) as seconds since midnight. */
export function parseDicomTime(value: string | undefined): number | null {
  const match = value?.trim().replace(/:/g, '').match(/^(\d{2})(\d{2})?(\d{2})?(\.\d+)?/)
  if (!match) return null
  const [, h, m = '0', s = '0', fraction = ''] = match
  return Number(h) * 3600 + Number(m) * 60 + Number(s) + (fraction ? Number(fraction) : 0)
}

/** Seconds since 1970 from a DA + TM pair (or a DT value), for ordering acquisitions. */
export function parseDicomDateTime(date: string | undefined, time: string | undefined): number | null {
  const dateMatch = date?.trim().match(/^(\d{4})(\d{2})(\d{2})/)
  const seconds = parseDicomTime(time)
  if (seconds === null) return null
  const day = dateMatch ? Date.UTC(Number(dateMatch[1]), Number(dateMatch[2]) - 1, Number(dateMatch[3])) / 1000 : 0
  return day + seconds
}

// --- sequences within a series --------------------------------------------------------

/**
 * Images with different keys belong to different sequences (e.g. an axial T1
 * and a sagittal T2 stored under one series). Frames of a cine share a key.
 */
export function sequenceKey(parts: {
  orientation?: number[]
  rows?: number
  columns?: number
  echoTime?: number
  bValue?: number
}) {
  const orientation = parts.orientation?.length === 6 ? parts.orientation.map((v) => v.toFixed(2)).join(',') : ''
  return [orientation, `${parts.rows ?? ''}x${parts.columns ?? ''}`, parts.echoTime ?? '', parts.bValue ?? ''].join('|')
}

// --- sorting ---------------------------------------------------------------------------

type SortableImage = Pick<ImageEntry, 'instanceNumber' | 'sliceLocation' | 'acquisitionTime' | 'path' | 'frame'>

const byNullable = (a: number | null, b: number | null) => (a === null || b === null ? 0 : a - b)

const COMPARATORS: Record<SortMode, (a: SortableImage, b: SortableImage) => number> = {
  instance: (a, b) => a.instanceNumber - b.instanceNumber || byNullable(a.sliceLocation, b.sliceLocation),
  position: (a, b) => byNullable(a.sliceLocation, b.sliceLocation) || a.instanceNumber - b.instanceNumber,
  time: (a, b) => byNullable(a.acquisitionTime, b.acquisitionTime) || a.instanceNumber - b.instanceNumber,
  fileName: (a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }),
}

/**
 * Sorted copy of a series' images. Frames of one multi-frame file always stay
 * together and in frame order (the sort is stable and frames compare equal).
 */
export function sortImages<T extends SortableImage>(images: T[], mode: SortMode): T[] {
  const compare = COMPARATORS[mode]
  return [...images].sort((a, b) => compare(a, b) || a.frame - b.frame)
}
