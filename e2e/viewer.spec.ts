import { expect, openPhantom, test, viewport, viewportProperties } from './fixtures'

// The hanging protocol puts the scout first: viewport-0 = SCOUT, 1 = Native, 2 = +C, 3 = Recon 2.

test('opens a study into a 2×2 grid with thumbnails @mobile', async ({ page }) => {
  await openPhantom(page)
  for (const name of ['SCOUT', 'Native', '+C', 'Recon 2']) {
    await expect(page.getByRole('navigation').getByText(name, { exact: false }).first()).toBeVisible()
  }
  await expect(viewport(page, 'viewport-1')).toContainText('Native')
  await expect(viewport(page, 'viewport-1')).toContainText('/ 40')
})

test('window preset dropdown follows the viewport window', async ({ page }) => {
  await openPhantom(page)
  await viewport(page, 'viewport-1').click()
  const select = page.getByLabel('Window preset')
  await expect(select.locator('option:checked')).toHaveText('Soft tissue (400/40)')

  await select.selectOption({ label: 'Brain (80/40)' })
  await expect(viewport(page, 'viewport-1')).toContainText('W: 80 L: 40')
  await expect(select.locator('option:checked')).toHaveText('Brain (80/40)')

  // Each viewport shows its own window.
  await viewport(page, 'viewport-3').click()
  await expect(select.locator('option:checked')).toHaveText('Lung (1500/-600)')
})

test('keyboard shortcuts invert, scroll and reset', async ({ page }) => {
  await openPhantom(page)
  await viewport(page, 'viewport-1').click()
  const start = (await viewportProperties(page, 'viewport-1')).index

  await page.keyboard.press('i')
  expect((await viewportProperties(page, 'viewport-1')).invert).toBe(true)

  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  await expect.poll(async () => (await viewportProperties(page, 'viewport-1')).index).toBe(start + 2)

  await page.keyboard.press('r')
  await expect.poll(async () => (await viewportProperties(page, 'viewport-1')).invert).toBe(false)
})

test('layout buttons and double-click maximize', async ({ page }) => {
  await openPhantom(page)
  await page.getByLabel('Layout 1×2').click()
  await expect(page.locator('[data-viewport-id]')).toHaveCount(2)

  await viewport(page, 'viewport-1').dblclick()
  await expect(page.locator('[data-viewport-id]')).toHaveCount(1)
  await viewport(page, 'viewport-1').dblclick()
  await expect(page.locator('[data-viewport-id]')).toHaveCount(2)
})

test('tag panel opens and filters', async ({ page }) => {
  await openPhantom(page)
  await page.keyboard.press('t')
  await expect(page.getByRole('heading', { name: 'DICOM tags' })).toBeVisible()
  await page.getByPlaceholder('Search tag, name or value…').fill('Modality')
  await expect(page.getByRole('cell', { name: 'Modality', exact: true })).toBeVisible()
  await page.getByLabel('Close DICOM tags').click()
  await expect(page.getByRole('heading', { name: 'DICOM tags' })).toHaveCount(0)
})

test('MPR and 3D open and return to the grid', async ({ page }) => {
  await openPhantom(page)
  await viewport(page, 'viewport-1').click()

  await page.getByLabel('MPR: axial, sagittal and coronal views').click()
  for (const id of ['mpr-axial', 'mpr-sagittal', 'mpr-coronal']) await expect(viewport(page, id)).toBeVisible()
  await expect(page.getByText(/Loading slices|Building volume/)).toHaveCount(0, { timeout: 30_000 })
  await expect(viewport(page, 'mpr-axial')).toContainText('W: 400 L: 40')

  await page.getByLabel('3D volume rendering').click()
  await expect(viewport(page, 'vr-main')).toContainText('CT-Bone')

  await page.getByLabel('3D volume rendering').click()
  await expect(page.locator('[data-viewport-id]')).toHaveCount(4)
})
