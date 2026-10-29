// Values of measurement annotations, computed from their world points and the
// image they were drawn on. Every tool's on-image text and the measurement
// panel come from here, so both always agree and honour calibration and units.
import { Enums, cache, metaData, type Types } from '@cornerstonejs/core'
import type { Annotation } from '@cornerstonejs/tools/types'
import { spacingSource, type SpacingSource } from '../dicom/imagePlaneMetadata'
import {
  angleAt,
  angleBetweenLines,
  ellipsePolygon,
  perpendicular,
  pixelsInPolygon,
  polygonArea,
  polylineLength,
  statistics,
  distance,
  type Point,
  type Statistics,
} from './geometry'

/** What a measurement's spacing is based on; "user" and "us" override the image's own. */
export type CalibrationSource = SpacingSource | 'user' | 'us'

export interface MeasurementResult {
  /** "mm" when lengths are physical, "px" otherwise. */
  base: string
  source: CalibrationSource
  length?: number
  perimeter?: number
  area?: number
  angle?: number
  longAxis?: number
  shortAxis?: number
  /** Probe value, or nothing outside the image. */
  value?: number
  stats?: Statistics
  /** Pixel values inside the ROI, for the histogram. */
  values?: Float64Array
}

export interface ImageGeometry {
  rows: number
  columns: number
  origin: number[]
  row: number[]
  column: number[]
  /** World spacing between columns and rows. */
  spacingX: number
  spacingY: number
}

export function imageGeometry(imageId: string): ImageGeometry | null {
  const plane = metaData.get('imagePlaneModule', imageId) as
    | { rows: number; columns: number; imagePositionPatient?: number[]; rowCosines?: number[]; columnCosines?: number[]; rowPixelSpacing?: number; columnPixelSpacing?: number }
    | undefined
  if (!plane?.imagePositionPatient || !plane.rowCosines || !plane.columnCosines) return null
  return {
    rows: plane.rows,
    columns: plane.columns,
    origin: plane.imagePositionPatient,
    row: plane.rowCosines,
    column: plane.columnCosines,
    spacingX: plane.columnPixelSpacing || 1,
    spacingY: plane.rowPixelSpacing || 1,
  }
}

/** Image (column, row) of a world point. */
export function toIndex(g: ImageGeometry, world: Types.Point3): Point {
  const d = [world[0] - g.origin[0], world[1] - g.origin[1], world[2] - g.origin[2]]
  const along = (v: number[]) => d[0] * v[0] + d[1] * v[1] + d[2] * v[2]
  return [along(g.row) / g.spacingX, along(g.column) / g.spacingY]
}

// --- calibration ------------------------------------------------------------------

/** User calibration: physical size factor per image, applied on top of its own spacing. */
const userFactors = new Map<string, number>()
let calibrationVersion = 0

export function setUserCalibration(imageIds: string[], factor: number | null) {
  for (const imageId of imageIds) {
    if (factor) userFactors.set(imageId, factor)
    else userFactors.delete(imageId)
  }
  calibrationVersion++
}

export const hasUserCalibration = (imageId: string) => userFactors.has(imageId)

interface UltrasoundRegion {
  regionLocationMinX0: number
  regionLocationMinY0: number
  regionLocationMaxX1: number
  regionLocationMaxY1: number
  physicalUnitsXDirection: number
  physicalUnitsYDirection: number
  physicalDeltaX: number
  physicalDeltaY: number
}

const CM = 3

/** The ultrasound region (in cm) holding every point, if the image has one. */
function ultrasoundRegion(imageId: string, points: Point[]) {
  const module = metaData.get(Enums.MetadataModules.CALIBRATION, imageId) as { sequenceOfUltrasoundRegions?: UltrasoundRegion[] } | undefined
  return module?.sequenceOfUltrasoundRegions?.find(
    (r) =>
      r.physicalUnitsXDirection === CM &&
      r.physicalUnitsYDirection === CM &&
      r.physicalDeltaX !== 0 &&
      points.every(([x, y]) => x >= r.regionLocationMinX0 && x <= r.regionLocationMaxX1 && y >= r.regionLocationMinY0 && y <= r.regionLocationMaxY1),
  )
}

interface Scale {
  /** Physical size of one pixel along x and y. */
  sx: number
  sy: number
  base: string
  source: CalibrationSource
}

function scaleFor(imageId: string, g: ImageGeometry, indexPoints: Point[]): Scale {
  const factor = userFactors.get(imageId)
  const source = spacingSource(imageId)
  const physical = source !== 'none'
  const sx = physical ? g.spacingX : 1
  const sy = physical ? g.spacingY : 1
  if (factor) return { sx: sx * factor, sy: sy * factor, base: 'mm', source: 'user' }
  const region = indexPoints.length > 0 ? ultrasoundRegion(imageId, indexPoints) : undefined
  if (region) return { sx: Math.abs(region.physicalDeltaX) * 10, sy: Math.abs(region.physicalDeltaY) * 10, base: 'mm', source: 'us' }
  return { sx, sy, base: physical ? 'mm' : 'px', source }
}

// --- pixel values --------------------------------------------------------------

/** Display values of a loaded grayscale image (rescaled HU, SUV for scaled PET), or null. */
function pixelValues(imageId: string) {
  const image = cache.getImage(imageId) as (Types.IImage & { preScale?: { scaled?: boolean } }) | undefined
  if (!image) return null
  const pixels = image.getPixelData()
  if (pixels.length !== image.rows * image.columns) return null
  const scaled = image.preScale?.scaled
  const slope = scaled ? 1 : (image.slope ?? 1)
  const intercept = scaled ? 0 : (image.intercept ?? 0)
  return (index: number) => pixels[index] * slope + intercept
}

function regionStats(imageId: string, g: ImageGeometry, polygon: Point[], scale: Scale) {
  const value = pixelValues(imageId)
  if (!value) return {}
  const inside = pixelsInPolygon(polygon, g.columns, g.rows, scale.sx, scale.sy)
  const values = Float64Array.from(inside, value)
  return { stats: statistics(values) ?? undefined, values }
}

// --- per tool --------------------------------------------------------------------

export const toolNameOf = (annotation: Annotation) => annotation.metadata?.toolName ?? ''

export const pointsOf = (annotation: Annotation) => (annotation.data.handles?.points ?? []) as Types.Point3[]

/** Which shape an annotation's handles describe. */
export type MeasurementShape =
  | 'length'
  | 'angle'
  | 'cobb'
  | 'bidirectional'
  | 'ellipse'
  | 'circle'
  | 'rectangle'
  | 'contour'
  | 'probe'
  | 'deviation'
  | 'text'
  | 'none'

const SHAPES = new Map<string, MeasurementShape>()

export function registerShape(toolName: string, shape: MeasurementShape) {
  SHAPES.set(toolName, shape)
}

export const shapeOf = (toolName: string) => SHAPES.get(toolName) ?? 'none'

interface AnnotationData {
  handles?: { points?: Types.Point3[] }
  contour?: { polyline?: Types.Point3[]; closed?: boolean }
  cachedStats?: Record<string, Record<string, unknown>>
}

/** Measures in the plane of the image; null when the image's geometry is unknown. */
function measureOnImage(shape: MeasurementShape, data: AnnotationData, imageId: string): MeasurementResult | null {
  const g = imageGeometry(imageId)
  if (!g) return null
  const handles = (data.handles?.points ?? []).map((p) => toIndex(g, p))
  const contour = (data.contour?.polyline ?? []).map((p) => toIndex(g, p))
  const scale = scaleFor(imageId, g, shape === 'contour' ? contour : handles)
  const physical = (points: Point[]) => points.map(([x, y]): Point => [x * scale.sx, y * scale.sy])
  const p = physical(handles)
  const result: MeasurementResult = { base: scale.base, source: scale.source }

  switch (shape) {
    case 'length':
      if (p.length >= 2) result.length = distance(p[0], p[1])
      break
    case 'angle':
      if (p.length >= 3) result.angle = angleAt(p[0], p[1], p[2])
      break
    case 'cobb':
      if (p.length >= 4) result.angle = angleBetweenLines(p[0], p[1], p[2], p[3])
      break
    case 'deviation':
      if (p.length >= 3) result.length = perpendicular(p[0], p[1], p[2]).distance
      break
    case 'bidirectional':
      if (p.length >= 4) {
        result.longAxis = distance(p[0], p[1])
        result.shortAxis = distance(p[2], p[3])
      }
      break
    case 'probe': {
      const value = pixelValues(imageId)
      const [x, y] = handles[0]?.map(Math.round) ?? [-1, -1]
      if (value && x >= 0 && y >= 0 && x < g.columns && y < g.rows) result.value = value(y * g.columns + x)
      break
    }
    case 'ellipse':
    case 'circle':
    case 'rectangle':
    case 'contour': {
      const outline = outlineOf(shape, p, physical(contour), data.contour?.closed !== false)
      if (!outline) break
      if (!outline.closed) {
        result.length = polylineLength(outline.points)
        break
      }
      result.area = shape === 'ellipse' || shape === 'circle' ? ellipseArea(shape, p) : polygonArea(outline.points)
      result.perimeter = polylineLength(outline.points, true)
      Object.assign(result, regionStats(imageId, g, outline.points, scale))
      break
    }
  }
  return result
}

/** The outline of an area tool in physical coordinates. */
function outlineOf(shape: MeasurementShape, p: Point[], contour: Point[], closed: boolean) {
  if (shape === 'contour') return contour.length >= 2 ? { points: contour, closed: closed && contour.length >= 3 } : null
  if (shape === 'rectangle' && p.length >= 4) return { points: [p[0], p[1], p[3], p[2]], closed: true }
  if (shape === 'circle' && p.length >= 2) {
    const r = distance(p[0], p[1])
    return { points: ellipsePolygon(p[0], [r, 0], [0, r]), closed: true }
  }
  if (shape === 'ellipse' && p.length >= 4) {
    // Handles: bottom, top, left, right.
    const center: Point = [(p[0][0] + p[1][0]) / 2, (p[0][1] + p[1][1]) / 2]
    const a: Point = [(p[1][0] - p[0][0]) / 2, (p[1][1] - p[0][1]) / 2]
    const b: Point = [(p[3][0] - p[2][0]) / 2, (p[3][1] - p[2][1]) / 2]
    return { points: ellipsePolygon(center, a, b), closed: true }
  }
  return null
}

/** Exact area of an ellipse or circle (the polygon is only used for its pixels). */
function ellipseArea(shape: MeasurementShape, p: Point[]) {
  if (shape === 'circle') return Math.PI * distance(p[0], p[1]) ** 2
  return (Math.PI * distance(p[0], p[1]) * distance(p[2], p[3])) / 4
}

/**
 * MPR annotations live on a volume slice, not an image: their world
 * coordinates are already in mm. Lengths and angles are measured directly;
 * area statistics come from Cornerstone's own calculation.
 */
function measureInWorld(shape: MeasurementShape, data: AnnotationData, targetId: string): MeasurementResult {
  const world = data.handles?.points ?? []
  const result: MeasurementResult = { base: 'mm', source: 'pixel' }
  // Distances and angles are unchanged by projecting onto the (shared) view plane.
  const d = (a: Types.Point3, b: Types.Point3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
  const angle3 = (a: Types.Point3, b: Types.Point3, c: Types.Point3) => {
    const u = [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
    const v = [c[0] - b[0], c[1] - b[1], c[2] - b[2]]
    const cos = (u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) / (Math.hypot(...u) * Math.hypot(...v))
    return (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI
  }
  if (shape === 'length' && world.length >= 2) result.length = d(world[0], world[1])
  if (shape === 'angle' && world.length >= 3) result.angle = angle3(world[0], world[1], world[2])
  if (shape === 'bidirectional' && world.length >= 4) {
    result.longAxis = d(world[0], world[1])
    result.shortAxis = d(world[2], world[3])
  }
  const cached = data.cachedStats?.[targetId] as { area?: number; mean?: number; stdDev?: number; max?: number; min?: number; length?: number } | undefined
  if (cached) {
    if (cached.area !== undefined) result.area = cached.area
    if (shape === 'contour' && cached.length !== undefined) result.length = cached.length
    if (cached.mean !== undefined) {
      result.stats = { count: 0, mean: cached.mean, median: NaN, min: cached.min ?? NaN, max: cached.max ?? NaN, stdDev: cached.stdDev ?? NaN }
    }
  }
  return result
}

// Results are cached per annotation data until its points, image or calibration change.
const resultCache = new WeakMap<object, { key: string; result: MeasurementResult | null }>()

/** Measures annotation data as seen on a target ("imageId:…" or "volumeId:…"). */
export function measureData(toolName: string, annotationData: object, targetId: string): MeasurementResult | null {
  const data = annotationData as AnnotationData
  const shape = shapeOf(toolName)
  if (shape === 'none' || shape === 'text') return null
  // Pixel statistics appear once the image is loaded.
  const loaded = targetId.startsWith('imageId:') && cache.getImage(targetId.slice('imageId:'.length)) !== undefined
  const key = `${targetId}|${loaded}|${calibrationVersion}|${JSON.stringify(data.handles?.points)}|${JSON.stringify(data.contour?.polyline)}|${data.contour?.closed}`
  const cached = resultCache.get(data)
  if (cached?.key === key) return cached.result
  const result = targetId.startsWith('imageId:') ? measureOnImage(shape, data, targetId.slice('imageId:'.length)) : measureInWorld(shape, data, targetId)
  resultCache.set(data, { key, result })
  return result
}

/** Measures an annotation on the image it was drawn on (or its volume slice). */
export function measureAnnotation(annotation: Annotation): MeasurementResult | null {
  const { referencedImageId, volumeId, toolName } = (annotation.metadata ?? {}) as { referencedImageId?: string; volumeId?: string; toolName: string }
  const targetId = referencedImageId ? `imageId:${referencedImageId}` : `volumeId:${volumeId ?? ''}`
  if (!referencedImageId) {
    const cachedTarget = Object.keys((annotation.data as AnnotationData).cachedStats ?? {})[0]
    return measureData(toolName, annotation.data, cachedTarget ?? targetId)
  }
  return measureData(toolName, annotation.data, targetId)
}
