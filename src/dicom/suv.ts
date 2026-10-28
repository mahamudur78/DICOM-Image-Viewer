import { calculateSUVScalingFactors, type InstanceMetadata } from '@cornerstonejs/calculate-suv'
import type dicomParser from 'dicom-parser'
import { firstItem, number, numbers, text } from './header'

export interface SuvFactors {
  suvbw: number
  suvlbm?: number
  suvbsa?: number
}

/** The header fields SUV needs (PS3.3 C.8.9.1 and the radiopharmaceutical sequence). */
export function petInstanceMetadata(dataSet: dicomParser.DataSet): InstanceMetadata {
  const radiopharmaceutical = firstItem(dataSet, 'x00540016')
  const metadata: InstanceMetadata = {
    CorrectedImage: (text(dataSet, 'x00280051') ?? '').split('\\'),
    Units: text(dataSet, 'x00541001') ?? '',
    RadionuclideHalfLife: (radiopharmaceutical && number(radiopharmaceutical, 'x00181075')) ?? NaN,
    RadionuclideTotalDose: (radiopharmaceutical && number(radiopharmaceutical, 'x00181074')) ?? NaN,
    DecayCorrection: text(dataSet, 'x00541102') ?? '',
    PatientWeight: number(dataSet, 'x00101030') ?? NaN,
    SeriesDate: text(dataSet, 'x00080021') ?? '',
    SeriesTime: text(dataSet, 'x00080031') ?? '',
    AcquisitionDate: text(dataSet, 'x00080022') ?? '',
    AcquisitionTime: text(dataSet, 'x00080032') ?? '',
  }
  const startTime = radiopharmaceutical && text(radiopharmaceutical, 'x00181072')
  const startDateTime = radiopharmaceutical && text(radiopharmaceutical, 'x00181078')
  if (startTime) metadata.RadiopharmaceuticalStartTime = startTime
  if (startDateTime) metadata.RadiopharmaceuticalStartDateTime = startDateTime
  const size = number(dataSet, 'x00101020')
  if (size) metadata.PatientSize = size
  const sex = text(dataSet, 'x00100040')
  if (sex) metadata.PatientSex = sex
  const frameReference = number(dataSet, 'x00541300')
  if (frameReference !== undefined) metadata.FrameReferenceTime = frameReference
  const duration = number(dataSet, 'x00181242')
  if (duration !== undefined) metadata.ActualFrameDuration = duration
  // Philips stores its own SUV factor in a private group.
  const philips = numbers(dataSet, 'x70531000')?.[0]
  if (philips) metadata.PhilipsPETPrivateGroup = { SUVScaleFactor: philips, ActivityConcentrationScaleFactor: undefined }
  return metadata
}

/**
 * SUV factors for the images of one PET series, or the reason they cannot
 * be computed (e.g. no patient weight or injected dose).
 */
export function suvFactors(instances: InstanceMetadata[]): { factors: SuvFactors[] } | { error: string } {
  try {
    const factors = calculateSUVScalingFactors(instances)
    if (factors.some((f) => !Number.isFinite(f.suvbw) || f.suvbw <= 0)) return { error: 'invalid factor' }
    return { factors }
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) }
  }
}
