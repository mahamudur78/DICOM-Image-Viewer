// Transfer functions of volume rendering: which values are how opaque and
// what colour. Cornerstone's presets store them as strings of numbers
// ("count v a v a …" and "count v r g b …"); the editor works on points.

export interface OpacityPoint {
  value: number
  opacity: number
}

export interface ColorPoint {
  value: number
  /** 0–1 */
  r: number
  g: number
  b: number
}

export interface TransferFunction {
  opacity: OpacityPoint[]
  colors: ColorPoint[]
}

export interface Lighting {
  shade: boolean
  ambient: number
  diffuse: number
  specular: number
  specularPower: number
}

/** The numbers of a preset string, without its leading count. */
const numbers = (text: string) => text.trim().split(/\s+/).map(Number).slice(1)

export function parsePreset(preset: { scalarOpacity: string; colorTransfer: string }): TransferFunction {
  const o = numbers(preset.scalarOpacity)
  const c = numbers(preset.colorTransfer)
  const opacity: OpacityPoint[] = []
  for (let i = 0; i + 1 < o.length; i += 2) opacity.push({ value: o[i], opacity: o[i + 1] })
  const colors: ColorPoint[] = []
  for (let i = 0; i + 3 < c.length; i += 4) colors.push({ value: c[i], r: c[i + 1], g: c[i + 2], b: c[i + 3] })
  return { opacity: sortByValue(opacity), colors: sortByValue(colors) }
}

export function toPresetStrings(tf: TransferFunction) {
  const opacity = sortByValue(tf.opacity).flatMap((p) => [p.value, p.opacity])
  const colors = sortByValue(tf.colors).flatMap((p) => [p.value, p.r, p.g, p.b])
  return { scalarOpacity: [opacity.length, ...opacity].join(' '), colorTransfer: [colors.length, ...colors].join(' ') }
}

export const sortByValue = <T extends { value: number }>(points: T[]) => [...points].sort((a, b) => a.value - b.value)

/** Piecewise-linear opacity at a value (constant beyond the first and last points). */
export function opacityAt(tf: TransferFunction, value: number) {
  const points = sortByValue(tf.opacity)
  if (points.length === 0) return 0
  if (value <= points[0].value) return points[0].opacity
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    if (value <= b.value) return b.value === a.value ? b.opacity : a.opacity + ((value - a.value) / (b.value - a.value)) * (b.opacity - a.opacity)
  }
  return points[points.length - 1].opacity
}

/** The lowest value from which the volume is visible (opacity above a threshold), for picking surfaces. */
export function visibleFrom(tf: TransferFunction, threshold = 0.05) {
  const points = sortByValue(tf.opacity)
  for (let i = 0; i < points.length; i++) {
    if (points[i].opacity < threshold) continue
    if (i === 0) return points[0].value
    const a = points[i - 1]
    const b = points[i]
    return a.value + ((threshold - a.opacity) / (b.opacity - a.opacity)) * (b.value - a.value)
  }
  return Infinity
}

/** Moves every point by a value offset (the preset "shift"). */
export const shiftFunction = (tf: TransferFunction, offset: number): TransferFunction => ({
  opacity: tf.opacity.map((p) => ({ ...p, value: p.value + offset })),
  colors: tf.colors.map((p) => ({ ...p, value: p.value + offset })),
})

/** Air transparent, tissue walls opaque: the inside of airways and bowel for virtual endoscopy. */
export const ENDOSCOPY_FUNCTION: TransferFunction = {
  opacity: [
    { value: -1024, opacity: 0 },
    { value: -600, opacity: 0 },
    { value: -400, opacity: 1 },
    { value: 3071, opacity: 1 },
  ],
  colors: [
    { value: -1024, r: 0.9, g: 0.55, b: 0.45 },
    { value: -400, r: 0.95, g: 0.65, b: 0.55 },
    { value: 200, r: 1, g: 0.9, b: 0.8 },
    { value: 3071, r: 1, g: 1, b: 1 },
  ],
}
