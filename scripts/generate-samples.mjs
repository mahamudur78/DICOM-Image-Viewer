// Generates synthetic, patient-free test files for formats beyond the CT
// phantom (see BLUEPRINT/TEST_DATA.md for what each one is for):
//   us_cine.dcm          ultrasound, RGB, 24-frame cine (multi-frame, frame time)
//   mr_mixed/            MR series holding two sequences (axial T1 + sagittal T2)
//   pet/                 PET with the tags needed for SUV (dose, half-life, weight)
//   dx_no_spacing.dcm    DX radiograph, MONOCHROME1, without pixel spacing
//   broken.dcm           a valid header cut off in the middle (unreadable)
//   notes.txt            not DICOM at all
//
// Usage: node scripts/generate-samples.mjs <output-dir>
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { UID_ROOT, dicomFile, element, uint16Pixels, writeDicomFile } from './dicom-writer.mjs'

const outDir = process.argv[2]
if (!outDir) {
  console.error('Usage: node scripts/generate-samples.mjs <output-dir>')
  process.exit(1)
}
mkdirSync(outDir, { recursive: true })

const ROOT = `${UID_ROOT}.50`
const SOP = {
  usMultiFrame: '1.2.840.10008.5.1.4.1.1.3.1',
  mr: '1.2.840.10008.5.1.4.1.1.4',
  pet: '1.2.840.10008.5.1.4.1.1.128',
  dx: '1.2.840.10008.5.1.4.1.1.1.1',
}

const patient = (name, id) => [
  element(0x0010, 0x0010, 'PN', name),
  element(0x0010, 0x0020, 'LO', id),
  element(0x0008, 0x0020, 'DA', '20260102'),
]

const grayscale16 = (rows, cols, photometric = 'MONOCHROME2') => [
  element(0x0028, 0x0002, 'US', 1),
  element(0x0028, 0x0004, 'CS', photometric),
  element(0x0028, 0x0010, 'US', rows),
  element(0x0028, 0x0011, 'US', cols),
  element(0x0028, 0x0100, 'US', 16),
  element(0x0028, 0x0101, 'US', 16),
  element(0x0028, 0x0102, 'US', 15),
  element(0x0028, 0x0103, 'US', 0),
]

// --- ultrasound cine: a bright blob moving across a speckled sector ----------
{
  const size = 64
  const frames = 24
  const pixels = Buffer.alloc(size * size * 3 * frames)
  for (let f = 0; f < frames; f++) {
    const cx = 12 + (40 * f) / (frames - 1)
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = ((f * size + y) * size + x) * 3
        const inSector = Math.abs(x - size / 2) < y * 0.7
        const blob = (x - cx) ** 2 + (y - 32) ** 2 < 36
        const speckle = ((x * 7 + y * 13 + f * 3) % 17) * 4
        const v = !inSector ? 0 : blob ? 230 : 40 + speckle
        pixels[i] = v
        pixels[i + 1] = blob ? 120 : v // the blob is tinted, like a colour Doppler spot
        pixels[i + 2] = v
      }
    }
  }
  writeDicomFile(join(outDir, 'us_cine.dcm'), {
    sopClassUID: SOP.usMultiFrame,
    sopInstanceUID: `${ROOT}.1.1`,
    elements: [
      ...patient('Sample^Ultrasound', 'SAMPLE-US'),
      element(0x0008, 0x0060, 'CS', 'US'),
      element(0x0008, 0x103e, 'LO', 'US cine'),
      element(0x0018, 0x0040, 'IS', 20), // cine rate
      element(0x0018, 0x1063, 'DS', 50), // frame time (ms)
      element(0x0020, 0x000d, 'UI', `${ROOT}.1`),
      element(0x0020, 0x000e, 'UI', `${ROOT}.1.2`),
      element(0x0020, 0x0011, 'IS', 1),
      element(0x0020, 0x0013, 'IS', 1),
      element(0x0028, 0x0002, 'US', 3),
      element(0x0028, 0x0004, 'CS', 'RGB'),
      element(0x0028, 0x0006, 'US', 0),
      element(0x0028, 0x0008, 'IS', frames),
      element(0x0028, 0x0009, 'AT', new Uint8Array([0x18, 0x00, 0x63, 0x10])), // frame increment pointer → frame time
      element(0x0028, 0x0010, 'US', size),
      element(0x0028, 0x0011, 'US', size),
      element(0x0028, 0x0100, 'US', 8),
      element(0x0028, 0x0101, 'US', 8),
      element(0x0028, 0x0102, 'US', 7),
      element(0x0028, 0x0103, 'US', 0),
      element(0x7fe0, 0x0010, 'OB', new Uint8Array(pixels)),
    ],
  })
}

// --- MR: two sequences (axial T1, sagittal T2) sharing one series UID ---------
{
  const dir = join(outDir, 'mr_mixed')
  mkdirSync(dir, { recursive: true })
  const size = 48
  const sequences = [
    { name: 'T1 AX', echo: 12, orientation: [1, 0, 0, 0, 1, 0], position: (k) => [-24, -24, -k * 4] },
    { name: 'T2 SAG', echo: 90, orientation: [0, 1, 0, 0, 0, -1], position: (k) => [-k * 4, -24, 24] },
  ]
  let instance = 1
  for (const [s, sequence] of sequences.entries()) {
    for (let k = 0; k < 6; k++) {
      const pixels = []
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const r = Math.hypot(x - size / 2, y - size / 2)
          pixels.push(r > 20 ? 0 : s === 0 ? 400 + 8 * r : 900 - 20 * r + 40 * k)
        }
      }
      writeDicomFile(join(dir, `mr_${instance}.dcm`), {
        sopClassUID: SOP.mr,
        sopInstanceUID: `${ROOT}.2.${instance}`,
        elements: [
          ...patient('Sample^MR', 'SAMPLE-MR'),
          element(0x0008, 0x0060, 'CS', 'MR'),
          element(0x0008, 0x103e, 'LO', 'Mixed T1/T2'),
          element(0x0018, 0x0024, 'SH', sequence.name),
          element(0x0018, 0x0050, 'DS', 4),
          element(0x0018, 0x0081, 'DS', sequence.echo),
          element(0x0020, 0x000d, 'UI', `${ROOT}.2`),
          element(0x0020, 0x000e, 'UI', `${ROOT}.2.100`),
          element(0x0020, 0x0011, 'IS', 1),
          element(0x0020, 0x0013, 'IS', instance),
          element(0x0020, 0x0032, 'DS', sequence.position(k).join('\\')),
          element(0x0020, 0x0037, 'DS', sequence.orientation.join('\\')),
          element(0x0020, 0x0052, 'UI', `${ROOT}.2.200`),
          ...grayscale16(size, size),
          element(0x0028, 0x0030, 'DS', '1\\1'),
          element(0x7fe0, 0x0010, 'OW', uint16Pixels(pixels)),
        ],
      })
      instance++
    }
  }
}

// --- PET: a hot sphere in a warm body, with SUV tags ---------------------------
{
  const dir = join(outDir, 'pet')
  mkdirSync(dir, { recursive: true })
  const size = 32
  const slices = 8
  const rescaleSlope = 2 // Bq/ml per stored value
  for (let k = 0; k < slices; k++) {
    const z = -k * 4
    const pixels = []
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const body = Math.hypot(x - 16, y - 16) < 13
        const lesion = Math.hypot(x - 20, y - 14, z + 14) < 5
        pixels.push(lesion ? 20000 : body ? 2500 : 50)
      }
    }
    writeDicomFile(join(dir, `pet_${k + 1}.dcm`), {
      sopClassUID: SOP.pet,
      sopInstanceUID: `${ROOT}.3.${k + 1}`,
      elements: [
        ...patient('Sample^PET', 'SAMPLE-PT'),
        element(0x0008, 0x0008, 'CS', 'ORIGINAL\\PRIMARY'),
        element(0x0008, 0x0021, 'DA', '20260102'),
        element(0x0008, 0x0022, 'DA', '20260102'),
        element(0x0008, 0x0031, 'TM', '100000'),
        element(0x0008, 0x0032, 'TM', '100000'),
        element(0x0008, 0x0060, 'CS', 'PT'),
        element(0x0008, 0x103e, 'LO', 'PET WB AC'),
        element(0x0010, 0x1030, 'DS', 70), // patient weight (kg)
        element(0x0018, 0x0050, 'DS', 4),
        element(0x0054, 0x0016, 'SQ', [
          [
            element(0x0018, 0x1072, 'TM', '090000'), // injection time
            element(0x0018, 0x1074, 'DS', 370000000), // total dose (Bq)
            element(0x0018, 0x1075, 'DS', 6586.2), // F-18 half-life (s)
          ],
        ]),
        element(0x0054, 0x1001, 'CS', 'BQML'),
        element(0x0054, 0x1102, 'CS', 'START'),
        element(0x0020, 0x000d, 'UI', `${ROOT}.3`),
        element(0x0020, 0x000e, 'UI', `${ROOT}.3.100`),
        element(0x0020, 0x0011, 'IS', 1),
        element(0x0020, 0x0013, 'IS', k + 1),
        element(0x0020, 0x0032, 'DS', `-16\\-16\\${z}`),
        element(0x0020, 0x0037, 'DS', '1\\0\\0\\0\\1\\0'),
        element(0x0020, 0x0052, 'UI', `${ROOT}.3.200`),
        ...grayscale16(size, size),
        element(0x0028, 0x0030, 'DS', '4\\4'),
        element(0x0028, 0x1052, 'DS', 0),
        element(0x0028, 0x1053, 'DS', rescaleSlope),
        element(0x7fe0, 0x0010, 'OW', uint16Pixels(pixels)),
      ],
    })
  }
}

// --- DX without pixel spacing (measurements must say "pixels") -----------------
{
  const rows = 96
  const cols = 64
  const pixels = []
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const bone = Math.abs(x - cols / 2) < 6 || (y % 24 < 4 && Math.abs(x - cols / 2) < 22)
      pixels.push(bone ? 600 : 3000) // MONOCHROME1: low values are bright
    }
  }
  writeDicomFile(join(outDir, 'dx_no_spacing.dcm'), {
    sopClassUID: SOP.dx,
    sopInstanceUID: `${ROOT}.4.1`,
    elements: [
      ...patient('Sample^Radiograph', 'SAMPLE-DX'),
      element(0x0008, 0x0060, 'CS', 'DX'),
      element(0x0008, 0x103e, 'LO', 'Chest PA'),
      element(0x0020, 0x000d, 'UI', `${ROOT}.4`),
      element(0x0020, 0x000e, 'UI', `${ROOT}.4.100`),
      element(0x0020, 0x0011, 'IS', 1),
      element(0x0020, 0x0013, 'IS', 1),
      ...grayscale16(rows, cols, 'MONOCHROME1'),
      element(0x0028, 0x1050, 'DS', 1800),
      element(0x0028, 0x1051, 'DS', 3000),
      element(0x7fe0, 0x0010, 'OW', uint16Pixels(pixels)),
    ],
  })
}

// --- unreadable and non-DICOM files ----------------------------------------------
{
  const valid = dicomFile({
    sopClassUID: SOP.dx,
    sopInstanceUID: `${ROOT}.5.1`,
    elements: [
      ...patient('Sample^Broken', 'SAMPLE-BROKEN'),
      element(0x0008, 0x0060, 'CS', 'DX'),
      ...grayscale16(64, 64),
      element(0x7fe0, 0x0010, 'OW', uint16Pixels(new Array(64 * 64).fill(100))),
    ],
  })
  writeFileSync(join(outDir, 'broken.dcm'), valid.subarray(0, 200))
  writeFileSync(join(outDir, 'notes.txt'), 'Not a DICOM file.\n')
}

console.log(`Wrote sample files to ${outDir}`)
