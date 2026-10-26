// Copies the Cornerstone codec WASM files into public/wasm so the decode
// workers can fetch them from a stable URL (see wasmBasePath in init.ts).
import { copyFileSync, mkdirSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const codecs = [
  'codec-charls',
  'codec-libjpeg-turbo-8bit',
  'codec-libjxl',
  'codec-openjpeg',
  'codec-openjph',
]
const outDir = 'public/wasm'
mkdirSync(outDir, { recursive: true })

for (const codec of codecs) {
  const distDir = join('node_modules/@cornerstonejs', codec, 'dist')
  for (const file of readdirSync(distDir)) {
    if (file.endsWith('_decode.wasm') || file === 'openjphjs.wasm') copyFileSync(join(distDir, file), join(outDir, file))
  }
}
console.log(`Copied codec WASM files to ${outDir}`)
