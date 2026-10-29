// Synthetic non-image DICOM objects for phase 8 (see BLUEPRINT/TEST_DATA.md):
//   objects/    a CT (20 slices, 64², 2 mm, slices 2.5 mm apart) with a tumour and an organ, and on it:
//               SEG (2 segments, AI), RTSTRUCT (PTV, Organ), RTDOSE (Gaussian around the tumour,
//               62 Gy), RTPLAN (2 beams), a parametric map (ADC, float pixels), a measurement SR
//               (TID 1500: length, ellipse area, point), a key object selection (slices 10–11) and a
//               presentation state (window 120/60, rotation 90°, flip, zoom, text, polyline, shutter)
//   waveform/   12-lead ECG (500 Hz, 10 s, 75 bpm), hemodynamic pressures, voice audio (440 Hz, 1 s)
//   slide/      whole-slide microscopy, two pyramid levels of 128-pixel RGB tiles
//   special/    ophthalmic photo and OCT, intra-oral and panoramic dental X-rays, a four-view
//               mammogram (one series per view, the newest study) and a breast tomosynthesis volume
import { join } from 'node:path'
import { mkdirSync } from 'node:fs'
import { UID_ROOT, element, uint16Pixels, writeDicomFile } from './dicom-writer.mjs'

const ROOT = `${UID_ROOT}.60`
const SOP = {
  ct: '1.2.840.10008.5.1.4.1.1.2',
  seg: '1.2.840.10008.5.1.4.1.1.66.4',
  rtstruct: '1.2.840.10008.5.1.4.1.1.481.3',
  rtdose: '1.2.840.10008.5.1.4.1.1.481.2',
  rtplan: '1.2.840.10008.5.1.4.1.1.481.5',
  pmap: '1.2.840.10008.5.1.4.1.1.30',
  comprehensiveSr: '1.2.840.10008.5.1.4.1.1.88.33',
  ko: '1.2.840.10008.5.1.4.1.1.88.59',
  gsps: '1.2.840.10008.5.1.4.1.1.11.1',
  ecg: '1.2.840.10008.5.1.4.1.1.9.1.1',
  hemodynamic: '1.2.840.10008.5.1.4.1.1.9.2.1',
  audio: '1.2.840.10008.5.1.4.1.1.9.4.1',
  sm: '1.2.840.10008.5.1.4.1.1.77.1.6',
  op: '1.2.840.10008.5.1.4.1.1.77.1.5.1',
  opt: '1.2.840.10008.5.1.4.1.1.77.1.5.4',
  io: '1.2.840.10008.5.1.4.1.1.1.3',
  dx: '1.2.840.10008.5.1.4.1.1.1.1',
  mg: '1.2.840.10008.5.1.4.1.1.1.2',
  dbt: '1.2.840.10008.5.1.4.1.1.13.1.3',
}

const e = element
const sq = (group, elem, items) => e(group, elem, 'SQ', items)
const code = (value, scheme, meaning) => [e(0x0008, 0x0100, 'SH', value), e(0x0008, 0x0102, 'SH', scheme), e(0x0008, 0x0104, 'LO', meaning)]
const floats = (values) => new Uint8Array(Float32Array.from(values).buffer)
const int32s = (values) => new Uint8Array(Int32Array.from(values).buffer)
const ds = (values) => values.map((v) => Number(v.toFixed(3))).join('\\')

const patient = (name, id) => [e(0x0010, 0x0010, 'PN', name), e(0x0010, 0x0020, 'LO', id), e(0x0010, 0x0040, 'CS', 'O')]
const study = (uid, description, date = '20260301') => [
  e(0x0020, 0x000d, 'UI', uid),
  e(0x0008, 0x1030, 'LO', description),
  e(0x0008, 0x0020, 'DA', date),
  e(0x0008, 0x0030, 'TM', '100000'),
]
const series = (uid, number, modality, description) => [
  e(0x0020, 0x000e, 'UI', uid),
  e(0x0020, 0x0011, 'IS', number),
  e(0x0008, 0x0060, 'CS', modality),
  e(0x0008, 0x103e, 'LO', description),
]

export function writeObjectSamples(root) {
  const dir = (name) => {
    const path = join(root, name)
    mkdirSync(path, { recursive: true })
    return path
  }
  writeRtAndImagingObjects(dir('objects'))
  writeWaveforms(dir('waveform'))
  writeSlide(dir('slide'))
  writeSpecialImages(dir('special'))
}

// --- a CT with objects on it -------------------------------------------------------

const CT = { size: 64, spacing: 2, slices: 20, step: 2.5, origin: [-64, -64, 0] }
const TUMOUR = { center: [10, -5, -25], radius: 10 }
const ORGAN = { center: [-22, 8, -20], radius: 8 }
const zOf = (k) => -k * CT.step
const inside = (shape, [x, y, z]) => Math.hypot(x - shape.center[0], y - shape.center[1], z - shape.center[2]) < shape.radius
const world = (i, j, k) => [CT.origin[0] + i * CT.spacing, CT.origin[1] + j * CT.spacing, zOf(k)]

function writeRtAndImagingObjects(out) {
  const studyUid = `${ROOT}.1`
  const forUid = `${ROOT}.1.200`
  const ctSeries = `${ROOT}.1.1`
  const ctSop = (k) => `${ROOT}.1.1.${k + 1}`
  const common = [...patient('Sample^Objects', 'SAMPLE-OBJ'), ...study(studyUid, 'CT with RT, SEG and reports'), e(0x0020, 0x0052, 'UI', forUid)]
  const orientation = e(0x0020, 0x0037, 'DS', '1\\0\\0\\0\\1\\0')
  const allImages = Array.from({ length: CT.slices }, (_, k) => [e(0x0008, 0x1150, 'UI', SOP.ct), e(0x0008, 0x1155, 'UI', ctSop(k))])

  // CT
  for (let k = 0; k < CT.slices; k++) {
    const pixels = []
    for (let j = 0; j < CT.size; j++)
      for (let i = 0; i < CT.size; i++) {
        const p = world(i, j, k)
        const body = (p[0] / 56) ** 2 + (p[1] / 40) ** 2 < 1
        pixels.push((inside(TUMOUR, p) ? 80 : inside(ORGAN, p) ? 20 : body ? 40 : -1000) + 1024)
      }
    writeDicomFile(join(out, `ct_${String(k + 1).padStart(2, '0')}.dcm`), {
      sopClassUID: SOP.ct,
      sopInstanceUID: ctSop(k),
      elements: [
        ...common,
        ...series(ctSeries, 1, 'CT', 'CT planning'),
        e(0x0020, 0x0013, 'IS', k + 1),
        e(0x0020, 0x0032, 'DS', ds(world(0, 0, k))),
        orientation,
        e(0x0018, 0x0050, 'DS', CT.step),
        e(0x0028, 0x0002, 'US', 1),
        e(0x0028, 0x0004, 'CS', 'MONOCHROME2'),
        e(0x0028, 0x0010, 'US', CT.size),
        e(0x0028, 0x0011, 'US', CT.size),
        e(0x0028, 0x0030, 'DS', `${CT.spacing}\\${CT.spacing}`),
        e(0x0028, 0x0100, 'US', 16),
        e(0x0028, 0x0101, 'US', 16),
        e(0x0028, 0x0102, 'US', 15),
        e(0x0028, 0x0103, 'US', 0),
        e(0x0028, 0x1050, 'DS', 40),
        e(0x0028, 0x1051, 'DS', 400),
        e(0x0028, 0x1052, 'DS', -1024),
        e(0x0028, 0x1053, 'DS', 1),
        e(0x7fe0, 0x0010, 'OW', uint16Pixels(pixels)),
      ],
    })
  }

  // SEG: tumour (automatic, "AI") and organ (manual), binary frames on the CT slices
  {
    const segments = [
      { number: 1, label: 'Tumor', shape: TUMOUR, type: 'AUTOMATIC', lab: [53, 80, 67] },
      { number: 2, label: 'Organ', shape: ORGAN, type: 'MANUAL', lab: [87, -20, 60] },
    ]
    const frames = []
    for (const segment of segments)
      for (let k = 0; k < CT.slices; k++) {
        const bits = []
        for (let j = 0; j < CT.size; j++) for (let i = 0; i < CT.size; i++) bits.push(inside(segment.shape, world(i, j, k)) ? 1 : 0)
        if (bits.some(Boolean)) frames.push({ segment: segment.number, k, bits })
      }
    const packed = new Uint8Array((frames.length * CT.size * CT.size) / 8)
    frames.flatMap((f) => f.bits).forEach((bit, i) => bit && (packed[i >> 3] |= 1 << (i & 7)))
    writeDicomFile(join(out, 'seg.dcm'), {
      sopClassUID: SOP.seg,
      sopInstanceUID: `${ROOT}.1.10.1`,
      elements: [
        ...common,
        ...series(`${ROOT}.1.10`, 10, 'SEG', 'Tumor segmentation (AI)'),
        e(0x0008, 0x0070, 'LO', 'DicomLens test AI'),
        e(0x0020, 0x0013, 'IS', 1),
        e(0x0062, 0x0001, 'CS', 'BINARY'),
        e(0x0070, 0x0080, 'CS', 'TUMOR_SEG'),
        sq(0x0062, 0x0002, segments.map((s) => [
          e(0x0062, 0x0004, 'US', s.number),
          e(0x0062, 0x0005, 'LO', s.label),
          e(0x0062, 0x0008, 'CS', s.type),
          ...(s.type === 'AUTOMATIC' ? [e(0x0062, 0x0009, 'LO', 'TumorNet 1.0')] : []),
          e(0x0062, 0x000d, 'US', s.lab.map((v, i) => (i === 0 ? Math.round((v * 65535) / 100) : Math.round(((v + 128) * 65535) / 255)))),
          sq(0x0062, 0x0003, [code('49755003', 'SCT', 'Morphologically Altered Structure')]),
          sq(0x0062, 0x000f, [code('4147007', 'SCT', 'Mass')]),
        ])),
        sq(0x0008, 0x1115, [[e(0x0020, 0x000e, 'UI', ctSeries), sq(0x0008, 0x114a, allImages)]]),
        sq(0x5200, 0x9229, [[
          sq(0x0020, 0x9116, [[orientation]]),
          sq(0x0028, 0x9110, [[e(0x0028, 0x0030, 'DS', `${CT.spacing}\\${CT.spacing}`), e(0x0018, 0x0050, 'DS', CT.step)]]),
        ]]),
        sq(0x5200, 0x9230, frames.map((f) => [
          sq(0x0008, 0x9124, [[sq(0x0008, 0x2112, [[e(0x0008, 0x1150, 'UI', SOP.ct), e(0x0008, 0x1155, 'UI', ctSop(f.k))]])]]),
          sq(0x0020, 0x9113, [[e(0x0020, 0x0032, 'DS', ds(world(0, 0, f.k)))]]),
          sq(0x0062, 0x000a, [[e(0x0062, 0x000b, 'US', f.segment)]]),
        ])),
        e(0x0028, 0x0002, 'US', 1),
        e(0x0028, 0x0004, 'CS', 'MONOCHROME2'),
        e(0x0028, 0x0008, 'IS', frames.length),
        e(0x0028, 0x0010, 'US', CT.size),
        e(0x0028, 0x0011, 'US', CT.size),
        e(0x0028, 0x0100, 'US', 1),
        e(0x0028, 0x0101, 'US', 1),
        e(0x0028, 0x0102, 'US', 0),
        e(0x0028, 0x0103, 'US', 0),
        e(0x7fe0, 0x0010, 'OB', packed),
      ],
    })
  }

  // RTSTRUCT: PTV (tumour + 2 mm) and organ, circles on each CT slice they cross
  {
    const rois = [
      { number: 1, name: 'PTV', shape: { ...TUMOUR, radius: TUMOUR.radius + 2 }, color: '255\\0\\0', type: 'PTV' },
      { number: 2, name: 'Organ', shape: ORGAN, color: '0\\160\\255', type: 'ORGAN' },
    ]
    const contours = (shape) => {
      const items = []
      for (let k = 0; k < CT.slices; k++) {
        const dz = zOf(k) - shape.center[2]
        if (Math.abs(dz) >= shape.radius) continue
        const r = Math.sqrt(shape.radius ** 2 - dz ** 2)
        const points = Array.from({ length: 24 }, (_, n) => {
          const a = (n / 24) * 2 * Math.PI
          return [shape.center[0] + r * Math.cos(a), shape.center[1] + r * Math.sin(a), zOf(k)]
        })
        items.push([
          sq(0x3006, 0x0016, [[e(0x0008, 0x1150, 'UI', SOP.ct), e(0x0008, 0x1155, 'UI', ctSop(k))]]),
          e(0x3006, 0x0042, 'CS', 'CLOSED_PLANAR'),
          e(0x3006, 0x0046, 'IS', points.length),
          e(0x3006, 0x0050, 'DS', ds(points.flat())),
        ])
      }
      return items
    }
    writeDicomFile(join(out, 'rtstruct.dcm'), {
      sopClassUID: SOP.rtstruct,
      sopInstanceUID: `${ROOT}.1.11.1`,
      elements: [
        ...common,
        ...series(`${ROOT}.1.11`, 11, 'RTSTRUCT', 'Structures'),
        e(0x3006, 0x0002, 'SH', 'PLAN1'),
        sq(0x3006, 0x0010, [[e(0x0020, 0x0052, 'UI', forUid)]]),
        sq(0x3006, 0x0020, rois.map((r) => [e(0x3006, 0x0022, 'IS', r.number), e(0x3006, 0x0024, 'UI', forUid), e(0x3006, 0x0026, 'LO', r.name), e(0x3006, 0x0036, 'CS', 'MANUAL')])),
        sq(0x3006, 0x0039, rois.map((r) => [e(0x3006, 0x002a, 'IS', r.color), e(0x3006, 0x0084, 'IS', r.number), sq(0x3006, 0x0040, contours(r.shape))])),
        sq(0x3006, 0x0080, rois.map((r) => [e(0x3006, 0x0082, 'IS', r.number), e(0x3006, 0x0084, 'IS', r.number), e(0x3006, 0x00a4, 'CS', r.type)])),
      ],
    })
  }

  // RTDOSE: 32² × 12 at 4 mm, 62 Gy inside the PTV, falling off outside it
  {
    const size = 32
    const frames = 12
    const values = []
    for (let k = 0; k < frames; k++)
      for (let j = 0; j < size; j++)
        for (let i = 0; i < size; i++) {
          const p = [-64 + i * 4, -64 + j * 4, -k * 4]
          const d = Math.hypot(p[0] - TUMOUR.center[0], p[1] - TUMOUR.center[1], p[2] - TUMOUR.center[2])
          const gy = d < 12 ? 62 : 62 * Math.exp(-((d - 12) ** 2) / (2 * 10 ** 2))
          values.push(Math.round(gy / 0.001))
        }
    writeDicomFile(join(out, 'rtdose.dcm'), {
      sopClassUID: SOP.rtdose,
      sopInstanceUID: `${ROOT}.1.12.1`,
      elements: [
        ...common,
        ...series(`${ROOT}.1.12`, 12, 'RTDOSE', 'Dose'),
        e(0x0020, 0x0013, 'IS', 1),
        e(0x0020, 0x0032, 'DS', '-64\\-64\\0'),
        orientation,
        e(0x0028, 0x0002, 'US', 1),
        e(0x0028, 0x0004, 'CS', 'MONOCHROME2'),
        e(0x0028, 0x0008, 'IS', frames),
        e(0x0028, 0x0009, 'AT', new Uint8Array([0x04, 0x30, 0x0c, 0x00])),
        e(0x0028, 0x0010, 'US', size),
        e(0x0028, 0x0011, 'US', size),
        e(0x0028, 0x0030, 'DS', '4\\4'),
        e(0x0028, 0x0100, 'US', 16),
        e(0x0028, 0x0101, 'US', 16),
        e(0x0028, 0x0102, 'US', 15),
        e(0x0028, 0x0103, 'US', 0),
        e(0x3004, 0x0002, 'CS', 'GY'),
        e(0x3004, 0x0004, 'CS', 'PHYSICAL'),
        e(0x3004, 0x000a, 'CS', 'PLAN'),
        e(0x3004, 0x000c, 'DS', Array.from({ length: frames }, (_, k) => -k * 4).join('\\')),
        e(0x3004, 0x000e, 'DS', '0.001'),
        sq(0x300c, 0x0002, [[e(0x0008, 0x1150, 'UI', SOP.rtplan), e(0x0008, 0x1155, 'UI', `${ROOT}.1.13.1`)]]),
        e(0x7fe0, 0x0010, 'OW', uint16Pixels(values)),
      ],
    })
  }

  // RTPLAN: 60 Gy in 30 fractions, two 6 MV beams
  {
    const beams = [
      { number: 1, name: 'AP', gantry: 0, mu: 112.5 },
      { number: 2, name: 'RLAT', gantry: 270, mu: 98.4 },
    ]
    writeDicomFile(join(out, 'rtplan.dcm'), {
      sopClassUID: SOP.rtplan,
      sopInstanceUID: `${ROOT}.1.13.1`,
      elements: [
        ...common,
        ...series(`${ROOT}.1.13`, 13, 'RTPLAN', 'Plan'),
        e(0x300a, 0x0002, 'SH', 'PLAN1'),
        e(0x300a, 0x0003, 'LO', 'Tumor 60 Gy'),
        e(0x300a, 0x0006, 'DA', '20260301'),
        e(0x300a, 0x000c, 'CS', 'PATIENT'),
        sq(0x300a, 0x0010, [[e(0x300a, 0x0012, 'IS', 1), e(0x300a, 0x0014, 'CS', 'SITE'), e(0x300a, 0x0016, 'LO', 'PTV'), e(0x300a, 0x0020, 'CS', 'TARGET'), e(0x300a, 0x0026, 'DS', 60)]]),
        sq(0x300a, 0x0070, [[
          e(0x300a, 0x0071, 'IS', 1),
          e(0x300a, 0x0078, 'IS', 30),
          e(0x300a, 0x0080, 'IS', beams.length),
          sq(0x300c, 0x0004, beams.map((b) => [e(0x300a, 0x0086, 'DS', b.mu), e(0x300c, 0x0006, 'IS', b.number)])),
        ]]),
        sq(0x300a, 0x00b0, beams.map((b) => [
          e(0x300a, 0x00b2, 'SH', 'LINAC1'),
          e(0x300a, 0x00c0, 'IS', b.number),
          e(0x300a, 0x00c2, 'LO', b.name),
          e(0x300a, 0x00c4, 'CS', 'STATIC'),
          e(0x300a, 0x00c6, 'CS', 'PHOTON'),
          e(0x300a, 0x00ce, 'CS', 'TREATMENT'),
          e(0x300a, 0x0110, 'IS', 2),
          sq(0x300a, 0x0111, [[
            e(0x300a, 0x0112, 'IS', 0),
            e(0x300a, 0x0114, 'DS', 6),
            e(0x300a, 0x011e, 'DS', b.gantry),
            e(0x300a, 0x0120, 'DS', 0),
            e(0x300a, 0x0122, 'DS', 0),
            e(0x300a, 0x012c, 'DS', ds(TUMOUR.center)),
          ]]),
        ])),
      ],
    })
  }

  // Parametric map: ADC (µm²/s) as float pixels, 32² × 12 at 4 mm
  {
    const size = 32
    const frames = 12
    const values = []
    for (let k = 0; k < frames; k++)
      for (let j = 0; j < size; j++)
        for (let i = 0; i < size; i++) {
          const p = [-64 + i * 4, -64 + j * 4, -k * 4]
          const body = (p[0] / 56) ** 2 + (p[1] / 40) ** 2 < 1
          values.push(inside(TUMOUR, p) ? 750.5 : body ? 2000 : 0)
        }
    writeDicomFile(join(out, 'adc_map.dcm'), {
      sopClassUID: SOP.pmap,
      sopInstanceUID: `${ROOT}.1.14.1`,
      elements: [
        ...common,
        ...series(`${ROOT}.1.14`, 14, 'MR', 'ADC map'),
        e(0x0008, 0x0008, 'CS', 'DERIVED\\PRIMARY'),
        e(0x0020, 0x0013, 'IS', 1),
        e(0x0028, 0x0002, 'US', 1),
        e(0x0028, 0x0004, 'CS', 'MONOCHROME2'),
        e(0x0028, 0x0008, 'IS', frames),
        e(0x0028, 0x0010, 'US', size),
        e(0x0028, 0x0011, 'US', size),
        e(0x0028, 0x0100, 'US', 32),
        e(0x0028, 0x0101, 'US', 32),
        e(0x0028, 0x0102, 'US', 31),
        sq(0x5200, 0x9229, [[
          sq(0x0020, 0x9116, [[orientation]]),
          sq(0x0028, 0x9110, [[e(0x0028, 0x0030, 'DS', '4\\4'), e(0x0018, 0x0050, 'DS', 4)]]),
          sq(0x0040, 0x9096, [[
            e(0x0040, 0x9210, 'SH', 'ADC'),
            e(0x0040, 0x9224, 'FD', new Uint8Array(Float64Array.of(0).buffer)),
            e(0x0040, 0x9225, 'FD', new Uint8Array(Float64Array.of(1).buffer)),
            sq(0x0040, 0x08ea, [code('um2/s', 'UCUM', 'um2/s')]),
          ]]),
        ]]),
        sq(0x5200, 0x9230, Array.from({ length: frames }, (_, k) => [sq(0x0020, 0x9113, [[e(0x0020, 0x0032, 'DS', `-64\\-64\\${-k * 4}`)]])])),
        e(0x7fe0, 0x0008, 'OF', floats(values)),
      ],
    })
  }

  // Measurement SR (TID 1500) on slice 11: a length, an ellipse area and a point
  {
    const image = [sq(0x0008, 0x1199, [[e(0x0008, 0x1150, 'UI', SOP.ct), e(0x0008, 0x1155, 'UI', ctSop(10))]])]
    const imageItem = [e(0x0040, 0xa010, 'CS', 'SELECTED FROM'), e(0x0040, 0xa040, 'CS', 'IMAGE'), ...image]
    const scoord = (type, points) => [
      e(0x0040, 0xa010, 'CS', 'INFERRED FROM'),
      e(0x0040, 0xa040, 'CS', 'SCOORD'),
      e(0x0070, 0x0023, 'CS', type),
      e(0x0070, 0x0022, 'FL', floats(points)),
      sq(0x0040, 0xa730, [imageItem]),
    ]
    const num = (concept, value, unit, coords) => [
      e(0x0040, 0xa010, 'CS', 'CONTAINS'),
      e(0x0040, 0xa040, 'CS', 'NUM'),
      sq(0x0040, 0xa043, [concept]),
      sq(0x0040, 0xa300, [[e(0x0040, 0xa30a, 'DS', value), sq(0x0040, 0x08ea, [unit])]]),
      sq(0x0040, 0xa730, [coords]),
    ]
    const group = (id, measurement) => [
      e(0x0040, 0xa010, 'CS', 'CONTAINS'),
      e(0x0040, 0xa040, 'CS', 'CONTAINER'),
      e(0x0040, 0xa050, 'CS', 'SEPARATE'),
      sq(0x0040, 0xa043, [code('125007', 'DCM', 'Measurement Group')]),
      sq(0x0040, 0xa730, [
        [e(0x0040, 0xa010, 'CS', 'HAS OBS CONTEXT'), e(0x0040, 0xa040, 'CS', 'TEXT'), sq(0x0040, 0xa043, [code('112039', 'DCM', 'Tracking Identifier')]), e(0x0040, 0xa160, 'UT', id)],
        measurement,
      ]),
    ]
    const mm = code('mm', 'UCUM', 'millimeter')
    writeDicomFile(join(out, 'measurements_sr.dcm'), {
      sopClassUID: SOP.comprehensiveSr,
      sopInstanceUID: `${ROOT}.1.15.1`,
      elements: [
        ...common,
        ...series(`${ROOT}.1.15`, 15, 'SR', 'Measurements'),
        e(0x0020, 0x0013, 'IS', 1),
        e(0x0040, 0xa491, 'CS', 'COMPLETE'),
        e(0x0040, 0xa493, 'CS', 'UNVERIFIED'),
        e(0x0040, 0xa040, 'CS', 'CONTAINER'),
        e(0x0040, 0xa050, 'CS', 'SEPARATE'),
        sq(0x0040, 0xa043, [code('126000', 'DCM', 'Imaging Measurement Report')]),
        sq(0x0040, 0xa504, [[e(0x0008, 0x0105, 'CS', 'DCMR'), e(0x0040, 0xdb00, 'CS', '1500')]]),
        sq(0x0040, 0xa730, [[
          e(0x0040, 0xa010, 'CS', 'CONTAINS'),
          e(0x0040, 0xa040, 'CS', 'CONTAINER'),
          e(0x0040, 0xa050, 'CS', 'SEPARATE'),
          sq(0x0040, 0xa043, [code('126010', 'DCM', 'Imaging Measurements')]),
          sq(0x0040, 0xa730, [
            group('Lesion length', num(code('410668003', 'SCT', 'Length'), 30, mm, scoord('POLYLINE', [30, 30, 45, 30]))),
            group('Lesion area', num(code('42798000', 'SCT', 'Area'), 314.2, code('mm2', 'UCUM', 'square millimeter'), scoord('ELLIPSE', [32, 24, 42, 24, 37, 19, 37, 29]))),
            group('Organ', num(code('112031', 'DCM', 'Attenuation Coefficient'), 20, code("[hnsf'U]", 'UCUM', 'Hounsfield unit'), scoord('POINT', [21, 36]))),
          ]),
        ]]),
      ],
    })
  }

  // Key object selection: slices 10 and 11
  {
    const keys = [9, 10]
    writeDicomFile(join(out, 'key_images.dcm'), {
      sopClassUID: SOP.ko,
      sopInstanceUID: `${ROOT}.1.16.1`,
      elements: [
        ...common,
        ...series(`${ROOT}.1.16`, 16, 'KO', 'Key images'),
        e(0x0020, 0x0013, 'IS', 1),
        e(0x0040, 0xa040, 'CS', 'CONTAINER'),
        e(0x0040, 0xa050, 'CS', 'SEPARATE'),
        sq(0x0040, 0xa043, [code('113000', 'DCM', 'Of Interest')]),
        sq(0x0040, 0xa504, [[e(0x0008, 0x0105, 'CS', 'DCMR'), e(0x0040, 0xdb00, 'CS', '2010')]]),
        sq(0x0040, 0xa375, [[e(0x0020, 0x000d, 'UI', studyUid), sq(0x0008, 0x1115, [[e(0x0020, 0x000e, 'UI', ctSeries), sq(0x0008, 0x1199, keys.map((k) => allImages[k]))]])]]),
        sq(0x0040, 0xa730, [
          [e(0x0040, 0xa010, 'CS', 'CONTAINS'), e(0x0040, 0xa040, 'CS', 'TEXT'), sq(0x0040, 0xa043, [code('113012', 'DCM', 'Key Object Description')]), e(0x0040, 0xa160, 'UT', 'Tumor slices')],
          ...keys.map((k) => [e(0x0040, 0xa010, 'CS', 'CONTAINS'), e(0x0040, 0xa040, 'CS', 'IMAGE'), sq(0x0008, 0x1199, [allImages[k]])]),
        ]),
      ],
    })
  }

  // Presentation state for the whole CT series
  {
    writeDicomFile(join(out, 'presentation_state.dcm'), {
      sopClassUID: SOP.gsps,
      sopInstanceUID: `${ROOT}.1.17.1`,
      elements: [
        ...common,
        ...series(`${ROOT}.1.17`, 17, 'PR', 'Tumor view'),
        e(0x0020, 0x0013, 'IS', 1),
        e(0x0070, 0x0080, 'CS', 'TUMOR VIEW'),
        e(0x0070, 0x0081, 'LO', 'Narrow window, rotated and zoomed'),
        sq(0x0008, 0x1115, [[e(0x0020, 0x000e, 'UI', ctSeries), sq(0x0008, 0x1140, allImages)]]),
        sq(0x0028, 0x3110, [[e(0x0028, 0x1050, 'DS', 60), e(0x0028, 0x1051, 'DS', 120)]]),
        e(0x0070, 0x0041, 'CS', 'Y'),
        e(0x0070, 0x0042, 'US', 90),
        sq(0x0070, 0x005a, [[e(0x0070, 0x0052, 'SL', int32s([17, 17])), e(0x0070, 0x0053, 'SL', int32s([48, 48])), e(0x0070, 0x0100, 'CS', 'SCALE TO FIT')]]),
        e(0x0018, 0x1600, 'CS', 'CIRCULAR'),
        e(0x0018, 0x1610, 'IS', '32\\32'),
        e(0x0018, 0x1612, 'IS', 28),
        sq(0x0070, 0x0060, [[e(0x0070, 0x0002, 'CS', 'NOTES'), e(0x0070, 0x0062, 'IS', 1)]]),
        sq(0x0070, 0x0001, [[
          e(0x0070, 0x0002, 'CS', 'NOTES'),
          sq(0x0008, 0x1140, [allImages[10]]),
          sq(0x0070, 0x0008, [[e(0x0070, 0x0006, 'ST', 'Tumor'), e(0x0070, 0x0004, 'CS', 'PIXEL'), e(0x0070, 0x0014, 'FL', floats([44, 20])), e(0x0070, 0x0015, 'CS', 'N')]]),
          sq(0x0070, 0x0009, [[
            e(0x0070, 0x0005, 'CS', 'PIXEL'),
            e(0x0070, 0x0020, 'US', 2),
            e(0x0070, 0x0021, 'US', 5),
            e(0x0070, 0x0022, 'FL', floats([30, 22, 44, 22, 44, 36, 30, 36, 30, 22])),
            e(0x0070, 0x0023, 'CS', 'POLYLINE'),
            e(0x0070, 0x0024, 'CS', 'N'),
          ]]),
        ]]),
        e(0x2050, 0x0020, 'CS', 'IDENTITY'),
      ],
    })
  }
}

// --- waveforms ------------------------------------------------------------------------

const LEADS = [
  ['5.6.3-9-1', 'Lead I', 0.6],
  ['5.6.3-9-2', 'Lead II', 1],
  ['5.6.3-9-61', 'Lead III', 0.4],
  ['5.6.3-9-62', 'Lead aVR', -0.8],
  ['5.6.3-9-63', 'Lead aVL', 0.2],
  ['5.6.3-9-64', 'Lead aVF', 0.7],
  ['5.6.3-9-3', 'Lead V1', -0.5],
  ['5.6.3-9-4', 'Lead V2', 0.3],
  ['5.6.3-9-5', 'Lead V3', 0.7],
  ['5.6.3-9-6', 'Lead V4', 1.2],
  ['5.6.3-9-7', 'Lead V5', 1.1],
  ['5.6.3-9-8', 'Lead V6', 0.8],
]

/** One heartbeat (mV) at t seconds after its start. */
function beat(t) {
  const wave = (amplitude, centre, width) => amplitude * Math.exp(-((t - centre) ** 2) / (2 * width ** 2))
  return wave(0.15, 0.2, 0.025) + wave(-0.1, 0.33, 0.01) + wave(1.2, 0.36, 0.012) + wave(-0.25, 0.39, 0.012) + wave(0.3, 0.62, 0.04)
}

function waveformFile(path, { sopClassUID, uid, modality, description, rate, channels, samples, sensitivity, unit, interpretation = 'SS', label }) {
  const data = Buffer.alloc(samples * channels.length * 2)
  for (let n = 0; n < samples; n++) channels.forEach((channel, c) => data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(channel.value(n / rate) / sensitivity))), (n * channels.length + c) * 2))
  writeDicomFile(path, {
    sopClassUID,
    sopInstanceUID: `${uid}.1`,
    elements: [
      ...patient('Sample^Waveform', 'SAMPLE-WAVE'),
      ...study(`${ROOT}.2`, 'Waveforms'),
      ...series(uid, 1, modality, description),
      e(0x0020, 0x0013, 'IS', 1),
      e(0x0008, 0x0023, 'DA', '20260301'),
      e(0x0008, 0x0033, 'TM', '101500'),
      sq(0x5400, 0x0100, [[
        e(0x003a, 0x0004, 'CS', 'ORIGINAL'),
        e(0x003a, 0x0005, 'US', channels.length),
        e(0x003a, 0x0010, 'UL', samples),
        e(0x003a, 0x001a, 'DS', rate),
        e(0x003a, 0x0020, 'SH', label),
        sq(0x003a, 0x0200, channels.map((channel) => [
          sq(0x003a, 0x0208, [code(channel.code, channel.scheme ?? 'SCPECG', channel.name)]),
          e(0x003a, 0x0210, 'DS', sensitivity),
          sq(0x003a, 0x0211, [code(unit[0], 'UCUM', unit[1])]),
          e(0x003a, 0x0212, 'DS', 1),
          e(0x003a, 0x0213, 'DS', 0),
          e(0x003a, 0x0214, 'DS', 0),
          e(0x003a, 0x021a, 'US', 16),
        ])),
        e(0x5400, 0x1004, 'US', 16),
        e(0x5400, 0x1006, 'CS', interpretation),
        e(0x5400, 0x1010, 'OW', new Uint8Array(data)),
      ]]),
    ],
  })
}

function writeWaveforms(out) {
  const rr = 0.8
  waveformFile(join(out, 'ecg_12lead.dcm'), {
    sopClassUID: SOP.ecg,
    uid: `${ROOT}.2.1`,
    modality: 'ECG',
    description: '12-lead ECG',
    rate: 500,
    samples: 5000,
    sensitivity: 5,
    unit: ['uV', 'microvolt'],
    label: 'RHYTHM',
    channels: LEADS.map(([codeValue, name, gain]) => ({ code: codeValue, name, value: (t) => gain * beat(t % rr) * 1000 })),
  })
  const pressure = (systolic, diastolic) => (t) => {
    const phase = (t % rr) / rr
    return diastolic + (systolic - diastolic) * (phase < 0.35 ? Math.sin((phase / 0.35) * Math.PI * 0.5) : Math.exp(-(phase - 0.35) * 4))
  }
  waveformFile(join(out, 'hemodynamic.dcm'), {
    sopClassUID: SOP.hemodynamic,
    uid: `${ROOT}.2.2`,
    modality: 'HD',
    description: 'Pressures',
    rate: 250,
    samples: 1000,
    sensitivity: 0.1,
    unit: ['mm[Hg]', 'mmHg'],
    label: 'PRESSURE',
    channels: [
      { code: '2.1.1', scheme: 'MDC', name: 'Arterial pressure', value: pressure(120, 80) },
      { code: '2.1.2', scheme: 'MDC', name: 'Pulmonary pressure', value: pressure(25, 10) },
    ],
  })
  waveformFile(join(out, 'voice.dcm'), {
    sopClassUID: SOP.audio,
    uid: `${ROOT}.2.3`,
    modality: 'AU',
    description: 'Dictation',
    rate: 8000,
    samples: 8000,
    sensitivity: 1,
    unit: ['1', 'no units'],
    label: 'VOICE',
    channels: [{ code: '1', scheme: 'DCM', name: 'Voice', value: (t) => 8000 * Math.sin(2 * Math.PI * 440 * t) * Math.min(1, t * 20, (1 - t) * 20) }],
  })
}

// --- whole-slide microscopy -----------------------------------------------------------------

function writeSlide(out) {
  const tile = 128
  const width = 512
  const height = 384
  // Deterministic "nuclei" in level-0 pixels.
  const nuclei = Array.from({ length: 90 }, (_, n) => [(n * 97 + 13) % width, (n * 61 + 29) % height])
  const colour = (x, y) => {
    for (const [cx, cy] of nuclei) if (Math.hypot(x - cx, y - cy) < 7) return [90, 40, 140]
    return x > 448 && y > 320 ? [255, 255, 255] : [235, 190, 210]
  }
  const levels = [
    { scale: 1, spacing: 0.0005, uid: `${ROOT}.3.1.1`, type: 'ORIGINAL\\PRIMARY\\VOLUME\\NONE' },
    { scale: 2, spacing: 0.001, uid: `${ROOT}.3.1.2`, type: 'DERIVED\\PRIMARY\\VOLUME\\RESAMPLED' },
  ]
  levels.forEach((level, index) => {
    const w = width / level.scale
    const h = height / level.scale
    const across = Math.ceil(w / tile)
    const down = Math.ceil(h / tile)
    const pixels = Buffer.alloc(across * down * tile * tile * 3, 255)
    let offset = 0
    for (let ty = 0; ty < down; ty++)
      for (let tx = 0; tx < across; tx++)
        for (let y = 0; y < tile; y++)
          for (let x = 0; x < tile; x++) {
            const px = tx * tile + x
            const py = ty * tile + y
            if (px < w && py < h) Buffer.from(colour(px * level.scale, py * level.scale)).copy(pixels, offset)
            offset += 3
          }
    writeDicomFile(join(out, `level_${index}.dcm`), {
      sopClassUID: SOP.sm,
      sopInstanceUID: level.uid,
      elements: [
        ...patient('Sample^Slide', 'SAMPLE-SM'),
        ...study(`${ROOT}.3`, 'Pathology'),
        ...series(`${ROOT}.3.1`, 1, 'SM', 'H&E slide'),
        e(0x0008, 0x0008, 'CS', level.type),
        e(0x0020, 0x0013, 'IS', index + 1),
        e(0x0020, 0x0052, 'UI', `${ROOT}.3.200`),
        e(0x0040, 0x0512, 'LO', 'SLIDE-1'),
        e(0x0020, 0x9311, 'CS', 'TILED_FULL'),
        e(0x0048, 0x0001, 'FL', floats([width * 0.0005])),
        e(0x0048, 0x0002, 'FL', floats([height * 0.0005])),
        e(0x0048, 0x0006, 'UL', w),
        e(0x0048, 0x0007, 'UL', h),
        sq(0x0048, 0x0008, [[e(0x0040, 0x072a, 'DS', 0), e(0x0040, 0x073a, 'DS', 0)]]),
        sq(0x5200, 0x9229, [[sq(0x0028, 0x9110, [[e(0x0028, 0x0030, 'DS', `${level.spacing}\\${level.spacing}`), e(0x0018, 0x0050, 'DS', 0.004)]])]]),
        e(0x0028, 0x0002, 'US', 3),
        e(0x0028, 0x0004, 'CS', 'RGB'),
        e(0x0028, 0x0006, 'US', 0),
        e(0x0028, 0x0008, 'IS', across * down),
        e(0x0028, 0x0010, 'US', tile),
        e(0x0028, 0x0011, 'US', tile),
        e(0x0028, 0x0100, 'US', 8),
        e(0x0028, 0x0101, 'US', 8),
        e(0x0028, 0x0102, 'US', 7),
        e(0x0028, 0x0103, 'US', 0),
        e(0x7fe0, 0x0010, 'OB', new Uint8Array(pixels)),
      ],
    })
  })
}

// --- ophthalmology, dental, mammography ------------------------------------------------------

const gray8 = (rows, cols, frames = 1) => [
  e(0x0028, 0x0002, 'US', 1),
  e(0x0028, 0x0004, 'CS', 'MONOCHROME2'),
  ...(frames > 1 ? [e(0x0028, 0x0008, 'IS', frames)] : []),
  e(0x0028, 0x0010, 'US', rows),
  e(0x0028, 0x0011, 'US', cols),
  e(0x0028, 0x0100, 'US', 8),
  e(0x0028, 0x0101, 'US', 8),
  e(0x0028, 0x0102, 'US', 7),
  e(0x0028, 0x0103, 'US', 0),
]

function writeSpecialImages(out) {
  const eyes = [...patient('Sample^Eye', 'SAMPLE-EYE'), ...study(`${ROOT}.4`, 'Ophthalmology')]
  {
    const size = 64
    const rgb = Buffer.alloc(size * size * 3)
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const r = Math.hypot(x - 32, y - 32)
        const disc = Math.hypot(x - 42, y - 30) < 6
        const vessel = Math.abs(Math.sin((x - 42) / 6) * 8 - (y - 30)) < 1.2 && r < 28
        const c = r > 30 ? [0, 0, 0] : disc ? [250, 230, 160] : vessel ? [140, 20, 20] : [210, 90, 40]
        Buffer.from(c).copy(rgb, (y * size + x) * 3)
      }
    writeDicomFile(join(out, 'op_fundus.dcm'), {
      sopClassUID: SOP.op,
      sopInstanceUID: `${ROOT}.4.1.1`,
      elements: [
        ...eyes,
        ...series(`${ROOT}.4.1`, 1, 'OP', 'Fundus photo'),
        e(0x0020, 0x0013, 'IS', 1),
        e(0x0020, 0x0060, 'CS', 'R'),
        e(0x0028, 0x0002, 'US', 3),
        e(0x0028, 0x0004, 'CS', 'RGB'),
        e(0x0028, 0x0006, 'US', 0),
        e(0x0028, 0x0010, 'US', size),
        e(0x0028, 0x0011, 'US', size),
        e(0x0028, 0x0100, 'US', 8),
        e(0x0028, 0x0101, 'US', 8),
        e(0x0028, 0x0102, 'US', 7),
        e(0x0028, 0x0103, 'US', 0),
        e(0x7fe0, 0x0010, 'OB', new Uint8Array(rgb)),
      ],
    })
    const frames = 8
    const oct = Buffer.alloc(size * size * frames)
    for (let f = 0; f < frames; f++)
      for (let y = 0; y < size; y++)
        for (let x = 0; x < size; x++) {
          const surface = 24 + 4 * Math.sin(x / 10 + f / 3) + (Math.abs(x - 32) < 8 ? 5 * Math.cos(((x - 32) / 8) * Math.PI * 0.5) : 0)
          oct[f * size * size + y * size + x] = y > surface && y < surface + 18 ? 200 - (y - surface) * 6 : 20
        }
    writeDicomFile(join(out, 'opt_oct.dcm'), {
      sopClassUID: SOP.opt,
      sopInstanceUID: `${ROOT}.4.2.1`,
      elements: [...eyes, ...series(`${ROOT}.4.2`, 2, 'OPT', 'Macula OCT'), e(0x0020, 0x0013, 'IS', 1), e(0x0020, 0x0060, 'CS', 'R'), ...gray8(size, size, frames), e(0x7fe0, 0x0010, 'OB', new Uint8Array(oct))],
    })
  }

  const teeth = [...patient('Sample^Dental', 'SAMPLE-DENT'), ...study(`${ROOT}.5`, 'Dental', '20260302')]
  {
    const [rows, cols] = [48, 64]
    const io = Buffer.alloc(rows * cols)
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++) {
        const tooth = [16, 40].some((cx) => Math.abs(x - cx) < 9 - Math.max(0, y - 30) / 3 && y > 4 && y < 46)
        io[y * cols + x] = tooth ? (Math.abs(x - 16) < 2 || Math.abs(x - 40) < 2 ? 120 : 220) : 40
      }
    writeDicomFile(join(out, 'io_bitewing.dcm'), {
      sopClassUID: SOP.io,
      sopInstanceUID: `${ROOT}.5.1.1`,
      elements: [
        ...teeth,
        ...series(`${ROOT}.5.1`, 1, 'IO', 'Bitewing'),
        e(0x0008, 0x0068, 'CS', 'FOR PRESENTATION'),
        e(0x0020, 0x0013, 'IS', 1),
        e(0x0028, 0x1040, 'CS', 'LIN'),
        e(0x0028, 0x1041, 'SS', new Uint8Array(Int16Array.of(1).buffer)),
        e(0x0018, 0x1164, 'DS', '0.1\\0.1'),
        ...gray8(rows, cols),
        e(0x7fe0, 0x0010, 'OB', new Uint8Array(io)),
      ],
    })
    const [prow, pcol] = [48, 128]
    const px = Buffer.alloc(prow * pcol)
    for (let y = 0; y < prow; y++)
      for (let x = 0; x < pcol; x++) {
        const arch = 18 + ((x - 64) / 64) ** 2 * 14
        px[y * pcol + x] = Math.abs(y - arch) < 6 && x % 8 > 1 ? 210 : Math.abs(y - arch - 12) < 4 ? 160 : 50
      }
    writeDicomFile(join(out, 'px_panoramic.dcm'), {
      sopClassUID: SOP.dx,
      sopInstanceUID: `${ROOT}.5.2.1`,
      elements: [...teeth, ...series(`${ROOT}.5.2`, 2, 'PX', 'Panoramic'), e(0x0008, 0x0068, 'CS', 'FOR PRESENTATION'), e(0x0020, 0x0013, 'IS', 1), e(0x0018, 0x1164, 'DS', '0.1\\0.1'), ...gray8(prow, pcol), e(0x7fe0, 0x0010, 'OB', new Uint8Array(px))],
    })
  }

  // Mammography: every view with the chest wall at the first column ("A" = rows run towards the nipple).
  const breast = [...patient('Sample^Mammo', 'SAMPLE-MG'), ...study(`${ROOT}.6`, 'Screening mammography', '20260305')]
  {
    const [rows, cols] = [80, 64]
    const views = [
      ['R', 'CC', 1],
      ['L', 'CC', 2],
      ['R', 'MLO', 3],
      ['L', 'MLO', 4],
    ]
    for (const [side, view, number] of views) {
      const pixels = []
      for (let y = 0; y < rows; y++)
        for (let x = 0; x < cols; x++) {
          const tissue = (x / 54) ** 2 + ((y - 40) / 36) ** 2 < 1
          const mass = side === 'R' && Math.hypot(x - 26, y - (view === 'CC' ? 34 : 44)) < 5
          const muscle = view === 'MLO' && x < 14 - y / 6
          pixels.push(mass ? 3800 : muscle ? 3000 : tissue ? 2000 + ((x * 37 + y * 11) % 300) : 100)
        }
      writeDicomFile(join(out, `mg_${side}${view}.dcm`), {
        sopClassUID: SOP.mg,
        sopInstanceUID: `${ROOT}.6.${number}.1`,
        elements: [
          ...breast,
          ...series(`${ROOT}.6.${number}`, number, 'MG', `${side} ${view}`),
          e(0x0008, 0x0068, 'CS', 'FOR PRESENTATION'),
          e(0x0020, 0x0013, 'IS', 1),
          e(0x0020, 0x0062, 'CS', side),
          e(0x0018, 0x5101, 'CS', view),
          e(0x0020, 0x0020, 'CS', `A\\${view === 'CC' ? (side === 'R' ? 'L' : 'R') : 'F'}`),
          e(0x0018, 0x1164, 'DS', '0.1\\0.1'),
          e(0x0028, 0x0002, 'US', 1),
          e(0x0028, 0x0004, 'CS', 'MONOCHROME2'),
          e(0x0028, 0x0010, 'US', rows),
          e(0x0028, 0x0011, 'US', cols),
          e(0x0028, 0x0100, 'US', 16),
          e(0x0028, 0x0101, 'US', 12),
          e(0x0028, 0x0102, 'US', 11),
          e(0x0028, 0x0103, 'US', 0),
          e(0x0028, 0x1050, 'DS', 2000),
          e(0x0028, 0x1051, 'DS', 4000),
          e(0x7fe0, 0x0010, 'OW', uint16Pixels(pixels)),
        ],
      })
    }
    // Tomosynthesis of the right CC: 10 slices 1 mm apart, the mass in slices 4–6.
    const frames = 10
    const tomo = []
    for (let f = 0; f < frames; f++)
      for (let y = 0; y < rows; y++)
        for (let x = 0; x < cols; x++) {
          const tissue = (x / 54) ** 2 + ((y - 40) / 36) ** 2 < 1
          tomo.push(Math.abs(f - 5) <= 1 && Math.hypot(x - 26, y - 34) < 5 ? 3800 : tissue ? 2000 : 100)
        }
    writeDicomFile(join(out, 'dbt_RCC.dcm'), {
      sopClassUID: SOP.dbt,
      sopInstanceUID: `${ROOT}.6.5.1`,
      elements: [
        ...breast,
        ...series(`${ROOT}.6.5`, 5, 'MG', 'R CC tomosynthesis'),
        e(0x0008, 0x0008, 'CS', 'DERIVED\\PRIMARY\\TOMOSYNTHESIS\\NONE'),
        e(0x0020, 0x0013, 'IS', 1),
        e(0x0020, 0x0062, 'CS', 'R'),
        e(0x0018, 0x5101, 'CS', 'CC'),
        e(0x0020, 0x0052, 'UI', `${ROOT}.6.200`),
        sq(0x5200, 0x9229, [[
          sq(0x0020, 0x9116, [[e(0x0020, 0x0037, 'DS', '1\\0\\0\\0\\1\\0')]]),
          sq(0x0028, 0x9110, [[e(0x0028, 0x0030, 'DS', '0.1\\0.1'), e(0x0018, 0x0050, 'DS', 1)]]),
          sq(0x0028, 0x9132, [[e(0x0028, 0x1050, 'DS', 2000), e(0x0028, 0x1051, 'DS', 4000)]]),
        ]]),
        sq(0x5200, 0x9230, Array.from({ length: frames }, (_, f) => [sq(0x0020, 0x9113, [[e(0x0020, 0x0032, 'DS', `0\\0\\${f}`)]])])),
        e(0x0028, 0x0002, 'US', 1),
        e(0x0028, 0x0004, 'CS', 'MONOCHROME2'),
        e(0x0028, 0x0008, 'IS', frames),
        e(0x0028, 0x0010, 'US', rows),
        e(0x0028, 0x0011, 'US', cols),
        e(0x0028, 0x0100, 'US', 16),
        e(0x0028, 0x0101, 'US', 12),
        e(0x0028, 0x0102, 'US', 11),
        e(0x0028, 0x0103, 'US', 0),
        e(0x7fe0, 0x0010, 'OW', uint16Pixels(tomo)),
      ],
    })
  }
}
