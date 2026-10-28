// Reports gzip sizes of the built JavaScript and fails when a budget is exceeded.
// Run after `npm run build`: `npm run size`.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

const DIST = 'dist'
const KB = 1024

// Budgets in gzip KB. Raise them only deliberately, and note why in the phase plan.
const BUDGETS = {
  // JS needed to show the welcome page (index.html's script and its preloads).
  initial: 120,
  // Any single lazy chunk (the Cornerstone/vtk.js runtime is the largest).
  chunk: 900,
  // All JS, including chunks that load only for MPR/3D or for particular
  // formats (pdf.js and its worker, ZIP, TIFF, MP4 muxing). Phase 1 raised it
  // from 1300 for those format chunks; none of them load for ordinary DICOM images.
  total: 1900,
}

const assets = readdirSync(join(DIST, 'assets')).filter((name) => /\.m?js$/.test(name))
const gzipKb = (name) => gzipSync(readFileSync(join(DIST, 'assets', name))).length / KB

const html = readFileSync(join(DIST, 'index.html'), 'utf8')
const initialNames = new Set([...html.matchAll(/assets\/([^"']+\.js)/g)].map((m) => m[1]))

const rows = assets.map((name) => ({ name, kb: gzipKb(name), initial: initialNames.has(name) })).sort((a, b) => b.kb - a.kb)
const initial = rows.filter((r) => r.initial).reduce((sum, r) => sum + r.kb, 0)
const total = rows.reduce((sum, r) => sum + r.kb, 0)

for (const r of rows) console.log(`${r.kb.toFixed(1).padStart(8)} KB  ${r.initial ? 'initial' : 'lazy   '}  ${r.name}`)
console.log(`\ninitial ${initial.toFixed(1)} KB (budget ${BUDGETS.initial}) · total ${total.toFixed(1)} KB (budget ${BUDGETS.total})`)

const failures = [
  initial > BUDGETS.initial && `initial JS ${initial.toFixed(1)} KB > ${BUDGETS.initial} KB`,
  total > BUDGETS.total && `total JS ${total.toFixed(1)} KB > ${BUDGETS.total} KB`,
  ...rows.filter((r) => r.kb > BUDGETS.chunk).map((r) => `${r.name} ${r.kb.toFixed(1)} KB > ${BUDGETS.chunk} KB`),
].filter(Boolean)

if (failures.length) {
  console.error(`\nBundle budget exceeded:\n  ${failures.join('\n  ')}`)
  process.exit(1)
}
