import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { PHANTOM_DIR, SAMPLES_DIR } from './fixtures'

/** Generates the synthetic test data once (it is gitignored). */
export default function globalSetup() {
  if (!existsSync(PHANTOM_DIR)) execFileSync('node', ['scripts/generate-phantom.mjs', PHANTOM_DIR], { stdio: 'inherit' })
  if (!existsSync(SAMPLES_DIR)) execFileSync('node', ['scripts/generate-samples.mjs', SAMPLES_DIR], { stdio: 'inherit' })
}
