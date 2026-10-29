// A synthetic chest CT made in the browser, to try the viewer without files
// of one's own (and without a network). Not a real patient.
import type { SourceFile } from '../dicom/collectFiles'
import { dicomFile, element, newUid } from '../dicom/writer'

const SIZE = 128
const SLICES = 40
const SPACING = 2.5
const THICKNESS = 4

/** HU at a point (mm, centred): body, lungs, heart, spine, ribs and a small nodule. */
function hu(x: number, y: number, z: number) {
  const body = (x / 150) ** 2 + (y / 105) ** 2 < 1
  if (!body) return -1000
  if (Math.hypot(x, y - 70) < 14) return 700 // vertebra
  const ribs = Math.abs((x / 140) ** 2 + (y / 98) ** 2 - 0.88) < 0.035 && Math.sin((z / 18) * Math.PI) > 0
  if (ribs) return 500
  if (Math.hypot(x + 18, y + 5) < 38 && z > 40 && z < 110) return 45 // heart
  if (Math.hypot(x - 52, y - 5) < 6 && Math.abs(z - 80) < 6) return 40 // nodule in the right lung
  const lung = ((x - 60) / 45) ** 2 + (y / 70) ** 2 < 1 || ((x + 60) / 45) ** 2 + (y / 70) ** 2 < 1
  if (lung) return -850 + ((x * 7 + y * 13) % 40)
  return 30 + ((x * 3 + y * 5) % 20)
}

export function sampleStudy(): SourceFile[] {
  const study = newUid()
  const series = newUid()
  const frame = newUid()
  return Array.from({ length: SLICES }, (_, k) => {
    const z = k * THICKNESS
    const pixels = new Int16Array(SIZE * SIZE)
    for (let j = 0; j < SIZE; j++)
      for (let i = 0; i < SIZE; i++) pixels[j * SIZE + i] = hu((i - SIZE / 2) * SPACING, (j - SIZE / 2) * SPACING, z)
    const sop = newUid()
    const bytes = dicomFile('1.2.840.10008.5.1.4.1.1.2', sop, [
      element(0x0008, 0x0005, 'CS', 'ISO_IR 192'),
      element(0x0008, 0x0020, 'DA', '20260101'),
      element(0x0008, 0x0060, 'CS', 'CT'),
      element(0x0008, 0x1030, 'LO', 'Sample chest CT (synthetic)'),
      element(0x0008, 0x103e, 'LO', 'Sample chest'),
      element(0x0010, 0x0010, 'PN', 'Sample^Patient'),
      element(0x0010, 0x0020, 'LO', 'SAMPLE'),
      element(0x0018, 0x0050, 'DS', THICKNESS),
      element(0x0020, 0x000d, 'UI', study),
      element(0x0020, 0x000e, 'UI', series),
      element(0x0020, 0x0011, 'IS', 1),
      element(0x0020, 0x0013, 'IS', k + 1),
      element(0x0020, 0x0032, 'DS', `${(-SIZE / 2) * SPACING}\\${(-SIZE / 2) * SPACING}\\${-z}`),
      element(0x0020, 0x0037, 'DS', '1\\0\\0\\0\\1\\0'),
      element(0x0020, 0x0052, 'UI', frame),
      element(0x0028, 0x0002, 'US', 1),
      element(0x0028, 0x0004, 'CS', 'MONOCHROME2'),
      element(0x0028, 0x0010, 'US', SIZE),
      element(0x0028, 0x0011, 'US', SIZE),
      element(0x0028, 0x0030, 'DS', `${SPACING}\\${SPACING}`),
      element(0x0028, 0x0100, 'US', 16),
      element(0x0028, 0x0101, 'US', 16),
      element(0x0028, 0x0102, 'US', 15),
      element(0x0028, 0x0103, 'US', 1),
      element(0x0028, 0x1050, 'DS', -600),
      element(0x0028, 0x1051, 'DS', 1500),
      element(0x0028, 0x1052, 'DS', 0),
      element(0x0028, 0x1053, 'DS', 1),
      element(0x7fe0, 0x0010, 'OW', new Uint8Array(pixels.buffer)),
    ])
    const name = `sample_${String(k + 1).padStart(2, '0')}.dcm`
    return { file: new File([bytes as BlobPart], name, { type: 'application/dicom' }), path: `Sample/${name}` }
  })
}
