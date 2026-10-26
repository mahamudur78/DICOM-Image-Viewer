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
  images: ImageEntry[]
}

export interface Study {
  studyInstanceUID: string
  patientName: string
  patientId: string
  studyDate: string
  description: string
  series: Series[]
}
