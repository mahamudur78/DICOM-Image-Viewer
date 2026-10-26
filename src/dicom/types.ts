export interface ImageEntry {
  imageId: string
  file: File
  instanceNumber: number
  /** Position along the slice normal, used as a fallback sort key. */
  sliceLocation: number | null
}

export interface Series {
  seriesInstanceUID: string
  seriesNumber: number
  description: string
  modality: string
  /** True when ImageOrientationPatient is present, so R/L/A/P labels are meaningful. */
  hasOrientation: boolean
  /** Scout / localizer / topogram, shown first by the hanging protocol. */
  isLocalizer: boolean
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
  patientName: string
  patientId: string
  studyDate: string
  description: string
  series: Series[]
}
