import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { SAMPLES_DIR, expect, test } from './fixtures'

const allFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? allFiles(path) : [path]
  })

// Formats beyond the CT phantom load side by side; later phases add tests for
// what they need (cine playback, sequence splitting, SUV, calibration).
test('sample formats open, and unreadable files are reported', async ({ page }) => {
  await page.goto('/')
  await page.locator('input[type=file][multiple]').first().setInputFiles(allFiles(SAMPLES_DIR))
  // Checked first: warnings close by themselves after a few seconds.
  await expect(page.getByRole('status')).toContainText('1 file was skipped because it is not a DICOM image.')
  await expect(page.locator('[data-viewport-id]')).toHaveCount(4)
  await expect(page.getByText('Loading images…')).toHaveCount(0)

  const nav = page.getByRole('navigation')
  for (const series of ['US cine', 'Mixed T1/T2', 'PET WB AC', 'Chest PA']) await expect(nav.getByText(series)).toBeVisible()
  await expect(page.locator('[data-viewport-id]').filter({ hasText: 'US cine' })).toContainText('/ 24')
})
