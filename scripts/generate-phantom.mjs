// Generates a synthetic CT phantom study (no patient data) for manual testing:
//   #1 SCOUT    coronal localizer (1 image)
//   #2 Native   axial, 40 slices × 2.5 mm
//   #3 +C       axial, 40 slices × 2.5 mm (contrast-enhanced "vessels")
//   #4 Recon 2  axial, 20 slices × 5 mm, lung window
// All series share one FrameOfReferenceUID, so reference lines and
// position-based slice sync can be tested.
//
// Usage: node scripts/generate-phantom.mjs <output-dir>
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const outDir = process.argv[2]
if (!outDir) {
  console.error('Usage: node scripts/generate-phantom.mjs <output-dir>')
  process.exit(1)
}

const ROOT = '1.2.826.0.1.3680043.10.1395' // arbitrary demo UID root
const STUDY_UID = `${ROOT}.1`
const FOR_UID = `${ROOT}.2`
const CT_IMAGE_STORAGE = '1.2.840.10008.5.1.4.1.1.2'
const EXPLICIT_VR_LE = '1.2.840.10008.1.2.1'
const SIZE = 128 // pixels, 1 mm each
const DEPTH_MM = 100

/**
 * Hounsfield value of the phantom at patient position (x, y, z) in mm.
 * Bone is segmented along z (vertebrae with discs, ribs every 20 mm) and the
 * aorta curves, so the 3D presets show recognisable structures.
 */
function hu(x, y, z, contrast) {
  const inEllipse = (cx, cy, rx, ry) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1
  const level = ((-z % 20) + 20) % 20 // position within a 20 mm vertebral level
  if (!inEllipse(0, 0, 58, 42)) return -1000 // air
  if (inEllipse(0, 28, 9, 9)) return level < 16 ? 700 : 80 // vertebral body / disc
  if (inEllipse(0, 39, 3, 4) && level < 16) return 650 // spinous process
  if (level >= 4 && level < 8 && !inEllipse(0, 0, 52, 37)) return 600 // rib
  if (Math.abs(x) <= 4 && y <= -36) return 550 // sternum
  if (inEllipse(-26, -2, 20, 28) || inEllipse(26, -2, 20, 28)) {
    // lungs, with a small nodule that only exists in some slices
    const nodule = (x - 26) ** 2 + (y + 5) ** 2 + (z + 50) ** 2 <= 36
    return nodule ? 20 : -820
  }
  const aortaX = -4 + 6 * Math.sin(z / 25)
  if (inEllipse(aortaX, -8, 7, 7)) return contrast ? 300 : 45 // aorta
  return 40 // soft tissue
}

// --- minimal explicit VR little endian writer ---------------------------------
const LONG_VRS = new Set(['OB', 'OW', 'SQ', 'UN', 'UT'])

function element(group, elem, vr, value) {
  let bytes
  if (value instanceof Uint8Array) {
    bytes = Buffer.from(value)
  } else if (vr === 'US') {
    bytes = Buffer.alloc(2)
    bytes.writeUInt16LE(value)
  } else if (vr === 'UL') {
    bytes = Buffer.alloc(4)
    bytes.writeUInt32LE(value)
  } else {
    bytes = Buffer.from(String(value), 'latin1')
  }
  if (bytes.length % 2) bytes = Buffer.concat([bytes, Buffer.from(vr === 'UI' || vr === 'OB' ? [0] : [0x20])])

  const header = Buffer.alloc(LONG_VRS.has(vr) ? 12 : 8)
  header.writeUInt16LE(group, 0)
  header.writeUInt16LE(elem, 2)
  header.write(vr, 4, 'latin1')
  if (LONG_VRS.has(vr)) header.writeUInt32LE(bytes.length, 8)
  else header.writeUInt16LE(bytes.length, 6)
  return Buffer.concat([header, bytes])
}

function writeDicom(path, { sopInstanceUID, tags, rows, cols, pixels }) {
  const metaBody = Buffer.concat([
    element(0x0002, 0x0001, 'OB', new Uint8Array([0, 1])),
    element(0x0002, 0x0002, 'UI', CT_IMAGE_STORAGE),
    element(0x0002, 0x0003, 'UI', sopInstanceUID),
    element(0x0002, 0x0010, 'UI', EXPLICIT_VR_LE),
    element(0x0002, 0x0012, 'UI', `${ROOT}.99`),
  ])
  const meta = Buffer.concat([element(0x0002, 0x0000, 'UL', metaBody.length), metaBody])

  const pixelBytes = Buffer.alloc(pixels.length * 2)
  pixels.forEach((value, i) => pixelBytes.writeInt16LE(value, i * 2))

  const dataset = Buffer.concat([
    element(0x0008, 0x0008, 'CS', tags.imageType),
    element(0x0008, 0x0016, 'UI', CT_IMAGE_STORAGE),
    element(0x0008, 0x0018, 'UI', sopInstanceUID),
    element(0x0008, 0x0020, 'DA', '20260101'),
    element(0x0008, 0x0060, 'CS', 'CT'),
    element(0x0008, 0x1030, 'LO', 'Phantom Chest'),
    element(0x0008, 0x103e, 'LO', tags.description),
    element(0x0010, 0x0010, 'PN', 'Phantom^Demo'),
    element(0x0010, 0x0020, 'LO', 'DEMO-001'),
    element(0x0018, 0x0050, 'DS', tags.sliceThickness),
    element(0x0020, 0x000d, 'UI', STUDY_UID),
    element(0x0020, 0x000e, 'UI', tags.seriesUID),
    element(0x0020, 0x0011, 'IS', tags.seriesNumber),
    element(0x0020, 0x0013, 'IS', tags.instanceNumber),
    element(0x0020, 0x0032, 'DS', tags.position.join('\\')),
    element(0x0020, 0x0037, 'DS', tags.orientation.join('\\')),
    element(0x0020, 0x0052, 'UI', FOR_UID),
    element(0x0028, 0x0002, 'US', 1),
    element(0x0028, 0x0004, 'CS', 'MONOCHROME2'),
    element(0x0028, 0x0010, 'US', rows),
    element(0x0028, 0x0011, 'US', cols),
    element(0x0028, 0x0030, 'DS', tags.pixelSpacing.join('\\')),
    element(0x0028, 0x0100, 'US', 16),
    element(0x0028, 0x0101, 'US', 16),
    element(0x0028, 0x0102, 'US', 15),
    element(0x0028, 0x0103, 'US', 1),
    element(0x0028, 0x1050, 'DS', tags.window[1]),
    element(0x0028, 0x1051, 'DS', tags.window[0]),
    element(0x0028, 0x1052, 'DS', '0'),
    element(0x0028, 0x1053, 'DS', '1'),
    element(0x7fe0, 0x0010, 'OW', new Uint8Array(pixelBytes)),
  ])

  writeFileSync(path, Buffer.concat([Buffer.alloc(128), Buffer.from('DICM'), meta, dataset]))
}

// --- series --------------------------------------------------------------------
mkdirSync(outDir, { recursive: true })
const half = SIZE / 2

function axialSeries({ seriesNumber, description, spacing, contrast, window }) {
  const count = Math.floor(DEPTH_MM / spacing)
  for (let k = 0; k < count; k++) {
    const z = -k * spacing
    const pixels = []
    for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) pixels.push(hu(c - half, r - half, z, contrast))
    writeDicom(join(outDir, `s${seriesNumber}_${String(k + 1).padStart(3, '0')}.dcm`), {
      sopInstanceUID: `${ROOT}.3.${seriesNumber}.${k + 1}`,
      rows: SIZE,
      cols: SIZE,
      pixels,
      tags: {
        imageType: 'ORIGINAL\\PRIMARY\\AXIAL',
        description,
        sliceThickness: spacing,
        seriesUID: `${ROOT}.3.${seriesNumber}`,
        seriesNumber,
        instanceNumber: k + 1,
        position: [-half, -half, z],
        orientation: [1, 0, 0, 0, 1, 0],
        pixelSpacing: [1, 1],
        window,
      },
    })
  }
  return count
}

// Coronal scout: average attenuation along y, rows run head (z=0) to feet.
const scoutPixels = []
for (let r = 0; r < DEPTH_MM; r++) {
  for (let c = 0; c < SIZE; c++) {
    let sum = 0
    for (let y = -half; y < half; y++) sum += hu(c - half, y, -r, false) + 1000
    scoutPixels.push(Math.round(sum / SIZE) * 4 - 1000)
  }
}
writeDicom(join(outDir, 's1_001.dcm'), {
  sopInstanceUID: `${ROOT}.3.1.1`,
  rows: DEPTH_MM,
  cols: SIZE,
  pixels: scoutPixels,
  tags: {
    imageType: 'ORIGINAL\\PRIMARY\\LOCALIZER',
    description: 'SCOUT',
    sliceThickness: 1,
    seriesUID: `${ROOT}.3.1`,
    seriesNumber: 1,
    instanceNumber: 1,
    position: [-half, 0, 0],
    orientation: [1, 0, 0, 0, 0, -1],
    pixelSpacing: [1, 1],
    window: [2000, 0],
  },
})

const counts = [
  axialSeries({ seriesNumber: 2, description: 'Native', spacing: 2.5, contrast: false, window: [400, 40] }),
  axialSeries({ seriesNumber: 3, description: '+C', spacing: 2.5, contrast: true, window: [400, 40] }),
  axialSeries({ seriesNumber: 4, description: 'Recon 2', spacing: 5, contrast: false, window: [1500, -600] }),
]
console.log(`Wrote scout + axial series (${counts.join(', ')} slices) to ${outDir}`)
