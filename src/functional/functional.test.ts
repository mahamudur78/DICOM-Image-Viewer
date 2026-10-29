import { describe, expect, it } from 'vitest'
import { calculateSUVScalingFactors } from '@cornerstonejs/calculate-suv'
import type { VolumeGrid } from '../volume/grid'
import { bestMask, findShift, maskForFrame, subtract } from './dsa'
import { IDENTITY, colormapRgb, renderOverlay, toOverlaySpace } from './fusion'
import { sameSliceInPhase, splitPhases, type PhaseInput } from './phases'
import { PEAK_RADIUS, sphereStats } from './suvStats'
import { analyzeCurve, curvesCsv } from './tic'

describe('phases', () => {
  const image = (slice: number, phase: number, extra: Partial<PhaseInput> = {}): PhaseInput => ({
    sliceLocation: slice * 5,
    acquisitionTime: 36000 + phase * 60,
    instanceNumber: phase * 3 + slice + 1,
    ...extra,
  })

  it('splits by Temporal Position Identifier, with trigger times', () => {
    const images = [0, 1, 2].flatMap((phase) => [0, 1].map((slice) => image(slice, phase, { temporalPosition: phase + 1, triggerTime: phase * 60000 })))
    const phases = splitPhases(images)!
    expect(phases.byPhase).toEqual([[0, 1], [2, 3], [4, 5]])
    expect(phases.times).toEqual([0, 60, 120])
    expect(phases.timed).toBe(true)
    expect(sameSliceInPhase(phases, 1, 2)).toBe(5)
  })

  it('splits repeated positions by acquisition time', () => {
    const images = [image(0, 1), image(1, 0), image(0, 0), image(1, 1)]
    const phases = splitPhases(images)!
    expect(phases.byPhase).toEqual([[2, 1], [0, 3]])
    expect(phases.times).toEqual([0, 60])
  })

  it('is null for an ordinary stack', () => {
    expect(splitPhases([0, 1, 2].map((slice) => image(slice, 0)))).toBeNull()
    expect(splitPhases([image(0, 0), image(0, 1), image(1, 0)])).toBeNull()
  })
})

describe('time-intensity curves', () => {
  const curve = (values: number[]) => values.map((value, i) => ({ t: i * 60, value }))

  it('classifies persistent, plateau and washout curves', () => {
    expect(analyzeCurve(curve([100, 200, 260, 300, 330, 350]))!.type).toMatch(/^I[ab]$/)
    expect(analyzeCurve(curve([100, 200, 300, 400, 500, 600]))!.type).toBe('Ia')
    expect(analyzeCurve(curve([100, 300, 330, 330, 325, 330]))!.type).toBe('II')
    const washout = analyzeCurve(curve([100, 350, 380, 330, 290, 250]))!
    expect(washout.type).toBe('III')
    expect(washout).toMatchObject({ baseline: 100, peak: 380, timeToPeak: 120 })
    expect(washout.initialEnhancement).toBeCloseTo(280)
    expect(washout.washOut).toBeLessThan(0)
  })

  it('exports curves as CSV', () => {
    expect(curvesCsv([{ name: 'ROI 1', points: curve([1, 2]) }, { name: 'ROI "2"', points: curve([3, 4]) }])).toBe('Time (s),"ROI 1","ROI ""2"""\r\n0,1.00,3.00\r\n60,2.00,4.00\r\n')
  })
})

describe('DSA', () => {
  const w = 32
  const h = 32
  const background = (shift = 0) => Float32Array.from({ length: w * h }, (_, i) => 100 + 40 * Math.sin(((i % w) - shift) / 3) * Math.cos(Math.floor(i / w) / 4))

  it('subtracts the mask, keeping some anatomy with a landmark', () => {
    const mask = background()
    const live = mask.map((v, i) => (Math.floor(i / w) === 16 ? v - 50 : v))
    const dsa = subtract(live, mask, w, h, { shift: { dx: 0, dy: 0 }, landmark: 0 })
    expect(dsa[16 * w + 5]).toBeCloseTo(-50)
    expect(dsa[3 * w + 5]).toBeCloseTo(0)
    const landmark = subtract(live, mask, w, h, { shift: { dx: 0, dy: 0 }, landmark: 0.5 })
    expect(landmark[3 * w + 5]).toBeCloseTo(mask[3 * w + 5] / 2)
  })

  it('finds the shift that undoes motion', () => {
    const mask = background(0)
    const moved = background(2)
    expect(findShift(moved, mask, w, h, null, 4)).toEqual({ dx: 2, dy: 0 })
    const corrected = subtract(moved, mask, w, h, { shift: { dx: 2, dy: 0 }, landmark: 0 })
    expect(Math.abs(corrected[10 * w + 10])).toBeLessThan(1e-4)
  })

  it('chooses masks', () => {
    const masks = [background(0), background(2)]
    expect(bestMask(background(2), masks, w, h)).toBe(1)
    expect(maskForFrame(7, [{ from: 0, mask: 0 }, { from: 6, mask: 5 }], 0)).toBe(5)
    expect(maskForFrame(3, [{ from: 6, mask: 5 }], 0)).toBe(0)
  })
})

describe('SUV', () => {
  it('decay-corrects to the injection time (F-18, 1 hour)', () => {
    // 370 MBq injected at 09:00, scan at 10:00, 70 kg: SUVbw factor = weight (g) / decayed dose.
    const [factors] = calculateSUVScalingFactors([
      {
        CorrectedImage: ['DECY', 'ATTN'],
        Units: 'BQML',
        RadionuclideHalfLife: 6586.2,
        RadionuclideTotalDose: 370000000,
        DecayCorrection: 'START',
        PatientWeight: 70,
        SeriesDate: '20260102',
        SeriesTime: '100000',
        AcquisitionDate: '20260102',
        AcquisitionTime: '100000',
        RadiopharmaceuticalStartTime: '090000',
        PatientSize: 1.75,
        PatientSex: 'M',
      },
    ])
    const decayed = 370000000 * Math.pow(2, -3600 / 6586.2)
    expect(factors.suvbw).toBeCloseTo(70000 / decayed, 8)
    expect(factors.suvlbm).toBeLessThan(factors.suvbw)
    expect(factors.suvbsa).toBeGreaterThan(0)
  })

  it('finds SUVmax, SUVmean and SUVpeak in a sphere', () => {
    // 2 mm voxels; value 10 inside a 10 mm ball at the centre, 1 elsewhere.
    const n = 31
    const scalars = new Float32Array(n * n * n).map((_, i) => {
      const [x, y, z] = [i % n, Math.floor(i / n) % n, Math.floor(i / (n * n))].map((v) => (v - 15) * 2)
      return Math.hypot(x, y, z) <= 10 ? 10 : 1
    })
    const grid: VolumeGrid = { dimensions: [n, n, n], spacing: [2, 2, 2], origin: [-30, -30, -30], direction: [1, 0, 0, 0, 1, 0, 0, 0, 1], scalars }
    const stats = sphereStats(grid, [0, 0, 0], 20)!
    expect(stats.max).toBe(10)
    expect(stats.mean).toBeGreaterThan(1)
    expect(stats.mean).toBeLessThan(10)
    // A 1 cm³ sphere fits inside the 10 mm ball: its mean is (nearly) 10.
    expect(stats.peak).toBeGreaterThan(9.5)
    expect(stats.volume).toBeCloseTo((4 / 3) * Math.PI * 8, 0)
    expect(PEAK_RADIUS).toBeCloseTo(6.2035, 3)
  })
})

describe('fusion', () => {
  it('maps values through a colormap', () => {
    expect(colormapRgb('gray', 0.5)).toEqual([127.5, 127.5, 127.5])
    expect(colormapRgb('hot', 1)).toEqual([255, 255, 255])
    expect(colormapRgb('hot', -1)).toEqual([0, 0, 0])
  })

  it('inverts the registration', () => {
    expect(toOverlaySpace({ ...IDENTITY, translate: [10, 0, 0] }, [15, 2, 3])).toEqual([5, 2, 3])
    // Moving the overlay 90° about z: a base point at +y sees the overlay's +x.
    const p = toOverlaySpace({ translate: [0, 0, 0], rotate: [0, 0, 90], center: [0, 0, 0] }, [0, 10, 0])
    expect(p[0]).toBeCloseTo(10)
    expect(p[1]).toBeCloseTo(0)
  })

  it('draws an overlay with threshold and opacity', () => {
    const pixels = renderOverlay(2, 1, (x) => [x, 0, 0], ([x]) => (x === 0 ? 5 : 50), { colormap: 'gray', opacity: 0.5, lower: 0, upper: 100, threshold: 10 }, IDENTITY)
    expect([...pixels.slice(0, 4)]).toEqual([0, 0, 0, 0]) // below the threshold: nothing
    expect([...pixels.slice(4, 8)]).toEqual([128, 128, 128, 128])
  })
})
