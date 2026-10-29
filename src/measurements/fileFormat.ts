// Measurement files (JSON) and CSV export. Measurements are matched to images
// by SOP Instance UID and frame, so a file reopens on the same study later.

export const FILE_FORMAT = 'dicomlens-measurements'
export const FILE_VERSION = 1

export type Vec3 = [number, number, number]

export interface StoredMeasurement {
  toolName: string
  sopInstanceUID: string
  /** 1-based frame of a multi-frame image, 0 for single-frame images. */
  frame: number
  color?: string
  hidden?: boolean
  data: {
    points: Vec3[]
    polyline?: Vec3[]
    closed?: boolean
    splineType?: string
    label?: string
    groupId?: string
    groupIndex?: number
  }
  viewPlaneNormal?: Vec3
  viewUp?: Vec3
}

export function toMeasurementFile(measurements: StoredMeasurement[]) {
  return JSON.stringify({ format: FILE_FORMAT, version: FILE_VERSION, measurements }, null, 2)
}

const isVec3 = (value: unknown): value is Vec3 => Array.isArray(value) && value.length === 3 && value.every(Number.isFinite)
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null
const optional = <T>(value: unknown, check: (v: unknown) => v is T) => (check(value) ? value : undefined)
const isString = (v: unknown): v is string => typeof v === 'string'
const isNumber = (v: unknown): v is number => Number.isFinite(v)

/** Parses a measurement file; throws when it is not one. Malformed entries are skipped. */
export function parseMeasurementFile(text: string): StoredMeasurement[] {
  const file: unknown = JSON.parse(text)
  if (!isObject(file) || file.format !== FILE_FORMAT || !Array.isArray(file.measurements)) throw new Error('Not a measurement file')
  if (typeof file.version !== 'number' || file.version > FILE_VERSION) throw new Error('Unsupported measurement file version')
  return file.measurements.flatMap((entry): StoredMeasurement[] => {
    if (!isObject(entry) || !isString(entry.toolName) || !isString(entry.sopInstanceUID) || !isObject(entry.data)) return []
    const data = entry.data
    if (!Array.isArray(data.points) || !data.points.every(isVec3)) return []
    if (data.polyline !== undefined && !(Array.isArray(data.polyline) && data.polyline.every(isVec3))) return []
    return [
      {
        toolName: entry.toolName,
        sopInstanceUID: entry.sopInstanceUID,
        frame: isNumber(entry.frame) ? entry.frame : 0,
        color: optional(entry.color, isString),
        hidden: entry.hidden === true || undefined,
        data: {
          points: data.points,
          polyline: data.polyline as Vec3[] | undefined,
          closed: typeof data.closed === 'boolean' ? data.closed : undefined,
          splineType: optional(data.splineType, isString),
          label: optional(data.label, isString),
          groupId: optional(data.groupId, isString),
          groupIndex: optional(data.groupIndex, isNumber),
        },
        viewPlaneNormal: optional(entry.viewPlaneNormal, isVec3),
        viewUp: optional(entry.viewUp, isVec3),
      },
    ]
  })
}

/**
 * CSV (RFC 4180). Cells that a spreadsheet would run as a formula get a
 * leading apostrophe; negative numbers ("-35 HU") are left alone.
 */
export function toCsv(rows: (string | number)[][]) {
  const cell = (value: string | number) => {
    let text = String(value)
    if (/^[=+@\t\r]/.test(text) || /^-[^\d.]/.test(text)) text = `'${text}`
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
  }
  return rows.map((row) => row.map(cell).join(',')).join('\r\n') + '\r\n'
}
