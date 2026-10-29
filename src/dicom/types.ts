import type { PlaneName } from '../comparison/planes'

export interface ImageEntry {
  /** Cornerstone image id; empty for non-image series (video, pdf, sr). */
  imageId: string
  file: File
  /** Path the file came from (folder- or ZIP-relative), used for sorting and DICOMDIR. */
  path: string
  instanceNumber: number
  /** Position along the slice normal, used as a fallback sort key. */
  sliceLocation: number | null
  /** Acquisition (or content) time in seconds since midnight, or null. */
  acquisitionTime: number | null
  /** 1-based frame number within a multi-frame file, or 0 for single-frame files. */
  frame: number
  /** SOP Instance UID of the file, used to find images that reports and key objects refer to. */
  sopInstanceUID: string
  /** SOP Class UID, for references written in reports, key objects and presentation states. */
  sopClassUID?: string
  /** Temporal Position Identifier (0020,0100) of dynamic series. */
  temporalPosition?: number
  /** Trigger Time (0018,1060), ms. */
  triggerTime?: number
}

/** How a series is displayed. */
export type SeriesKind = 'image' | 'video' | 'pdf' | 'sr' | ObjectKind

/** Non-image objects shown by their own viewers or applied to images (phase 8). */
export type ObjectKind = 'ko' | 'pr' | 'seg' | 'rtstruct' | 'rtdose' | 'rtplan' | 'pmap' | 'waveform' | 'sm'

export type SortMode = 'instance' | 'position' | 'time' | 'fileName'

export interface Series {
  /** Unique key. Equals the Series Instance UID unless the series was split into sequences. */
  id: string
  seriesInstanceUID: string
  seriesNumber: number
  description: string
  modality: string
  kind: SeriesKind
  /** True when ImageOrientationPatient is present, so R/L/A/P labels are meaningful. */
  hasOrientation: boolean
  /** Scout / localizer / topogram, shown first by the hanging protocol. */
  isLocalizer: boolean
  /** Made by an algorithm (AI / CAD), shown with a badge. */
  ai?: boolean
  /** Image Laterality (R/L) and View Position (CC, MLO, …), for mammography hanging. */
  laterality?: string
  viewPosition?: string
  /** Anatomical plane of the (first) image, for matching series across studies. */
  plane?: PlaneName
  /** Body Part Examined (0018,0015), upper case, or empty. */
  bodyPart?: string
  /** Cine frame rate from the DICOM header (frames per second), or null. */
  frameRate: number | null
  /** Per-frame display durations in ms (Frame Time Vector), or null. */
  frameTimeVector: number[] | null
  sortMode: SortMode
  /** PET: why values could not be converted to SUV (shown in their stored unit instead). */
  suvError?: string
  images: ImageEntry[]
}

/** A series together with the study it belongs to, as shown in a viewport. */
export interface DisplaySet {
  study: Study
  series: Series
}

/** Drag-and-drop MIME type used to drag a series thumbnail onto a viewport. */
export const SERIES_DRAG_TYPE = 'application/x-dicom-series'

export interface Study {
  studyInstanceUID: string
  /** Empty when the file has no name; shown as "Anonymous" (translated). */
  patientName: string
  patientId: string
  studyDate: string
  description: string
  series: Series[]
}

/** Why a file could not be shown. Each reason has an i18n key `issues.<reason>`. */
export type IssueReason =
  | 'notDicom'
  | 'corrupt'
  | 'unsupportedObject'
  | 'wrongPassword'
  | 'zipFailed'
  | 'zipLimit'
  | 'imageFailed'
  | 'missingFromDicomdir'
  | 'dicomdirOnly'
  | 'duplicate'

export interface LoadIssue {
  path: string
  reason: IssueReason
  /** Extra detail, e.g. the SOP class of an unsupported object. */
  detail?: string
}
