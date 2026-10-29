// PET statistics in a sphere: SUVmax, SUVmean, and SUVpeak — the highest
// mean in a 1 cm³ sphere (radius 6.2 mm) centred within the region (PERCIST).
import { indexToWorld, sample, worldToIndex, type VolumeGrid } from '../volume/grid'

/** Radius of a 1 cm³ sphere, mm. */
export const PEAK_RADIUS = Math.cbrt((3 * 1000) / (4 * Math.PI))

export interface SphereStats {
  max: number
  mean: number
  peak: number
  /** Voxels inside the sphere and their volume (cm³). */
  count: number
  volume: number
}

/** Voxel indexes whose centres are within a radius (mm) of a world point. */
function voxelsInSphere(grid: VolumeGrid, center: number[], radius: number): number[][] {
  const c = worldToIndex(grid, center)
  const reach = grid.spacing.map((s) => Math.ceil(radius / s))
  const out: number[][] = []
  for (let k = Math.max(0, Math.floor(c[2] - reach[2])); k <= Math.min(grid.dimensions[2] - 1, Math.ceil(c[2] + reach[2])); k++)
    for (let j = Math.max(0, Math.floor(c[1] - reach[1])); j <= Math.min(grid.dimensions[1] - 1, Math.ceil(c[1] + reach[1])); j++)
      for (let i = Math.max(0, Math.floor(c[0] - reach[0])); i <= Math.min(grid.dimensions[0] - 1, Math.ceil(c[0] + reach[0])); i++) {
        const w = indexToWorld(grid, [i, j, k])
        if (Math.hypot(w[0] - center[0], w[1] - center[1], w[2] - center[2]) <= radius) out.push([i, j, k])
      }
  return out
}

const valueAt = (grid: VolumeGrid, [i, j, k]: number[]) => grid.scalars[i + grid.dimensions[0] * (j + grid.dimensions[1] * k)]

/** Mean of the volume in a sphere, sampled on a fine grid (works when voxels are larger than the sphere). */
function sphereMean(grid: VolumeGrid, center: number[], radius: number) {
  const step = Math.min(radius / 3, ...grid.spacing.map((s) => s / 2))
  let sum = 0
  let count = 0
  for (let z = -radius; z <= radius; z += step)
    for (let y = -radius; y <= radius; y += step)
      for (let x = -radius; x <= radius; x += step) {
        if (x * x + y * y + z * z > radius * radius) continue
        const v = sample(grid, [center[0] + x, center[1] + y, center[2] + z])
        if (Number.isNaN(v)) continue
        sum += v
        count++
      }
  return count ? sum / count : NaN
}

export function sphereStats(grid: VolumeGrid, center: number[], radius: number): SphereStats | null {
  const voxels = voxelsInSphere(grid, center, radius)
  if (voxels.length === 0) return null
  let max = -Infinity
  let sum = 0
  let hottest = voxels[0]
  for (const voxel of voxels) {
    const v = valueAt(grid, voxel)
    sum += v
    if (v > max) {
      max = v
      hottest = voxel
    }
  }
  // SUVpeak: tried around the hot part of the region (voxels within 80% of the
  // maximum, at most 500 of them, spread evenly), not every voxel of a big sphere.
  const hot = voxels.map((voxel) => ({ voxel, value: valueAt(grid, voxel) })).filter((v) => v.value >= max - Math.abs(max) * 0.2)
  const stride = Math.max(1, Math.ceil(hot.length / 500))
  const candidates = hot.filter((_, i) => i % stride === 0)
  let peak = -Infinity
  for (const { voxel } of candidates.length ? candidates : [{ voxel: hottest }]) peak = Math.max(peak, sphereMean(grid, indexToWorld(grid, voxel), PEAK_RADIUS))
  const voxelVolume = (grid.spacing[0] * grid.spacing[1] * grid.spacing[2]) / 1000
  return { max, mean: sum / voxels.length, peak, count: voxels.length, volume: voxels.length * voxelVolume }
}

/**
 * SUVpeak on one image: the highest mean of a disc of radius PEAK_RADIUS (mm)
 * centred on a pixel of the region. `inside` are the region's pixel indexes.
 */
export function discPeak(valueAt: (index: number) => number, inside: number[], width: number, height: number, sx: number, sy: number) {
  const rx = Math.ceil(PEAK_RADIUS / sx)
  const ry = Math.ceil(PEAK_RADIUS / sy)
  const offsets: [number, number][] = []
  for (let dy = -ry; dy <= ry; dy++) for (let dx = -rx; dx <= rx; dx++) if (Math.hypot(dx * sx, dy * sy) <= PEAK_RADIUS) offsets.push([dx, dy])
  let peak = -Infinity
  for (const index of inside) {
    const x = index % width
    const y = Math.floor(index / width)
    let sum = 0
    let count = 0
    for (const [dx, dy] of offsets) {
      const px = x + dx
      const py = y + dy
      if (px < 0 || py < 0 || px >= width || py >= height) continue
      sum += valueAt(py * width + px)
      count++
    }
    if (count) peak = Math.max(peak, sum / count)
  }
  return peak === -Infinity ? NaN : peak
}
