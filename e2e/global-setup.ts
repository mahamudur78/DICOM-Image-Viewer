import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { LARGE_COUNT, LARGE_DIR, PHANTOM_DIR, SAMPLES_DIR } from './fixtures'

const run = (script: string, ...args: string[]) => execFileSync('node', [script, ...args], { stdio: 'inherit' })

/** The version the sample script writes; samples are regenerated when it changes. */
function wantedSamplesVersion() {
  return readFileSync('scripts/generate-samples.mjs', 'utf8').match(/SAMPLES_VERSION = '(\d+)'/)![1]
}

/** Generates the synthetic test data (gitignored) when missing or outdated. */
export default function globalSetup() {
  if (!existsSync(PHANTOM_DIR)) run('scripts/generate-phantom.mjs', PHANTOM_DIR)
  const versionFile = join(SAMPLES_DIR, '.version')
  if (!existsSync(versionFile) || readFileSync(versionFile, 'utf8') !== wantedSamplesVersion()) {
    run('scripts/generate-samples.mjs', SAMPLES_DIR)
  }
  if (!existsSync(join(LARGE_DIR, `large_${String(LARGE_COUNT).padStart(5, '0')}.dcm`))) {
    run('scripts/generate-large-study.mjs', LARGE_DIR, String(LARGE_COUNT))
  }
}
