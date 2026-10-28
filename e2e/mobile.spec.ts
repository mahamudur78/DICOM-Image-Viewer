import { join } from 'node:path'
import { SAMPLES_DIR, expect, filesIn, openInput, test, viewport } from './fixtures'

// Uses touch, so it runs only in the "mobile" project (Pixel 7 size and touch).
test('phone: cine controls, sidebar search and a PDF report @mobile', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile', 'needs a touch device')
  await openInput(page, filesIn(join(SAMPLES_DIR, 'basic')))
  const nav = page.getByRole('navigation', { name: 'Studies and series' })
  const search = nav.getByRole('searchbox')
  await expect(search).toBeVisible()
  await search.fill('cine')
  await nav.getByText('US cine').click()
  const cell = page.locator('[data-viewport-id]').filter({ hasText: 'US cine' }).first()
  const play = cell.getByRole('button', { name: 'Play' })
  await expect(play).toBeVisible()
  const box = (await play.boundingBox())!
  expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(24) // touch target
  await play.tap()
  await expect(cell.getByRole('button', { name: 'Pause' })).toBeVisible()

  await openInput(page, join(SAMPLES_DIR, 'docs', 'report_pdf.dcm'))
  await expect(viewport(page, 'viewport-0').getByLabel('Page 1 of 1')).toBeVisible()
  const pageBox = (await viewport(page, 'viewport-0').getByLabel('Page 1 of 1').boundingBox())!
  expect(pageBox.width).toBeLessThanOrEqual(page.viewportSize()!.width)
})
