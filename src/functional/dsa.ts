// Digital subtraction angiography: each frame minus a mask frame, with pixel
// shift (motion), several masks, and part of the mask added back (landmark).

export interface Shift {
  dx: number
  dy: number
}

export interface SubtractOptions {
  shift: Shift
  /** 0–1: how much of the mask (the anatomy) is kept in the result. */
  landmark: number
}

/** Mask value at (x, y) after shifting the mask by (dx, dy), clamped at the edges. */
const shifted = (mask: ArrayLike<number>, width: number, height: number, x: number, y: number, shift: Shift) => {
  const sx = Math.max(0, Math.min(width - 1, x - shift.dx))
  const sy = Math.max(0, Math.min(height - 1, y - shift.dy))
  return mask[sy * width + sx]
}

/** live − mask × (1 − landmark); values can be negative (contrast is darker than the mask). */
export function subtract(live: ArrayLike<number>, mask: ArrayLike<number>, width: number, height: number, options: SubtractOptions): Float32Array {
  const out = new Float32Array(width * height)
  const keep = 1 - Math.max(0, Math.min(1, options.landmark))
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) out[y * width + x] = live[y * width + x] - shifted(mask, width, height, x, y, options.shift) * keep
  return out
}

export interface Region {
  x0: number
  y0: number
  x1: number
  y1: number
}

/** Mean absolute difference between a frame and a shifted mask in a region. */
function mismatch(live: ArrayLike<number>, mask: ArrayLike<number>, width: number, height: number, region: Region, shift: Shift) {
  let sum = 0
  let count = 0
  for (let y = region.y0; y <= region.y1; y++)
    for (let x = region.x0; x <= region.x1; x++) {
      sum += Math.abs(live[y * width + x] - shifted(mask, width, height, x, y, shift))
      count++
    }
  return count ? sum / count : Infinity
}

/**
 * The whole-pixel shift of the mask (within ±range) that best matches a
 * frame in a region: where the patient moved, the background cancels again.
 */
export function findShift(live: ArrayLike<number>, mask: ArrayLike<number>, width: number, height: number, region: Region | null = null, range = 10): Shift {
  const margin = range
  const r = region ?? { x0: margin, y0: margin, x1: width - 1 - margin, y1: height - 1 - margin }
  let best: Shift = { dx: 0, dy: 0 }
  let bestScore = mismatch(live, mask, width, height, r, best)
  for (let dy = -range; dy <= range; dy++)
    for (let dx = -range; dx <= range; dx++) {
      const score = mismatch(live, mask, width, height, r, { dx, dy })
      if (score < bestScore - 1e-9) {
        bestScore = score
        best = { dx, dy }
      }
    }
  return best
}

/** "Magic mask": of the candidate masks, the one that best matches the frame. */
export function bestMask(live: ArrayLike<number>, masks: ArrayLike<number>[], width: number, height: number, region: Region | null = null) {
  const r = region ?? { x0: 0, y0: 0, x1: width - 1, y1: height - 1 }
  let best = 0
  let bestScore = Infinity
  masks.forEach((mask, i) => {
    const score = mismatch(live, mask, width, height, r, { dx: 0, dy: 0 })
    if (score < bestScore) {
      bestScore = score
      best = i
    }
  })
  return best
}

/** Split mask: the mask frame for a frame, from ranges "from frame n, use mask m" (sorted or not). */
export function maskForFrame(frame: number, ranges: { from: number; mask: number }[], fallback: number) {
  const applicable = ranges.filter((r) => r.from <= frame).sort((a, b) => b.from - a.from)
  return applicable[0]?.mask ?? fallback
}
