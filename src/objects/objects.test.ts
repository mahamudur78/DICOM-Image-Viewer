import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import dicomParser from 'dicom-parser'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
// @ts-expect-error -- plain JS test-data script
import { writeObjectSamples } from '../../scripts/sample-objects.mjs'
import { sample } from '../volume/grid'
import { dvh, isolines } from './dose'
import { readKeyObjects, writeKeyObjects } from './keyObjects'
import { dicomLabToRgb, hasBit, labelAt, segmentVolumes } from './labels'
import { imageToWorld, readSrMeasurements, toStoredMeasurements, worldToImage, writeMeasurementSr, CONCEPTS, UNITS } from './measurementSr'
import { forImage, readPresentationState, writePresentationState } from './presentationState'
import { parseRtPlan } from './rtplan'
import { gridForContours, parseRtStruct, rasterize } from './rtstruct'
import { segInfo, segLabels } from './seg'
import { levelForZoom, parseSlideLevel, pyramid } from './slide'
import { parseParametricMap, parseRtDose } from './valueGrids'
import { aLaw, muLaw, orderLeads, parseWaveform, toMillivolts } from './waveform'

let root = ''
const read = (...parts: string[]) => dicomParser.parseDicom(new Uint8Array(readFileSync(join(root, ...parts))))
const parse = (bytes: Uint8Array) => dicomParser.parseDicom(bytes)

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'dicomlens-objects-'))
  writeObjectSamples(root)
})
afterAll(() => rmSync(root, { recursive: true, force: true }))

const TUMOUR = [10, -5, -25]
const ORGAN = [-22, 8, -20]
const SOURCE = {
  patientName: 'Test',
  patientId: 'T1',
  studyInstanceUID: '1.2.3',
  studyDate: '2026-03-01',
  seriesInstanceUID: '1.2.3.9',
  seriesNumber: 99,
  seriesDescription: 'Written',
  modality: 'OT',
}

describe('segmentation', () => {
  it('reads segments, colours and references', () => {
    const info = segInfo(read('objects', 'seg.dcm'))
    expect(info.segments.map((s) => [s.label, s.automatic])).toEqual([
      ['Tumor', true],
      ['Organ', false],
    ])
    expect(info.segments[0].algorithm).toBe('TumorNet 1.0')
    expect(info.referencedInstances.length).toBe(20)
    expect(dicomLabToRgb([65535, 32896, 32896]).every((c) => c > 250)).toBe(true)
  })
  it('builds a label grid at the right place', () => {
    const labels = segLabels(read('objects', 'seg.dcm'))!
    expect(labels.grid.spacing).toEqual([2, 2, 2.5])
    expect(hasBit(labelAt(labels.grid, TUMOUR), 0)).toBe(true)
    expect(hasBit(labelAt(labels.grid, ORGAN), 1)).toBe(true)
    expect(labelAt(labels.grid, [-50, 30, -10])).toBe(0)
    // A 10 mm ball is about 4.2 cm³.
    expect(segmentVolumes(labels)[0].volume).toBeGreaterThan(3.3)
    expect(segmentVolumes(labels)[0].volume).toBeLessThan(5)
  })
})

describe('RT structures and dose', () => {
  it('reads and fills structures', () => {
    const set = parseRtStruct(read('objects', 'rtstruct.dcm'))
    expect(set.rois.map((r) => [r.label, r.type, r.color])).toEqual([
      ['PTV', 'PTV', [255, 0, 0]],
      ['Organ', 'ORGAN', [0, 160, 255]],
    ])
    const labels = rasterize(set, gridForContours(set))
    expect(hasBit(labelAt(labels.grid, TUMOUR), 0)).toBe(true)
    expect(hasBit(labelAt(labels.grid, ORGAN), 1)).toBe(true)
    expect(hasBit(labelAt(labels.grid, ORGAN), 0)).toBe(false)
  })
  it('reads the dose grid in Gy', () => {
    const dose = parseRtDose(read('objects', 'rtdose.dcm'))!
    expect(dose.unit).toBe('Gy')
    expect(dose.max).toBeCloseTo(62, 1)
    expect(sample(dose.grid, [8, -4, -24])).toBeCloseTo(62, 0)
    expect(sample(dose.grid, [-50, 40, -40])).toBeLessThan(5)
  })
  it('draws isolines and computes a DVH', () => {
    // A 4 × 4 ramp crosses 1.5 between its second and third columns.
    const ramp = [0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3]
    const lines = isolines(ramp, 4, 4, 1.5)
    expect(lines.length).toBe(3)
    expect(lines.every(([x0, , x1]) => x0 === 1.5 && x1 === 1.5)).toBe(true)

    const set = parseRtStruct(read('objects', 'rtstruct.dcm'))
    const curves = dvh(rasterize(set, gridForContours(set)), parseRtDose(read('objects', 'rtdose.dcm'))!.grid)
    const [ptv, organ] = curves
    expect(ptv.d95).toBeGreaterThan(50)
    expect(ptv.points[0].percent).toBe(100)
    expect(organ.mean).toBeLessThan(ptv.mean)
    expect(organ.points.at(-1)!.percent).toBeLessThan(5)
  })
  it('reads the plan', () => {
    const plan = parseRtPlan(read('objects', 'rtplan.dcm'))
    expect(plan.name).toBe('Tumor 60 Gy')
    expect(plan.fractions).toBe(30)
    expect(plan.prescriptions[0].dose).toBe(60)
    expect(plan.beams.map((b) => [b.name, b.gantry, b.energy, b.meterset])).toEqual([
      ['AP', 0, 6, 112.5],
      ['RLAT', 270, 6, 98.4],
    ])
  })
  it('reads a float parametric map with its unit', () => {
    const map = parseParametricMap(read('objects', 'adc_map.dcm'))!
    expect(map.unit).toBe('um2/s')
    expect(sample(map.grid, TUMOUR)).toBeCloseTo(750.5, 1)
    expect(map.max).toBe(2000)
  })
})

describe('reports, key images and presentation states', () => {
  const plane = { origin: [-64, -64, -25], row: [1, 0, 0], column: [0, 1, 0], spacing: [2, 2] as [number, number] }

  it('maps image coordinates to the world and back', () => {
    expect(imageToWorld(plane, [0.5, 0.5])).toEqual([-64, -64, -25])
    expect(worldToImage(plane, imageToWorld(plane, [12.25, 7]))).toEqual([12.25, 7])
  })
  it('reads TID 1500 measurements as our tools', () => {
    const measurements = readSrMeasurements(read('objects', 'measurements_sr.dcm'))
    expect(measurements.map((m) => [m.label, m.graphicType, m.value])).toEqual([
      ['Lesion length', 'POLYLINE', 30],
      ['Lesion area', 'ELLIPSE', 314.2],
      ['Organ', 'POINT', 20],
    ])
    const stored = toStoredMeasurements(measurements, () => plane)
    expect(stored.map((s) => s.toolName)).toEqual(['Length', 'EllipticalROI', 'Probe'])
    const [a, b] = stored[0].data.points
    expect(Math.hypot(b[0] - a[0], b[1] - a[1])).toBe(30)
  })
  it('writes a report that reads back', () => {
    const image = { sopClassUID: '1.2.840.10008.5.1.4.1.1.2', sopInstanceUID: '1.2.3.4', frame: 0, seriesInstanceUID: '1.2.3.5' }
    const { bytes } = writeMeasurementSr(SOURCE, [
      { label: 'Nodule', concept: CONCEPTS.length, value: 12.5, unit: UNITS.mm, graphicType: 'POLYLINE', points: [[1, 2], [3, 4]], image },
    ])
    const [m] = readSrMeasurements(parse(bytes))
    expect(m).toMatchObject({ label: 'Nodule', concept: 'Length', value: 12.5, unit: 'mm', graphicType: 'POLYLINE', image: { sopInstanceUID: '1.2.3.4', frame: 0 } })
    expect(m.points).toEqual([[1, 2], [3, 4]])
  })
  it('reads and writes key object selections', () => {
    const ko = readKeyObjects(read('objects', 'key_images.dcm'))
    expect(ko.title).toBe('Of Interest')
    expect(ko.description).toBe('Tumor slices')
    expect(ko.images.length).toBe(2)
    const image = { sopClassUID: '1.2.840.10008.5.1.4.1.1.2', sopInstanceUID: '9.8.7', frame: 3, seriesInstanceUID: '9.8' }
    const back = readKeyObjects(parse(writeKeyObjects(SOURCE, [image], 'Look').bytes))
    expect(back).toEqual({ title: 'Of Interest', description: 'Look', images: [{ sopInstanceUID: '9.8.7', frames: [3] }] })
  })
  it('reads a presentation state', () => {
    const state = readPresentationState(read('objects', 'presentation_state.dcm'))
    expect(state.images.length).toBe(20)
    expect(state.voi).toEqual([{ center: 60, width: 120 }])
    expect([state.rotation, state.flip]).toEqual([90, true])
    expect(state.areas[0]).toMatchObject({ topLeft: [17, 17], bottomRight: [48, 48] })
    expect(state.shutters).toEqual([{ shape: 'CIRCULAR', center: [32, 32], radius: 28 }])
    expect(state.annotations[0].texts[0]).toMatchObject({ text: 'Tumor', anchor: [44, 20] })
    expect(state.annotations[0].graphics[0].points.length).toBe(5)
    expect(forImage(state.voi, 'any')?.width).toBe(120)
  })
  it('writes a presentation state that reads back', () => {
    const image = { sopClassUID: '1.2.840.10008.5.1.4.1.1.2', sopInstanceUID: '1.2.3.4', frame: 0, seriesInstanceUID: '1.2.3.5' }
    const { bytes } = writePresentationState(SOURCE, {
      label: 'My view',
      description: 'Test',
      images: [image],
      voi: { center: 40, width: 400 },
      rotation: 270,
      flip: false,
      area: { topLeft: [1, 1], bottomRight: [32, 16] },
      annotations: [{ image, graphics: [{ type: 'POLYLINE', points: [[1, 1], [5, 5]], filled: false }], texts: [{ text: '5 mm', anchor: [5, 5] }] }],
    })
    const state = readPresentationState(parse(bytes))
    expect(state).toMatchObject({ label: 'MY VIEW', rotation: 270, flip: false, voi: [{ center: 40, width: 400 }], images: ['1.2.3.4'] })
    expect(state.areas[0]).toMatchObject({ topLeft: [1, 1], bottomRight: [32, 16] })
    expect(state.annotations[0].graphics[0].points).toEqual([[1, 1], [5, 5]])
    expect(state.annotations[0].texts[0].text).toBe('5 mm')
  })
})

describe('waveforms and slides', () => {
  it('reads a 12-lead ECG in millivolts', () => {
    const [group] = parseWaveform(read('waveform', 'ecg_12lead.dcm'))
    expect(group.rate).toBe(500)
    expect(group.channels.length).toBe(12)
    const leads = orderLeads(group.channels)!
    expect(leads[1].label).toBe('II')
    // The R wave of lead II peaks at about 1.2 mV, 0.36 s into each beat.
    const ii = toMillivolts(leads[1])
    expect(ii[180]).toBeCloseTo(1.2, 1)
    expect(Math.max(...ii)).toBeLessThan(1.3)
  })
  it('reads pressures and audio', () => {
    const [pressures] = parseWaveform(read('waveform', 'hemodynamic.dcm'))
    expect(pressures.channels[0].unit).toBe('mm[Hg]')
    expect(Math.max(...pressures.channels[0].values)).toBeCloseTo(120, 0)
    const [audio] = parseWaveform(read('waveform', 'voice.dcm'))
    expect(audio.rate).toBe(8000)
    expect(audio.channels[0].values.length).toBe(8000)
    expect(muLaw(0xff)).toBe(0)
    expect(aLaw(0xd5)).toBe(8)
  })
  it('reads the slide pyramid', () => {
    const levels = pyramid([parseSlideLevel(read('slide', 'level_1.dcm'))!, parseSlideLevel(read('slide', 'level_0.dcm'))!])
    expect(levels.map((l) => [l.width, l.height, l.tiles.size])).toEqual([
      [512, 384, 12],
      [256, 192, 4],
    ])
    expect(levels[0].spacing).toEqual([0.0005, 0.0005])
    expect(levels[0].tiles.get('3,2')).toBe(11)
    expect(levelForZoom(levels, 1)).toBe(levels[0])
    expect(levelForZoom(levels, 0.4)).toBe(levels[1])
  })
})
