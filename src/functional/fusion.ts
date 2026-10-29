// Fusion overlays: an overlay volume drawn in colour over another image,
// through a manual registration (translation and rotation).
import { add, sub, type Vec3 } from '../volume/grid'

export const FUSION_COLORMAPS = ['hot', 'pet', 'jet', 'rainbow', 'cool', 'gray'] as const
export type FusionColormap = (typeof FUSION_COLORMAPS)[number]

type Stop = [number, number, number, number]

const STOPS: Record<FusionColormap, Stop[]> = {
  hot: [
    [0, 0, 0, 0],
    [0.4, 230, 0, 0],
    [0.8, 255, 210, 0],
    [1, 255, 255, 255],
  ],
  pet: [
    [0, 0, 0, 0],
    [0.25, 0, 0, 200],
    [0.5, 0, 200, 0],
    [0.75, 255, 200, 0],
    [1, 255, 255, 255],
  ],
  jet: [
    [0, 0, 0, 140],
    [0.35, 0, 160, 255],
    [0.65, 255, 255, 0],
    [1, 160, 0, 0],
  ],
  rainbow: [
    [0, 120, 0, 200],
    [0.25, 0, 0, 255],
    [0.5, 0, 255, 0],
    [0.75, 255, 255, 0],
    [1, 255, 0, 0],
  ],
  cool: [
    [0, 0, 255, 255],
    [1, 255, 0, 255],
  ],
  gray: [
    [0, 0, 0, 0],
    [1, 255, 255, 255],
  ],
}

/** RGB of a colormap at t (0–1). */
export function colormapRgb(name: FusionColormap, t: number): [number, number, number] {
  const stops = STOPS[name]
  const x = Math.max(0, Math.min(1, t))
  for (let i = 1; i < stops.length; i++) {
    if (x <= stops[i][0]) {
      const [p0, r0, g0, b0] = stops[i - 1]
      const [p1, r1, g1, b1] = stops[i]
      const f = (x - p0) / (p1 - p0 || 1)
      return [r0 + (r1 - r0) * f, g0 + (g1 - g0) * f, b0 + (b1 - b0) * f]
    }
  }
  const last = stops[stops.length - 1]
  return [last[1], last[2], last[3]]
}

export interface Registration {
  /** mm, added to the overlay's position. */
  translate: Vec3
  /** Degrees about x, y and z (patient axes), around `center`. */
  rotate: Vec3
  /** Rotation centre (the overlay volume's centre). */
  center: Vec3
}

export const IDENTITY: Registration = { translate: [0, 0, 0], rotate: [0, 0, 0], center: [0, 0, 0] }

function rotationMatrix([ax, ay, az]: Vec3) {
  const [x, y, z] = [ax, ay, az].map((d) => (d * Math.PI) / 180)
  const [cx, sx, cy, sy, cz, sz] = [Math.cos(x), Math.sin(x), Math.cos(y), Math.sin(y), Math.cos(z), Math.sin(z)]
  // R = Rz · Ry · Rx
  return [
    [cz * cy, cz * sy * sx - sz * cx, cz * sy * cx + sz * sx],
    [sz * cy, sz * sy * sx + cz * cx, sz * sy * cx - cz * sx],
    [-sy, cy * sx, cy * cx],
  ]
}

const multiply = (m: number[][], v: Vec3) => [0, 1, 2].map((r) => m[r][0] * v[0] + m[r][1] * v[1] + m[r][2] * v[2])
const transpose = (m: number[][]) => [0, 1, 2].map((r) => [0, 1, 2].map((c) => m[c][r]))

/**
 * Where in the overlay volume a world point of the base image falls: the
 * inverse of moving the overlay (rotate about its centre, then translate).
 */
export function toOverlaySpace(registration: Registration, world: Vec3): Vec3 {
  if (registration.rotate.every((d) => d === 0)) return sub(world, registration.translate)
  const inverse = transpose(rotationMatrix(registration.rotate))
  const local = sub(sub(world, registration.translate), registration.center)
  return add(multiply(inverse, local), registration.center)
}

export interface OverlayStyle {
  colormap: FusionColormap
  /** 0–1 */
  opacity: number
  /** Values shown from lower (transparent below threshold) to upper (top of the colormap). */
  lower: number
  upper: number
  /** Values below this are not drawn at all. */
  threshold: number
}

/**
 * RGBA pixels of an overlay for a width × height grid: `worldAt(x, y)` gives
 * the world point of each grid pixel, `valueAt(world)` the overlay value there (NaN outside).
 */
export function renderOverlay(width: number, height: number, worldAt: (x: number, y: number) => Vec3, valueAt: (world: Vec3) => number, style: OverlayStyle, registration: Registration): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(width * height * 4)
  const span = Math.max(1e-9, style.upper - style.lower)
  const alpha = Math.round(Math.max(0, Math.min(1, style.opacity)) * 255)
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const v = valueAt(toOverlaySpace(registration, worldAt(x, y)))
      if (Number.isNaN(v) || v < style.threshold) continue
      const [r, g, b] = colormapRgb(style.colormap, (v - style.lower) / span)
      const i = (y * width + x) * 4
      out[i] = r
      out[i + 1] = g
      out[i + 2] = b
      out[i + 3] = alpha
    }
  return out
}
