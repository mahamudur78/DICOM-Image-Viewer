import type dicomParser from 'dicom-parser'
import { firstItem, number, numbers, text } from './header'

/** Geometry and acquisition details of one image or frame. */
export interface FrameInfo {
  position?: number[]
  orientation?: number[]
  pixelSpacing?: number[]
  sliceThickness?: number
  echoTime?: number
  bValue?: number
  /** Window from the Frame VOI LUT functional group (enhanced objects only). */
  windowCenter?: number
  windowWidth?: number
  /** Rescale from the Pixel Value Transformation functional group (enhanced objects only). */
  rescaleIntercept?: number
  rescaleSlope?: number
}

const SHARED_GROUPS = 'x52009229'
const PER_FRAME_GROUPS = 'x52009230'

/** Reads the frame-level attributes from a functional group item (or a classic header). */
function readGroup(group: dicomParser.DataSet | undefined): FrameInfo {
  if (!group) return {}
  const planePosition = firstItem(group, 'x00209113')
  const planeOrientation = firstItem(group, 'x00209116')
  const pixelMeasures = firstItem(group, 'x00289110')
  const mrEcho = firstItem(group, 'x00189114')
  const mrDiffusion = firstItem(group, 'x00189117')
  const voi = firstItem(group, 'x00289132')
  const rescale = firstItem(group, 'x00289145')
  return clean({
    position: planePosition && numbers(planePosition, 'x00200032'),
    orientation: planeOrientation && numbers(planeOrientation, 'x00200037'),
    pixelSpacing: pixelMeasures && numbers(pixelMeasures, 'x00280030'),
    sliceThickness: pixelMeasures && number(pixelMeasures, 'x00180050'),
    echoTime: mrEcho && number(mrEcho, 'x00189082'),
    bValue: mrDiffusion && number(mrDiffusion, 'x00189087'),
    windowCenter: voi && numbers(voi, 'x00281050')?.[0],
    windowWidth: voi && numbers(voi, 'x00281051')?.[0],
    rescaleIntercept: rescale && number(rescale, 'x00281052'),
    rescaleSlope: rescale && number(rescale, 'x00281053'),
  })
}

const clean = (info: FrameInfo) =>
  Object.fromEntries(Object.entries(info).filter(([, value]) => value !== undefined && !(Array.isArray(value) && !value.length))) as FrameInfo

/** Attributes of a classic (non-enhanced) header. */
function readClassic(dataSet: dicomParser.DataSet): FrameInfo {
  return clean({
    position: numbers(dataSet, 'x00200032'),
    orientation: numbers(dataSet, 'x00200037'),
    pixelSpacing: numbers(dataSet, 'x00280030') ?? numbers(dataSet, 'x00181164'),
    sliceThickness: number(dataSet, 'x00180050'),
    echoTime: number(dataSet, 'x00180081'),
    bValue: number(dataSet, 'x00189087'),
  })
}

/**
 * Per-frame information. Enhanced multi-frame objects (enhanced CT/MR/XA)
 * keep each frame's position in the Per-Frame Functional Groups; values
 * shared by all frames are in the Shared Functional Groups. Classic files
 * repeat the header for every frame.
 */
export function framesOf(dataSet: dicomParser.DataSet, frameCount: number): FrameInfo[] {
  const classic = readClassic(dataSet)
  const shared = readGroup(firstItem(dataSet, SHARED_GROUPS))
  const perFrame = dataSet.elements[PER_FRAME_GROUPS]?.items ?? []
  return Array.from({ length: frameCount }, (_, i) => ({ ...classic, ...shared, ...readGroup(perFrame[i]?.dataSet) }))
}

export const frameOfReference = (dataSet: dicomParser.DataSet) => text(dataSet, 'x00200052')
