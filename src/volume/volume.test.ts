import { describe, expect, it } from 'vitest'
import { curvedReformat, firstHit, indexToWorld, resampleCurve, sample, slicePlane, worldToIndex, type VolumeGrid } from './grid'
import { encodeObj, encodePly, encodeStl, meshMeasures, trianglesFromPolys } from './mesh'
import { opacityAt, parsePreset, shiftFunction, toPresetStrings, visibleFrom } from './transferFunction'

/** 10 × 10 × 10 voxels of 2 mm from (-10, -10, 0); value = x position in mm, plus 1000 inside a ball. */
function grid(): VolumeGrid {
  const n = 10
  const scalars = new Float32Array(n * n * n)
  for (let k = 0; k < n; k++)
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        const [x, y, z] = [-10 + 2 * i, -10 + 2 * j, 2 * k]
        scalars[i + n * (j + n * k)] = x + (Math.hypot(x, y, z - 9) < 5 ? 1000 : 0)
      }
  return { dimensions: [n, n, n], spacing: [2, 2, 2], origin: [-10, -10, 0], direction: [1, 0, 0, 0, 1, 0, 0, 0, 1], scalars }
}

describe('volume grid', () => {
  it('converts between world and index', () => {
    const g = grid()
    expect(worldToIndex(g, [-10, -10, 0])).toEqual([0, 0, 0])
    expect(worldToIndex(g, [0, 2, 4])).toEqual([5, 6, 2])
    expect(indexToWorld(g, [5, 6, 2])).toEqual([0, 2, 4])
  })

  it('interpolates trilinearly', () => {
    const g = grid()
    // Away from the ball the value is x, which is linear: interpolation is exact.
    expect(sample(g, [-7, 8, 1])).toBeCloseTo(-7)
    expect(sample(g, [-9.5, -9.5, 0.5])).toBeCloseTo(-9.5)
    expect(sample(g, [-20, 0, 0])).toBeNaN()
    expect(sample(g, [-20, 0, 0], -1024)).toBe(-1024)
  })

  it('reslices an oblique plane', () => {
    const g = grid()
    // A sagittal-like plane at x = -6: every value is -6 (outside the ball).
    const plane = slicePlane(g, { origin: [-6, -10, 0], row: [0, 1, 0], column: [0, 0, 1], pixelSpacing: 1, columns: 5, rows: 3 })
    expect([...plane]).toEqual(new Array(15).fill(-6))
    // Along x the values follow x.
    const along = slicePlane(g, { origin: [-8, -10, 0], row: [1, 0, 0], column: [0, 1, 0], pixelSpacing: 2, columns: 3, rows: 1 })
    expect([...along]).toEqual([-8, -6, -4])
  })

  it('resamples a curve evenly', () => {
    const { points, tangents } = resampleCurve([[0, 0, 0], [10, 0, 0], [20, 0, 0]], 1)
    expect(points).toHaveLength(21)
    expect(points[5][0]).toBeCloseTo(5)
    expect(tangents[10]).toEqual([1, 0, 0])
  })

  it('straightens a curved reformat', () => {
    const g = grid()
    // A straight "curve" along y at x = -6, up = z: every value is -6.
    const cpr = curvedReformat(g, [[-6, -8, 4], [-6, 8, 4]], { up: [0, 0, 1], height: 4, pixelSpacing: 1, thickness: 0 })
    expect(cpr.columns).toBe(17)
    expect(cpr.rows).toBe(4)
    expect(cpr.data.every((v) => Math.abs(v + 6) < 1e-4)).toBe(true)
    // A thick slab across the curve (along x) takes the maximum: about x + 1.
    const thick = curvedReformat(g, [[-6, -8, 4], [-6, 8, 4]], { up: [0, 0, 1], height: 2, pixelSpacing: 1, thickness: 3 })
    expect(Math.max(...thick.data)).toBeCloseTo(-5, 0)
  })

  it('finds the first visible voxel along a ray', () => {
    const g = grid()
    // From the left, along +x through the ball's centre (0, 0, 9): the ball starts at x ≈ -5.
    const hit = firstHit(g, [-30, 0, 9], [1, 0, 0], (v) => v > 500, 0.25)!
    expect(hit[0]).toBeGreaterThan(-6)
    expect(hit[0]).toBeLessThan(-3.9)
    expect(firstHit(g, [-30, 0, 9], [0, 1, 0], (v) => v > 500)).toBeNull()
  })
})

describe('transfer functions', () => {
  const preset = { scalarOpacity: '6 -1000 0 0 0.5 1000 1', colorTransfer: '8 -1000 0 0 0 1000 1 1 1' }

  it('parses and writes preset strings', () => {
    const tf = parsePreset(preset)
    expect(tf.opacity).toEqual([{ value: -1000, opacity: 0 }, { value: 0, opacity: 0.5 }, { value: 1000, opacity: 1 }])
    expect(tf.colors[1]).toEqual({ value: 1000, r: 1, g: 1, b: 1 })
    expect(toPresetStrings(tf)).toEqual(preset)
  })

  it('interpolates opacity and finds where the volume becomes visible', () => {
    const tf = parsePreset(preset)
    expect(opacityAt(tf, -500)).toBeCloseTo(0.25)
    expect(opacityAt(tf, 5000)).toBe(1)
    expect(opacityAt(tf, -5000)).toBe(0)
    expect(visibleFrom(tf, 0.25)).toBeCloseTo(-500)
    expect(opacityAt(shiftFunction(tf, 100), -400)).toBeCloseTo(0.25)
  })
})

describe('meshes', () => {
  // A unit cube (mm), 12 triangles, outward faces.
  const points = [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 0, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1]
  const quads = [
    [0, 3, 2, 1],
    [4, 5, 6, 7],
    [0, 1, 5, 4],
    [2, 3, 7, 6],
    [1, 2, 6, 5],
    [0, 4, 7, 3],
  ]
  const triangles = trianglesFromPolys(quads.flatMap((q) => [4, ...q]))
  const cube = { points, triangles }

  it('fans polygons into triangles and measures the mesh', () => {
    expect(triangles).toHaveLength(36)
    const { area, volume } = meshMeasures(cube)
    expect(area).toBeCloseTo(6)
    expect(volume).toBeCloseTo(1)
  })

  it('writes STL, OBJ and PLY', () => {
    const stl = encodeStl(cube)
    expect(stl.length).toBe(84 + 12 * 50)
    expect(new DataView(stl.buffer).getUint32(80, true)).toBe(12)
    // The first triangle's normal points down (-z) for the bottom face.
    expect(new DataView(stl.buffer).getFloat32(84 + 8, true)).toBeCloseTo(-1)
    const obj = encodeObj(cube)
    expect(obj.split('\n').filter((l) => l.startsWith('v '))).toHaveLength(8)
    expect(obj).toContain('f 1 4 3')
    const ply = encodePly(cube)
    expect(ply).toContain('element vertex 8')
    expect(ply).toContain('element face 12')
  })
})

describe('reformatted DICOM', () => {
  it('quantizes to 16 bits, keeping whole numbers that fit', async () => {
    const { quantization, quantize } = await import('./mprSeries')
    expect(quantization(-1024, 3071, true)).toEqual({ slope: 1, intercept: 0 })
    const q = quantization(0, 6.5535, false)
    const stored = quantize(Float32Array.from([0, 6.5535, NaN]), q, 0)
    expect(stored[0] * q.slope + q.intercept).toBeCloseTo(0, 3)
    expect(stored[1] * q.slope + q.intercept).toBeCloseTo(6.5535, 3)
    expect(stored[2]).toBe(stored[0])
  })

  it('writes a slice with its geometry', async () => {
    const { sliceToDicom } = await import('./mprSeries')
    const { parseHeaderBytes } = await import('../dicom/header')
    const plane = { origin: [-10, 0, 5], row: [0, 1, 0], column: [0, 0, -1], pixelSpacing: 0.5, columns: 3, rows: 2 }
    const bytes = sliceToDicom(Int16Array.from([1, 2, 3, 4, 5, 6]), plane, { patientName: 'A^B', patientId: '1', studyInstanceUID: '1.2', studyDate: '2026-01-01', modality: 'CT', frameOfReferenceUID: '1.2.3' }, { uid: '1.2.9', number: 101, description: 'MPR', instance: 1, thickness: 1 }, { slope: 1, intercept: 0 })
    const dataSet = parseHeaderBytes(bytes)
    expect(dataSet.string('x00200032')).toBe('-10\\0\\5')
    expect(dataSet.string('x00200037')).toBe('0\\1\\0\\0\\0\\-1')
    expect(dataSet.string('x00280030')).toBe('0.5\\0.5')
    expect(dataSet.string('x00080020')).toBe('20260101')
    expect(dataSet.uint16('x00280010')).toBe(2)
  })
})
