// Generates a large synthetic CT series (default 2000 slices of 64×64) to
// check that opening thousands of files keeps the page responsive.
// Usage: node scripts/generate-large-study.mjs <output-dir> [count]
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { UID_ROOT, element, int16Pixels, writeDicomFile } from './dicom-writer.mjs'

const [outDir, countArg = '2000'] = process.argv.slice(2)
if (!outDir) {
  console.error('Usage: node scripts/generate-large-study.mjs <output-dir> [count]')
  process.exit(1)
}
const count = Number(countArg)
rmSync(outDir, { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })

const ROOT = `${UID_ROOT}.60`
const size = 64
for (let k = 0; k < count; k++) {
  const pixels = new Array(size * size)
  for (let i = 0; i < pixels.length; i++) pixels[i] = Math.hypot((i % size) - 32, Math.floor(i / size) - 32) < 20 + 10 * Math.sin(k / 50) ? 60 : -1000
  writeDicomFile(join(outDir, `large_${String(k + 1).padStart(5, '0')}.dcm`), {
    sopClassUID: '1.2.840.10008.5.1.4.1.1.2',
    sopInstanceUID: `${ROOT}.1.${k + 1}`,
    elements: [
      element(0x0008, 0x0060, 'CS', 'CT'),
      element(0x0008, 0x103e, 'LO', `Large ${count}`),
      element(0x0010, 0x0010, 'PN', 'Sample^Large'),
      element(0x0010, 0x0020, 'LO', 'SAMPLE-LARGE'),
      element(0x0020, 0x000d, 'UI', `${ROOT}`),
      element(0x0020, 0x000e, 'UI', `${ROOT}.1`),
      element(0x0020, 0x0011, 'IS', 1),
      element(0x0020, 0x0013, 'IS', k + 1),
      element(0x0020, 0x0032, 'DS', `-32\\-32\\${-k * 0.5}`),
      element(0x0020, 0x0037, 'DS', '1\\0\\0\\0\\1\\0'),
      element(0x0028, 0x0002, 'US', 1),
      element(0x0028, 0x0004, 'CS', 'MONOCHROME2'),
      element(0x0028, 0x0010, 'US', size),
      element(0x0028, 0x0011, 'US', size),
      element(0x0028, 0x0030, 'DS', '1\\1'),
      element(0x0028, 0x0100, 'US', 16),
      element(0x0028, 0x0101, 'US', 16),
      element(0x0028, 0x0102, 'US', 15),
      element(0x0028, 0x0103, 'US', 1),
      element(0x0028, 0x1052, 'DS', 0),
      element(0x0028, 0x1053, 'DS', 1),
      element(0x7fe0, 0x0010, 'OW', int16Pixels(pixels)),
    ],
  })
}
console.log(`Wrote ${count} slices to ${outDir}`)
