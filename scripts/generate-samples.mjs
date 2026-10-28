// Generates synthetic, patient-free test files for formats beyond the CT
// phantom. Each folder tests one area (see BLUEPRINT/TEST_DATA.md):
//   basic/      US cine, MR with two sequences, PET (SUV tags), DX without spacing,
//               a broken file and a non-DICOM file
//   enhanced/   enhanced CT, one multi-frame file with per-frame positions
//   color/      PALETTE COLOR, RGB planar, YBR_FULL
//   video/      H.264 (Annex-B), H.264 in MP4, MPEG-2 (needs ffmpeg; skipped without it)
//   docs/       encapsulated PDF and a structured report (UTF-8, Bengali patient name)
//   cd/         CD folder: DICOMDIR, files without extension, one missing, viewer junk
//   zip/        plain, nested, ZipCrypto and AES ZIPs (password "dicom123")
//   images/     JPEG, PNG, BMP, GIF, WebP and a two-page TIFF
//   edge/       a completely uniform (blank) frame
//   window/     MR with two header windows, VOI LUT sequence, sigmoid, Presentation LUT INVERSE
//   overlay/    images with DICOM overlay planes (single and multi-frame)
//   sort/       five slices whose instance, position, time and file name orders all differ;
//               the first pixel holds the slice's label (100, 200, …) so tests can tell them apart
//
// Usage: node scripts/generate-samples.mjs <output-dir>
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import zlib from 'node:zlib'
import { join } from 'node:path'
import {
  UID_ROOT,
  dicomFile,
  element,
  encapsulatedPixelData,
  int16Pixels,
  uint16Pixels,
  writeDicomFile,
} from './dicom-writer.mjs'

/** Bump when the samples change, so the e2e setup regenerates them. */
export const SAMPLES_VERSION = '11'

const root = process.argv[2]
if (!root) {
  console.error('Usage: node scripts/generate-samples.mjs <output-dir>')
  process.exit(1)
}
rmSync(root, { recursive: true, force: true })
const dir = (name) => {
  const path = join(root, name)
  mkdirSync(path, { recursive: true })
  return path
}
let outDir = dir('basic')

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
        element(0x0010, 0x0040, 'CS', 'M'),
        element(0x0010, 0x1020, 'DS', 1.75), // patient size (m), for SUVlbm and SUVbsa
        element(0x0010, 0x1030, 'DS', 70), // patient weight (kg)
        element(0x0018, 0x0050, 'DS', 4),
        element(0x0054, 0x0016, 'SQ', [
          [
            element(0x0018, 0x1072, 'TM', '090000'), // injection time
            element(0x0018, 0x1074, 'DS', 370000000), // total dose (Bq)
            element(0x0018, 0x1075, 'DS', 6586.2), // F-18 half-life (s)
          ],
        ]),
        element(0x0028, 0x0051, 'CS', 'DECY\\ATTN'), // corrected image: needed for SUV
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

// ================================================================================
//   Phase 1 samples
// ================================================================================

const SOP1 = {
  enhancedCt: '1.2.840.10008.5.1.4.1.1.2.1',
  secondaryCapture: '1.2.840.10008.5.1.4.1.1.7',
  videoPhotographic: '1.2.840.10008.5.1.4.1.1.77.1.4.1',
  pdf: '1.2.840.10008.5.1.4.1.1.104.1',
  comprehensiveSr: '1.2.840.10008.5.1.4.1.1.88.33',
  mediaStorageDirectory: '1.2.840.10008.1.3.10',
}
const TS = { h264: '1.2.840.10008.1.2.4.102', mpeg2: '1.2.840.10008.1.2.4.100' }
const item = (...elements) => elements
const code = (value, scheme, meaning) => [
  element(0x0008, 0x0100, 'SH', value),
  element(0x0008, 0x0102, 'SH', scheme),
  element(0x0008, 0x0104, 'LO', meaning),
]
const study = (uid, description) => [element(0x0020, 0x000d, 'UI', uid), element(0x0008, 0x1030, 'LO', description)]

// --- enhanced CT: 12 frames, positions only in the per-frame functional groups ----
{
  outDir = dir('enhanced')
  const size = 64
  const frames = 12
  const pixels = []
  for (let f = 0; f < frames; f++) {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const r = Math.hypot(x - 32, y - 32, (f - 5.5) * 4)
        pixels.push(Math.hypot(x - 32, y - 32) > 28 ? -1000 : r < 14 ? 300 : 40)
      }
    }
  }
  writeDicomFile(join(outDir, 'enhanced_ct.dcm'), {
    sopClassUID: SOP1.enhancedCt,
    sopInstanceUID: `${ROOT}.6.1`,
    elements: [
      ...patient('Sample^Enhanced', 'SAMPLE-ECT'),
      ...study(`${ROOT}.6`, 'Enhanced CT'),
      element(0x0008, 0x0008, 'CS', 'ORIGINAL\\PRIMARY\\AXIAL'),
      element(0x0008, 0x0060, 'CS', 'CT'),
      element(0x0008, 0x103e, 'LO', 'Enhanced CT'),
      element(0x0020, 0x000e, 'UI', `${ROOT}.6.100`),
      element(0x0020, 0x0011, 'IS', 1),
      element(0x0020, 0x0013, 'IS', 1),
      element(0x0020, 0x0052, 'UI', `${ROOT}.6.200`),
      element(0x0028, 0x0008, 'IS', frames),
      ...grayscale16(size, size).filter((e) => e.tag !== 0x00280103),
      element(0x0028, 0x0103, 'US', 1),
      element(0x5200, 0x9229, 'SQ', [
        item(
          element(0x0020, 0x9116, 'SQ', [item(element(0x0020, 0x0037, 'DS', '1\\0\\0\\0\\1\\0'))]),
          element(0x0028, 0x9110, 'SQ', [item(element(0x0018, 0x0050, 'DS', 4), element(0x0028, 0x0030, 'DS', '1\\1'))]),
          element(0x0028, 0x9145, 'SQ', [
            item(element(0x0028, 0x1052, 'DS', 0), element(0x0028, 0x1053, 'DS', 1), element(0x0028, 0x1054, 'LO', 'HU')),
          ]),
          element(0x0028, 0x9132, 'SQ', [item(element(0x0028, 0x1050, 'DS', 40), element(0x0028, 0x1051, 'DS', 400))]),
        ),
      ]),
      element(
        0x5200,
        0x9230,
        'SQ',
        Array.from({ length: frames }, (_, f) =>
          item(element(0x0020, 0x9113, 'SQ', [item(element(0x0020, 0x0032, 'DS', `-32\\-32\\${-f * 4}`))])),
        ),
      ),
      element(0x7fe0, 0x0010, 'OW', int16Pixels(pixels)),
    ],
  })
}

// --- colour: palette, RGB planar, YBR_FULL ------------------------------------------
{
  outDir = dir('color')
  const size = 48
  const common = (n, description, extra) => ({
    sopClassUID: SOP1.secondaryCapture,
    sopInstanceUID: `${ROOT}.7.${n}`,
    elements: [
      ...patient('Sample^Colour', 'SAMPLE-COLOR'),
      ...study(`${ROOT}.7`, 'Colour formats'),
      element(0x0008, 0x0060, 'CS', 'OT'),
      element(0x0008, 0x103e, 'LO', description),
      element(0x0020, 0x000e, 'UI', `${ROOT}.7.${n}00`),
      element(0x0020, 0x0011, 'IS', n),
      element(0x0020, 0x0013, 'IS', 1),
      element(0x0028, 0x0010, 'US', size),
      element(0x0028, 0x0011, 'US', size),
      element(0x0028, 0x0100, 'US', 8),
      element(0x0028, 0x0101, 'US', 8),
      element(0x0028, 0x0102, 'US', 7),
      element(0x0028, 0x0103, 'US', 0),
      ...extra,
    ],
  })

  // Palette: index = column band; the LUT maps bands to red, green, blue, white.
  const indices = Buffer.alloc(size * size)
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) indices[y * size + x] = Math.floor(x / 12)
  const lut = (values) => uint16Pixels([...values, ...new Array(252).fill(0)].map((v) => v * 257))
  writeDicomFile(
    join(outDir, 'palette.dcm'),
    common(1, 'Palette colour', [
      element(0x0028, 0x0002, 'US', 1),
      element(0x0028, 0x0004, 'CS', 'PALETTE COLOR'),
      element(0x0028, 0x1101, 'US', [256, 0, 16]),
      element(0x0028, 0x1102, 'US', [256, 0, 16]),
      element(0x0028, 0x1103, 'US', [256, 0, 16]),
      element(0x0028, 0x1201, 'OW', lut([255, 0, 0, 255])),
      element(0x0028, 0x1202, 'OW', lut([0, 255, 0, 255])),
      element(0x0028, 0x1203, 'OW', lut([0, 0, 255, 255])),
      element(0x7fe0, 0x0010, 'OB', new Uint8Array(indices)),
    ]),
  )

  // RGB with planar configuration 1: all red values, then green, then blue.
  const planes = Buffer.alloc(size * size * 3)
  for (let i = 0; i < size * size; i++) {
    const x = i % size
    planes[i] = x < 16 ? 255 : 0
    planes[size * size + i] = x >= 16 && x < 32 ? 255 : 0
    planes[2 * size * size + i] = x >= 32 ? 255 : 0
  }
  writeDicomFile(
    join(outDir, 'rgb_planar.dcm'),
    common(2, 'RGB planar', [
      element(0x0028, 0x0002, 'US', 3),
      element(0x0028, 0x0004, 'CS', 'RGB'),
      element(0x0028, 0x0006, 'US', 1),
      element(0x7fe0, 0x0010, 'OB', new Uint8Array(planes)),
    ]),
  )

  // YBR_FULL: the same three bands converted to Y, Cb, Cr.
  const ybr = Buffer.alloc(size * size * 3)
  for (let i = 0; i < size * size; i++) {
    const x = i % size
    const [r, g, b] = x < 16 ? [255, 0, 0] : x < 32 ? [0, 255, 0] : [0, 0, 255]
    // Clamped: pure red gives Cr = 255.5, which would wrap to 0 in a byte.
    const byte = (v) => Math.min(255, Math.max(0, Math.round(v)))
    ybr[i * 3] = byte(0.299 * r + 0.587 * g + 0.114 * b)
    ybr[i * 3 + 1] = byte(128 - 0.168736 * r - 0.331264 * g + 0.5 * b)
    ybr[i * 3 + 2] = byte(128 + 0.5 * r - 0.418688 * g - 0.081312 * b)
  }
  writeDicomFile(
    join(outDir, 'ybr_full.dcm'),
    common(3, 'YBR full', [
      element(0x0028, 0x0002, 'US', 3),
      element(0x0028, 0x0004, 'CS', 'YBR_FULL'),
      element(0x0028, 0x0006, 'US', 0),
      element(0x7fe0, 0x0010, 'OB', new Uint8Array(ybr)),
    ]),
  )
}

// --- video (ffmpeg) ---------------------------------------------------------------------
const hasFfmpeg = (() => {
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
})()

if (hasFfmpeg) {
  outDir = dir('video')
  const tmp = join(tmpdir(), `dicomlens-video-${process.pid}`)
  mkdirSync(tmp, { recursive: true })
  const ffmpeg = (args, out) => {
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=size=160x120:rate=25', '-t', '2', ...args, out])
    return readFileSync(out)
  }
  const streams = [
    { name: 'h264_annexb', syntax: TS.h264, data: ffmpeg(['-c:v', 'libx264', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-f', 'h264'], join(tmp, 'a.h264')) },
    { name: 'h264_mp4', syntax: TS.h264, data: ffmpeg(['-c:v', 'libx264', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-f', 'mp4'], join(tmp, 'a.mp4')) },
    { name: 'mpeg2', syntax: TS.mpeg2, data: ffmpeg(['-c:v', 'mpeg2video', '-f', 'mpeg2video'], join(tmp, 'a.m2v')) },
  ]
  streams.forEach(({ name, syntax, data }, i) => {
    writeFileSync(
      join(outDir, `${name}.dcm`),
      dicomFile({
        sopClassUID: SOP1.videoPhotographic,
        sopInstanceUID: `${ROOT}.8.${i + 1}`,
        transferSyntax: syntax,
        elements: [
          ...patient('Sample^Video', 'SAMPLE-VIDEO'),
          ...study(`${ROOT}.8`, 'Endoscopy video'),
          element(0x0008, 0x0060, 'CS', 'XC'),
          element(0x0008, 0x103e, 'LO', `Video ${name}`),
          element(0x0018, 0x0040, 'IS', 25),
          element(0x0018, 0x1063, 'DS', 40),
          element(0x0020, 0x000e, 'UI', `${ROOT}.8.${i + 1}00`),
          element(0x0020, 0x0011, 'IS', i + 1),
          element(0x0020, 0x0013, 'IS', 1),
          element(0x0028, 0x0002, 'US', 3),
          element(0x0028, 0x0004, 'CS', 'YBR_PARTIAL_420'),
          element(0x0028, 0x0006, 'US', 0),
          element(0x0028, 0x0008, 'IS', 50),
          element(0x0028, 0x0009, 'AT', new Uint8Array([0x18, 0x00, 0x63, 0x10])),
          element(0x0028, 0x0010, 'US', 120),
          element(0x0028, 0x0011, 'US', 160),
          element(0x0028, 0x0100, 'US', 8),
          element(0x0028, 0x0101, 'US', 8),
          element(0x0028, 0x0102, 'US', 7),
          element(0x0028, 0x0103, 'US', 0),
          encapsulatedPixelData([data]),
        ],
      }),
    )
  })
  rmSync(tmp, { recursive: true, force: true })
} else {
  console.warn('ffmpeg not found: video samples skipped')
}

// --- documents: PDF and a structured report ---------------------------------------
{
  outDir = dir('docs')
  // A one-page PDF with correct cross-reference offsets.
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    null, // content stream, below
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
  const content = 'BT /F1 18 Tf 30 120 Td (DicomLens test report) Tj ET'
  objects[3] = `<< /Length ${content.length} >>\nstream\n${content}\nendstream`
  let pdf = '%PDF-1.4\n'
  const offsets = objects.map((body, i) => {
    const offset = pdf.length
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`
    return offset
  })
  const xref = pdf.length
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`

  writeDicomFile(join(outDir, 'report_pdf.dcm'), {
    sopClassUID: SOP1.pdf,
    sopInstanceUID: `${ROOT}.9.1`,
    elements: [
      ...patient('Sample^Report', 'SAMPLE-DOC'),
      ...study(`${ROOT}.9`, 'Reports'),
      element(0x0008, 0x0060, 'CS', 'DOC'),
      element(0x0020, 0x000e, 'UI', `${ROOT}.9.100`),
      element(0x0020, 0x0011, 'IS', 1),
      element(0x0020, 0x0013, 'IS', 1),
      element(0x0042, 0x0010, 'ST', 'Radiology report'),
      element(0x0042, 0x0011, 'OB', new Uint8Array(Buffer.from(pdf, 'latin1'))),
      element(0x0042, 0x0012, 'LO', 'application/pdf'),
    ],
  })

  // Comprehensive SR in UTF-8 (patient name in Bengali) with nested content.
  const content2 = (relationship, valueType, concept, ...value) =>
    item(
      element(0x0040, 0xa010, 'CS', relationship),
      element(0x0040, 0xa040, 'CS', valueType),
      element(0x0040, 0xa043, 'SQ', [item(...code(...concept))]),
      ...value,
    )
  const enc = (text) => new Uint8Array(Buffer.from(text, 'utf8'))
  writeDicomFile(join(outDir, 'report_sr.dcm'), {
    sopClassUID: SOP1.comprehensiveSr,
    sopInstanceUID: `${ROOT}.9.2`,
    elements: [
      element(0x0008, 0x0005, 'CS', 'ISO_IR 192'),
      element(0x0010, 0x0010, 'PN', enc('রহিম^করিম')),
      element(0x0010, 0x0020, 'LO', 'SAMPLE-DOC'),
      element(0x0008, 0x0020, 'DA', '20260102'),
      ...study(`${ROOT}.9`, 'Reports'),
      element(0x0008, 0x0060, 'CS', 'SR'),
      element(0x0008, 0x103e, 'LO', 'Structured report'),
      element(0x0020, 0x000e, 'UI', `${ROOT}.9.200`),
      element(0x0020, 0x0011, 'IS', 2),
      element(0x0020, 0x0013, 'IS', 1),
      element(0x0040, 0xa040, 'CS', 'CONTAINER'),
      element(0x0040, 0xa043, 'SQ', [item(...code('18748-4', 'LN', 'Diagnostic Imaging Report'))]),
      element(0x0040, 0xa050, 'CS', 'SEPARATE'),
      element(0x0040, 0xa491, 'CS', 'COMPLETE'),
      element(0x0040, 0xa493, 'CS', 'UNVERIFIED'),
      element(0x0040, 0xa730, 'SQ', [
        content2('HAS OBS CONTEXT', 'PNAME', ['121008', 'DCM', 'Person Observer Name'], element(0x0040, 0xa123, 'PN', 'Doctor^Test')),
        content2('HAS OBS CONTEXT', 'DATE', ['111060', 'DCM', 'Study Date'], element(0x0040, 0xa121, 'DA', '20260102')),
        content2('CONTAINS', 'TEXT', ['121071', 'DCM', 'Finding'], element(0x0040, 0xa160, 'UT', enc('যকৃতে ২ সেমি ক্ষত। Liver lesion, 2 cm.'))),
        content2(
          'CONTAINS',
          'NUM',
          ['410668003', 'SCT', 'Length'],
          element(0x0040, 0xa300, 'SQ', [
            item(element(0x0040, 0xa30a, 'DS', 20), element(0x0040, 0x08ea, 'SQ', [item(...code('mm', 'UCUM', 'millimeter'))])),
          ]),
        ),
        content2('CONTAINS', 'CODE', ['121071', 'DCM', 'Finding'], element(0x0040, 0xa168, 'SQ', [item(...code('4147007', 'SCT', 'Mass'))])),
        content2(
          'CONTAINS',
          'CONTAINER',
          ['121076', 'DCM', 'Conclusion'],
          element(0x0040, 0xa050, 'CS', 'SEPARATE'),
          element(0x0040, 0xa730, 'SQ', [
            content2('CONTAINS', 'TEXT', ['121077', 'DCM', 'Conclusion'], element(0x0040, 0xa160, 'UT', 'Follow-up CT in 3 months.')),
          ]),
        ),
        content2(
          'CONTAINS',
          'IMAGE',
          ['121080', 'DCM', 'Best illustration of finding'],
          element(0x0008, 0x1199, 'SQ', [
            item(element(0x0008, 0x1150, 'UI', SOP.pet), element(0x0008, 0x1155, 'UI', `${ROOT}.3.3`)),
          ]),
        ),
      ]),
    ],
  })
}

// --- CD folder with DICOMDIR ----------------------------------------------------------
{
  const cd = dir('cd/CD')
  mkdirSync(join(cd, 'DICOM'), { recursive: true })
  mkdirSync(join(cd, 'VIEWER'), { recursive: true })
  const images = ['IMG0001', 'IMG0002']
  images.forEach((name, i) => {
    const pixels = []
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) pixels.push((x + y + i * 20) * 30)
    writeDicomFile(join(cd, 'DICOM', name), {
      sopClassUID: SOP.dx,
      sopInstanceUID: `${ROOT}.10.${i + 1}`,
      elements: [
        ...patient('Sample^Cd', 'SAMPLE-CD'),
        ...study(`${ROOT}.10`, 'CD study'),
        element(0x0008, 0x0060, 'CS', 'DX'),
        element(0x0008, 0x103e, 'LO', 'CD series'),
        element(0x0020, 0x000e, 'UI', `${ROOT}.10.100`),
        element(0x0020, 0x0011, 'IS', 1),
        element(0x0020, 0x0013, 'IS', i + 1),
        ...grayscale16(32, 32),
        element(0x7fe0, 0x0010, 'OW', uint16Pixels(pixels)),
      ],
    })
  })
  const record = (type, ...extra) => item(element(0x0004, 0x1430, 'CS', type), ...extra)
  writeDicomFile(join(cd, 'DICOMDIR'), {
    sopClassUID: SOP1.mediaStorageDirectory,
    sopInstanceUID: `${ROOT}.10.999`,
    elements: [
      element(0x0004, 0x1130, 'CS', 'SAMPLE_CD'),
      element(0x0004, 0x1220, 'SQ', [
        record('PATIENT', element(0x0010, 0x0010, 'PN', 'Sample^Cd'), element(0x0010, 0x0020, 'LO', 'SAMPLE-CD')),
        record('STUDY', element(0x0020, 0x000d, 'UI', `${ROOT}.10`)),
        record('SERIES', element(0x0020, 0x000e, 'UI', `${ROOT}.10.100`), element(0x0008, 0x0060, 'CS', 'DX')),
        // ISO 9660 style: upper case with a ";1" version on one entry.
        record('IMAGE', element(0x0004, 0x1500, 'CS', 'DICOM\\IMG0001'), element(0x0004, 0x1511, 'UI', `${ROOT}.10.1`)),
        record('IMAGE', element(0x0004, 0x1500, 'CS', 'DICOM\\IMG0002;1'), element(0x0004, 0x1511, 'UI', `${ROOT}.10.2`)),
        record('IMAGE', element(0x0004, 0x1500, 'CS', 'DICOM\\IMG0003'), element(0x0004, 0x1511, 'UI', `${ROOT}.10.3`)),
      ]),
    ],
  })
  writeFileSync(join(cd, 'AUTORUN.INF'), '[autorun]\nopen=VIEWER\\viewer.exe\n')
  writeFileSync(join(cd, 'VIEWER', 'LOGO.PNG'), pngBytes(16, 16, () => [0, 128, 255]))
  writeFileSync(join(cd, 'VIEWER', 'DATA.BIN'), Buffer.from('not dicom, not referenced'))
}

// --- ordinary images -----------------------------------------------------------------
{
  outDir = dir('images')
  // A 1×1 lossless WebP (ffmpeg builds often lack a WebP encoder).
  writeFileSync(join(outDir, 'pixel.webp'), Buffer.from('UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==', 'base64'))
  writeFileSync(join(outDir, 'diagram.png'), pngBytes(64, 48, (x, y) => (x < 32 ? [255, 160, 0] : [0, y * 5, 200])))
  if (hasFfmpeg) {
    const still = (name, ...args) =>
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=size=96x64', '-frames:v', '1', ...args, join(outDir, name)])
    still('photo.jpg')
    still('screen.bmp')
    still('animation.gif')

  }
  writeFileSync(
    join(outDir, 'scan.tif'),
    tiffBytes([
      { width: 40, height: 30, pixel: (x) => (x < 20 ? [255, 0, 0] : [255, 255, 255]) },
      { width: 40, height: 30, pixel: (x) => (x < 20 ? [0, 0, 255] : [255, 255, 255]) },
    ]),
  )
}

// --- ZIP archives (zip.js runs in Node too) ------------------------------------------
{
  const { ZipWriter, Uint8ArrayWriter, Uint8ArrayReader } = await import('@zip.js/zip.js')
  outDir = dir('zip')
  const zip = async (entries, options = {}) => {
    const writer = new ZipWriter(new Uint8ArrayWriter(), options)
    for (const [name, bytes] of entries) await writer.add(name, new Uint8ArrayReader(new Uint8Array(bytes)))
    return Buffer.from(await writer.close())
  }
  const basic = join(root, 'basic')
  const pet = Array.from({ length: 8 }, (_, i) => [`PET/pet_${i + 1}.dcm`, readFileSync(join(basic, 'pet', `pet_${i + 1}.dcm`))])
  const dx = readFileSync(join(basic, 'dx_no_spacing.dcm'))
  const mr = Array.from({ length: 12 }, (_, i) => [`MR/mr_${i + 1}.dcm`, readFileSync(join(basic, 'mr_mixed', `mr_${i + 1}.dcm`))])

  writeFileSync(join(outDir, 'study.zip'), await zip([...pet, ['__MACOSX/PET/._pet_1.dcm', Buffer.from('x')]]))
  writeFileSync(join(outDir, 'nested.zip'), await zip([['inner/radiograph.zip', await zip([['dx.dcm', dx]])], ['readme.txt', Buffer.from('hello')]]))
  writeFileSync(join(outDir, 'zipcrypto.zip'), await zip([['dx.dcm', dx]], { password: 'dicom123', zipCrypto: true }))
  writeFileSync(join(outDir, 'aes.zip'), await zip(mr, { password: 'dicom123', encryptionStrength: 3 }))
}

// --- sorting: instance, position, time and file name disagree ----------------------
{
  outDir = dir('sort')
  // label: [instance, z position, acquisition time, file name]
  const slices = [
    [100, 5, 0, '100003', 'img_3'],
    [200, 4, 10, '100001', 'img_10'],
    [300, 3, 20, '100005', 'img_1'],
    [400, 2, 30, '100002', 'img_20'],
    [500, 1, 40, '100004', 'img_2'],
  ]
  for (const [label, instance, z, time, name] of slices) {
    writeDicomFile(join(outDir, `${name}.dcm`), {
      sopClassUID: '1.2.840.10008.5.1.4.1.1.2',
      sopInstanceUID: `${ROOT}.11.${label}`,
      elements: [
        ...patient('Sample^Sort', 'SAMPLE-SORT'),
        ...study(`${ROOT}.11`, 'Sorting'),
        element(0x0008, 0x0022, 'DA', '20260102'),
        element(0x0008, 0x0032, 'TM', time),
        element(0x0008, 0x0060, 'CS', 'CT'),
        element(0x0008, 0x103e, 'LO', 'Sort test'),
        element(0x0020, 0x000e, 'UI', `${ROOT}.11.100`),
        element(0x0020, 0x0011, 'IS', 1),
        element(0x0020, 0x0013, 'IS', instance),
        element(0x0020, 0x0032, 'DS', `0\\0\\${z}`),
        element(0x0020, 0x0037, 'DS', '1\\0\\0\\0\\1\\0'),
        element(0x0020, 0x0052, 'UI', `${ROOT}.11.200`),
        ...grayscale16(16, 16),
        element(0x0028, 0x0030, 'DS', '1\\1'),
        // The first pixel is the label; the rest is a ramp so the image is not uniform.
        element(0x7fe0, 0x0010, 'OW', uint16Pixels(Array.from({ length: 256 }, (_, i) => (i === 0 ? label : label + (i % 16))))),
      ],
    })
  }
}

// --- edge cases ------------------------------------------------------------------------
{
  outDir = dir('edge')
  writeDicomFile(join(outDir, 'blank.dcm'), {
    sopClassUID: '1.2.840.10008.5.1.4.1.1.7',
    sopInstanceUID: `${ROOT}.12.1`,
    elements: [
      ...patient('Sample^Blank', 'SAMPLE-BLANK'),
      ...study(`${ROOT}.12`, 'Edge cases'),
      element(0x0008, 0x0060, 'CS', 'OT'),
      element(0x0008, 0x103e, 'LO', 'Blank frame'),
      element(0x0020, 0x000e, 'UI', `${ROOT}.12.100`),
      element(0x0020, 0x0011, 'IS', 1),
      element(0x0020, 0x0013, 'IS', 1),
      ...grayscale16(32, 32),
      element(0x7fe0, 0x0010, 'OW', uint16Pixels(new Array(32 * 32).fill(0))),
    ],
  })
}

// --- window handling (phase 2) --------------------------------------------------------
{
  outDir = dir('window')
  const size = 32
  const ramp = Array.from({ length: size * size }, (_, i) => (i % size) * 32) // 0..992 left to right
  const base = (n, description, extra, photometric = 'MONOCHROME2') => ({
    sopClassUID: SOP.mr,
    sopInstanceUID: `${ROOT}.13.${n}`,
    elements: [
      ...patient('Sample^Window', 'SAMPLE-WINDOW'),
      ...study(`${ROOT}.13`, 'Window handling'),
      element(0x0008, 0x0060, 'CS', 'MR'),
      element(0x0008, 0x103e, 'LO', description),
      element(0x0020, 0x000e, 'UI', `${ROOT}.13.${n}00`),
      element(0x0020, 0x0011, 'IS', n),
      element(0x0020, 0x0013, 'IS', 1),
      ...grayscale16(size, size, photometric),
      ...extra,
      element(0x7fe0, 0x0010, 'OW', uint16Pixels(ramp)),
    ],
  })
  writeDicomFile(
    join(outDir, 'mr_windows.dcm'),
    base(1, 'Two windows', [
      element(0x0028, 0x1050, 'DS', '300\\600'),
      element(0x0028, 0x1051, 'DS', '600\\1200'),
      element(0x0028, 0x1055, 'LO', 'SOFT\\WIDE'),
    ]),
  )
  // VOI LUT: a 1024-entry table mapping the ramp to an inverted 8-bit output.
  const lut = Array.from({ length: 1024 }, (_, i) => 255 - Math.floor(i / 4))
  writeDicomFile(
    join(outDir, 'voi_lut.dcm'),
    base(2, 'VOI LUT', [
      element(0x0028, 0x3010, 'SQ', [
        item(element(0x0028, 0x3002, 'US', [1024, 0, 8]), element(0x0028, 0x3003, 'LO', 'INVERTING LUT'), element(0x0028, 0x3006, 'OW', uint16Pixels(lut))),
      ]),
    ]),
  )
  // 1024 distinct values plus two very bright pixels: auto window ignores them, full range does not.
  const outliers = Array.from({ length: size * size }, (_, i) => (i < 2 ? 60000 : i))
  writeDicomFile(join(outDir, 'outliers.dcm'), {
    ...base(5, 'Outliers', []),
    elements: [...base(5, 'Outliers', []).elements.filter((e) => e.tag !== 0x7fe00010), element(0x7fe0, 0x0010, 'OW', uint16Pixels(outliers))],
  })
  writeDicomFile(
    join(outDir, 'sigmoid.dcm'),
    base(3, 'Sigmoid', [element(0x0028, 0x1050, 'DS', 500), element(0x0028, 0x1051, 'DS', 400), element(0x0028, 0x1056, 'CS', 'SIGMOID')]),
  )
  writeDicomFile(
    join(outDir, 'inverse.dcm'),
    base(4, 'Presentation LUT inverse', [element(0x0028, 0x1050, 'DS', 500), element(0x0028, 0x1051, 'DS', 1000), element(0x2050, 0x0020, 'CS', 'INVERSE')]),
  )
}

// --- DICOM overlay planes (phase 2) --------------------------------------------------
{
  outDir = dir('overlay')
  const size = 64
  // One bit per pixel, packed little-endian within bytes (PS3.5 8.1.2).
  const packBits = (bits) => {
    const bytes = Buffer.alloc(Math.ceil(bits.length / 8))
    bits.forEach((bit, i) => bit && (bytes[i >> 3] |= 1 << (i & 7)))
    return new Uint8Array(bytes)
  }
  const square = (inset) =>
    Array.from({ length: size * size }, (_, i) => {
      const x = i % size
      const y = Math.floor(i / size)
      const edge = x === inset || y === inset || x === size - 1 - inset || y === size - 1 - inset
      return edge && x >= inset && y >= inset && x <= size - 1 - inset && y <= size - 1 - inset ? 1 : 0
    })
  const overlay = (bits, frames) => [
    element(0x6000, 0x0010, 'US', size),
    element(0x6000, 0x0011, 'US', size),
    ...(frames ? [element(0x6000, 0x0015, 'IS', frames), element(0x6000, 0x0051, 'US', 1)] : []),
    element(0x6000, 0x0022, 'LO', 'Box'),
    element(0x6000, 0x0040, 'CS', 'G'),
    element(0x6000, 0x0050, 'SS', new Uint8Array([1, 0, 1, 0])),
    element(0x6000, 0x0100, 'US', 1),
    element(0x6000, 0x0102, 'US', 0),
    element(0x6000, 0x3000, 'OW', packBits(bits)),
  ]
  const gray = (frames) => uint16Pixels(new Array(size * size * frames).fill(0).map((_, i) => ((i % size) + Math.floor(i / size)) % 64 * 8))
  writeDicomFile(join(outDir, 'overlay.dcm'), {
    sopClassUID: SOP.dx,
    sopInstanceUID: `${ROOT}.14.1`,
    elements: [
      ...patient('Sample^Overlay', 'SAMPLE-OVERLAY'),
      ...study(`${ROOT}.14`, 'Overlays'),
      element(0x0008, 0x0060, 'CS', 'DX'),
      element(0x0008, 0x103e, 'LO', 'Overlay box'),
      element(0x0020, 0x000e, 'UI', `${ROOT}.14.100`),
      element(0x0020, 0x0011, 'IS', 1),
      element(0x0020, 0x0013, 'IS', 1),
      ...grayscale16(size, size),
      ...overlay(square(8)),
      element(0x7fe0, 0x0010, 'OW', gray(1)),
    ],
  })
  // Two frames, each with its own overlay frame (a box with a different inset).
  writeDicomFile(join(outDir, 'overlay_multiframe.dcm'), {
    sopClassUID: '1.2.840.10008.5.1.4.1.1.3.1',
    sopInstanceUID: `${ROOT}.14.2`,
    elements: [
      ...patient('Sample^Overlay', 'SAMPLE-OVERLAY'),
      ...study(`${ROOT}.14`, 'Overlays'),
      element(0x0008, 0x0060, 'CS', 'US'),
      element(0x0008, 0x103e, 'LO', 'Overlay per frame'),
      element(0x0020, 0x000e, 'UI', `${ROOT}.14.200`),
      element(0x0020, 0x0011, 'IS', 2),
      element(0x0020, 0x0013, 'IS', 1),
      element(0x0028, 0x0008, 'IS', 2),
      ...grayscale16(size, size),
      ...overlay([...square(4), ...square(20)], 2),
      element(0x7fe0, 0x0010, 'OW', gray(2)),
    ],
  })
}

writeFileSync(join(root, '.version'), SAMPLES_VERSION)
console.log(`Wrote sample files to ${root}`)

// --- tiny PNG and TIFF encoders (uncompressed / stored) --------------------------------

function pngBytes(width, height, pixel) {
  const { deflateSync, crc32 } = zlib
  const raw = Buffer.alloc((width * 3 + 1) * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) raw.set(pixel(x, y), y * (width * 3 + 1) + 1 + x * 3)
  }
  const chunk = (type, data) => {
    const length = Buffer.alloc(4)
    length.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(body))
    return Buffer.concat([length, body, crc])
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header.set([8, 2, 0, 0, 0], 8) // 8-bit RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/** Little-endian, uncompressed, RGB, one strip per page. */
function tiffBytes(pages) {
  const parts = [Buffer.from([0x49, 0x49, 0x2a, 0x00, 0, 0, 0, 0])]
  let offset = 8
  const ifdOffsets = []
  const append = (buffer) => {
    const at = offset
    parts.push(buffer)
    offset += buffer.length
    return at
  }
  const ifds = pages.map(({ width, height, pixel }) => {
    const pixels = Buffer.alloc(width * height * 3)
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) pixels.set(pixel(x, y), (y * width + x) * 3)
    const stripOffset = append(pixels)
    const bitsOffset = append(Buffer.from([8, 0, 8, 0, 8, 0]))
    return { width, height, stripOffset, bitsOffset, byteCount: pixels.length }
  })
  ifds.forEach((page, i) => {
    const entries = [
      [256, 3, 1, page.width],
      [257, 3, 1, page.height],
      [258, 3, 3, page.bitsOffset],
      [259, 3, 1, 1],
      [262, 3, 1, 2],
      [273, 4, 1, page.stripOffset],
      [277, 3, 1, 3],
      [278, 3, 1, page.height],
      [279, 4, 1, page.byteCount],
    ]
    const ifd = Buffer.alloc(2 + entries.length * 12 + 4)
    ifd.writeUInt16LE(entries.length, 0)
    entries.forEach(([tag, type, count, value], j) => {
      const at = 2 + j * 12
      ifd.writeUInt16LE(tag, at)
      ifd.writeUInt16LE(type, at + 2)
      ifd.writeUInt32LE(count, at + 4)
      if (type === 3 && count === 1) ifd.writeUInt16LE(value, at + 8)
      else ifd.writeUInt32LE(value, at + 8)
    })
    ifdOffsets.push({ at: append(ifd), size: ifd.length, index: i })
  })
  const file = Buffer.concat(parts)
  file.writeUInt32LE(ifdOffsets[0].at, 4)
  ifdOffsets.forEach(({ at, size }, i) => file.writeUInt32LE(ifdOffsets[i + 1]?.at ?? 0, at + size - 4))
  return file
}
