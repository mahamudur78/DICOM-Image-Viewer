// Downloads public, anonymized DICOM test files (see BLUEPRINT/TEST_DATA.md)
// into e2e/.data/public. They are gitignored and never committed.
// Usage: node scripts/fetch-sample-data.mjs [output-dir]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const outDir = process.argv[2] ?? 'e2e/.data/public'

// Pinned versions, so the files never change underneath the tests.
const PYDICOM = 'https://raw.githubusercontent.com/pydicom/pydicom/v3.0.1/src/pydicom/data/test_files'
const PYDICOM_DATA =
  'https://raw.githubusercontent.com/pydicom/pydicom-data/abc42b90985fb6cf385aa4af766d2c9c94a257a4/data_store/data'

const FILES = [
  { url: `${PYDICOM}/CT_small.dcm`, what: 'CT, explicit VR little endian' },
  { url: `${PYDICOM}/MR_small.dcm`, what: 'MR, explicit VR little endian' },
  { url: `${PYDICOM}/MR_small_jp2klossless.dcm`, what: 'MR, JPEG 2000 lossless' },
  { url: `${PYDICOM}/JPEG2000.dcm`, what: 'NM, JPEG 2000 lossy' },
  { url: `${PYDICOM}/SC_rgb_rle.dcm`, what: 'secondary capture, RGB, RLE' },
  { url: `${PYDICOM}/rtdose.dcm`, what: 'RT Dose, 15 frames, implicit VR (phase 8)' },
  { url: `${PYDICOM}/rtstruct.dcm`, what: 'RT Structure Set, no Part 10 header (phase 8)' },
  { url: `${PYDICOM}/waveform_ecg.dcm`, what: '12-lead ECG waveform (phase 8)' },
  { url: `${PYDICOM_DATA}/US1_J2KR.dcm`, what: 'US, YBR_RCT, JPEG 2000 lossless' },
  { url: `${PYDICOM_DATA}/emri_small.dcm`, what: 'MR, multi-frame (10 frames)' },
  { url: `${PYDICOM_DATA}/SC_rgb.dcm`, what: 'secondary capture, RGB' },
  { url: `${PYDICOM_DATA}/JPEG-LL.dcm`, what: 'NM, JPEG lossless' },
  { url: `${PYDICOM_DATA}/liver.dcm`, what: 'DICOM SEG, 3 frames (phase 8)' },
  { url: `${PYDICOM_DATA}/color3d_jpeg_baseline.dcm`, what: 'US, colour, 120 frames, JPEG baseline' },
]

const isPart10 = (bytes) => bytes.length > 132 && bytes.toString('latin1', 128, 132) === 'DICM'

mkdirSync(outDir, { recursive: true })
let failed = 0
for (const { url, what } of FILES) {
  const name = url.split('/').pop()
  const path = join(outDir, name)
  if (existsSync(path) && isPart10(readFileSync(path))) {
    console.log(`  cached  ${name}`)
    continue
  }
  try {
    const response = await fetch(url)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const bytes = Buffer.from(await response.arrayBuffer())
    writeFileSync(path, bytes)
    // Some test files deliberately have no preamble; report them rather than fail.
    console.log(`  ok      ${name} (${(bytes.length / 1024).toFixed(0)} KB, ${what})${isPart10(bytes) ? '' : ' [no Part 10 header]'}`)
  } catch (error) {
    failed++
    console.error(`  FAILED  ${name}: ${error.message}`)
  }
}
console.log(`\n${FILES.length - failed}/${FILES.length} files in ${outDir}`)
process.exit(failed ? 1 : 0)
