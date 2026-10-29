export interface WindowPreset {
  /** i18n key */
  label: string
  width: number
  center: number
}

/** Common CT window presets (Hounsfield units). */
export const CT_PRESETS: WindowPreset[] = [
  { label: 'presets.softTissue', width: 400, center: 40 },
  { label: 'presets.lung', width: 1500, center: -600 },
  { label: 'presets.bone', width: 1800, center: 400 },
  { label: 'presets.brain', width: 80, center: 40 },
  { label: 'presets.abdomen', width: 350, center: 50 },
  { label: 'presets.liver', width: 150, center: 30 },
]

/**
 * Index of the preset matching a window, or -1. Allows ±1 because a DICOM
 * window of 400/40 is stored as the range -160..239 (width 399).
 */
export function findPresetIndex(presets: WindowPreset[], window: { width: number; center: number }) {
  return presets.findIndex((p) => Math.abs(p.width - window.width) <= 1 && Math.abs(p.center - window.center) <= 1)
}

/** A window stored in the image header (Window Center/Width, with its explanation). */
export interface HeaderWindow {
  width: number
  center: number
  explanation?: string
}

/** One entry of the window dropdown, in the order it is listed (and numbered for keys 1–9). */
export interface WindowOption {
  id: string
  /** i18n key (`labelKey`) or the label itself (header explanation, user preset name). */
  label: string
  labelKey: boolean
  width: number
  center: number
  source: 'header' | 'builtin' | 'user'
}

/**
 * Windows offered for an image: those in its header first (as the modality
 * intends), then built-in presets for the modality, then the user's own.
 */
export function windowOptions(
  modality: string,
  headerWindows: HeaderWindow[],
  userPresets: { id: string; label: string; width: number; center: number; modality: string }[],
): WindowOption[] {
  const header = headerWindows
    .filter((w) => w.width > 0)
    .map((w, i) => ({
      id: `header-${i}`,
      label: w.explanation || 'window.header',
      labelKey: !w.explanation,
      width: w.width,
      center: w.center,
      source: 'header' as const,
    }))
  const builtin = (modality === 'CT' ? CT_PRESETS : []).map((p) => ({
    id: p.label,
    label: p.label,
    labelKey: true,
    width: p.width,
    center: p.center,
    source: 'builtin' as const,
  }))
  const user = userPresets
    .filter((p) => p.modality === modality)
    .map((p) => ({ id: p.id, label: p.label, labelKey: false, width: p.width, center: p.center, source: 'user' as const }))
  return [...header, ...builtin, ...user]
}

/**
 * Window covering the given percentiles of the image's values (default
 * 1–99 %), which ignores a few extreme pixels such as metal or air.
 * Large images are sampled.
 */
export function percentileWindow(pixels: ArrayLike<number>, low = 0.01, high = 0.99, slope = 1, intercept = 0) {
  const step = Math.max(1, Math.floor(pixels.length / 200_000))
  const values: number[] = []
  for (let i = 0; i < pixels.length; i += step) values.push(pixels[i] * slope + intercept)
  if (values.length === 0) return null
  values.sort((a, b) => a - b)
  const lower = values[Math.floor(low * (values.length - 1))]
  const upper = values[Math.ceil(high * (values.length - 1))]
  const width = Math.max(1, upper - lower)
  return { width, center: lower + width / 2 }
}

/** Window spanning the image's full range of values. */
export function fullRangeWindow(min: number, max: number) {
  const width = Math.max(1, max - min)
  return { width, center: min + width / 2 }
}

/**
 * Window covering the values inside an image rectangle (inclusive pixel
 * coordinates, in any corner order), clipped to the image.
 */
export function regionWindow(
  pixels: ArrayLike<number>,
  columns: number,
  rows: number,
  [x0, y0]: [number, number],
  [x1, y1]: [number, number],
  slope = 1,
  intercept = 0,
) {
  const left = Math.max(0, Math.round(Math.min(x0, x1)))
  const right = Math.min(columns - 1, Math.round(Math.max(x0, x1)))
  const top = Math.max(0, Math.round(Math.min(y0, y1)))
  const bottom = Math.min(rows - 1, Math.round(Math.max(y0, y1)))
  if (left > right || top > bottom) return null
  let min = Infinity
  let max = -Infinity
  for (let y = top; y <= bottom; y++) {
    for (let x = left; x <= right; x++) {
      const value = pixels[y * columns + x] * slope + intercept
      if (value < min) min = value
      if (value > max) max = value
    }
  }
  return fullRangeWindow(min, max)
}
