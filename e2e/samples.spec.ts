import { join } from 'node:path'
import { SAMPLES_DIR, expect, filesIn, openInput, test } from './fixtures'

// Formats beyond the CT phantom load side by side; later phases add tests for
// what they need (cine playback, sequence splitting, SUV, calibration).
test('sample formats open, and unreadable files are reported', async ({ page }) => {
  await openInput(page, filesIn(join(SAMPLES_DIR, 'basic')))
  // Checked first: warnings close by themselves after a few seconds.
  const toast = page.getByRole('status').filter({ hasText: '1 file could not be opened.' })
  await expect(toast).toBeVisible()
  await toast.getByRole('button', { name: 'Details' }).click()
  const dialog = page.getByRole('dialog', { name: '1 file could not be opened' })
  await expect(dialog).toContainText('broken.dcm')
  await expect(dialog).toContainText('The file is damaged or incomplete')
  await dialog.getByRole('button', { name: 'Close' }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.locator('[data-viewport-id]')).toHaveCount(4)
  await expect(page.getByText('Loading images…')).toHaveCount(0)

  const nav = page.getByRole('navigation')
  for (const series of ['US cine', 'Mixed T1/T2 (1/2)', 'Mixed T1/T2 (2/2)', 'PET WB AC', 'Chest PA']) {
    await expect(nav.getByText(series)).toBeVisible()
  }
  // Five display sets in a 2×2 grid: show the cine in the active cell.
  await nav.getByText('US cine').click()
  await expect(page.locator('[data-viewport-id]').filter({ hasText: 'US cine' })).toContainText('/ 24')
})

test('sidebar groups patients, searches and collapses studies', async ({ page }) => {
  await openInput(page, filesIn(join(SAMPLES_DIR, 'basic')))
  const nav = page.getByRole('navigation', { name: 'Studies and series' })
  for (const patient of ['Sample Ultrasound', 'Sample MR', 'Sample PET', 'Sample Radiograph']) {
    await expect(nav.getByRole('region', { name: patient })).toBeVisible()
  }

  const search = nav.getByRole('searchbox', { name: 'Search patient, study or series' })
  await search.fill('pet')
  await expect(nav.getByText('PET WB AC')).toBeVisible()
  await expect(nav.getByText('US cine')).toHaveCount(0)
  await search.fill('nothing like this')
  await expect(nav).toContainText('Nothing matches the search.')
  await search.fill('')

  const study = nav.getByRole('region', { name: 'Sample MR' }).getByRole('button', { expanded: true })
  await study.click()
  await expect(nav.getByText('Mixed T1/T2 (1/2)')).toHaveCount(0)
  await nav.getByRole('region', { name: 'Sample MR' }).getByRole('button', { expanded: false }).click()
  await expect(nav.getByText('Mixed T1/T2 (1/2)')).toBeVisible()
})
