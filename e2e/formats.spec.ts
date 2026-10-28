import { copyFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { Page } from '@playwright/test'
import { SAMPLES_DIR, expect, filesIn, openInput, test, viewport } from './fixtures'

const sample = (...parts: string[]) => join(SAMPLES_DIR, ...parts)
const nav = (page: Page) => page.getByRole('navigation')

const openFiles = (page: Page, files: string | string[]) => openInput(page, files)
const openFolder = (page: Page, folder: string) => openInput(page, folder, { folder: true })

test('a ZIP opens like its files; macOS metadata is ignored', async ({ page }) => {
  await openFiles(page, sample('zip', 'study.zip'))
  await expect(viewport(page, 'viewport-0')).toContainText('PET WB AC')
  await expect(viewport(page, 'viewport-0')).toContainText('/ 8')
  await expect(page.getByRole('status')).toHaveCount(0)
})

test('ZIPs inside ZIPs are unpacked', async ({ page }) => {
  await openFiles(page, sample('zip', 'nested.zip'))
  await expect(viewport(page, 'viewport-0')).toContainText('Chest PA')
})

test('password ZIPs: wrong password asks again, cancel skips', async ({ page }) => {
  await openFiles(page, sample('zip', 'zipcrypto.zip'))
  const dialog = page.getByRole('dialog', { name: 'Password required' })
  await expect(dialog).toContainText('zipcrypto.zip')
  await dialog.getByLabel('Password').fill('nope')
  await dialog.getByRole('button', { name: 'Open' }).click()
  await expect(dialog).toContainText('That password is not correct')
  await dialog.getByLabel('Password').fill('dicom123')
  await dialog.getByRole('button', { name: 'Open' }).click()
  await expect(viewport(page, 'viewport-0')).toContainText('Chest PA')

  await openFiles(page, sample('zip', 'aes.zip'))
  await page.getByRole('dialog', { name: 'Password required' }).getByRole('button', { name: 'Skip this ZIP' }).click()
  await expect(page.getByRole('alert')).toContainText('No DICOM images were found')
})

test('AES-encrypted ZIP opens with the right password', async ({ page }) => {
  await openFiles(page, sample('zip', 'aes.zip'))
  const dialog = page.getByRole('dialog', { name: 'Password required' })
  await dialog.getByLabel('Password').fill('dicom123')
  await dialog.getByLabel('Password').press('Enter')
  await expect(nav(page).getByText('Mixed T1/T2 (1/2)')).toBeVisible()
})

test('a CD folder follows its DICOMDIR', async ({ page }) => {
  await openFolder(page, sample('cd'))
  await expect(viewport(page, 'viewport-0')).toContainText('CD series')
  await expect(viewport(page, 'viewport-0')).toContainText('/ 2')
  // The viewer's logo on the CD is not imported as an image.
  await expect(nav(page).getByText('LOGO.PNG')).toHaveCount(0)
  const toast = page.getByRole('status').filter({ hasText: '1 file could not be opened.' })
  await toast.getByRole('button', { name: 'Details' }).click()
  await expect(page.getByRole('dialog')).toContainText('IMG0003')
  await expect(page.getByRole('dialog')).toContainText('Listed in DICOMDIR but not found')
})

test('opening only the DICOMDIR explains what to do', async ({ page }) => {
  await openFiles(page, sample('cd', 'CD', 'DICOMDIR'))
  const alert = page.getByRole('alert')
  await alert.getByRole('button', { name: 'Details' }).click()
  await expect(page.getByRole('dialog')).toContainText('open the whole CD folder')
})

test('ordinary images become an "Imported images" study; TIFF pages are images', async ({ page }) => {
  await openFiles(page, filesIn(sample('images')))
  for (const name of ['diagram.png', 'photo.jpg', 'screen.bmp', 'animation.gif', 'pixel.webp', 'scan.tif']) {
    await expect(nav(page).getByText(name)).toBeVisible()
  }
  await expect(nav(page).getByText('Imported images')).toBeVisible()
  // Six imported files, four cells: put the TIFF in the active cell.
  await page.locator('nav').getByText('scan.tif').click()
  const tiff = page.locator('[data-viewport-id]').filter({ hasText: 'scan.tif' }).first()
  await expect(tiff).toContainText('/ 2')
  await expect(tiff).toContainText('40 × 30')
  await page.locator('nav').getByText('pixel.webp').click()
  await expect(page.locator('[data-viewport-id]').filter({ hasText: 'pixel.webp' }).first()).toContainText('1 × 1')
})

test('enhanced CT frames get their own positions', async ({ page }) => {
  await openFiles(page, sample('enhanced', 'enhanced_ct.dcm'))
  const target = viewport(page, 'viewport-0')
  await expect(target).toContainText('/ 12')
  await expect(target).toContainText('W: 399 L: 40')
  await expect(target).toContainText('A') // orientation markers come from the shared groups
  await target.click()
  await page.getByLabel('MPR: axial, sagittal and coronal views').click()
  await expect(viewport(page, 'mpr-sagittal')).toBeVisible()
  await expect(page.getByText(/Loading slices|Building volume/)).toHaveCount(0, { timeout: 30_000 })
})

test('palette, planar RGB and YBR_FULL images show their colours', async ({ page }) => {
  await openFiles(page, filesIn(sample('color')))
  await expect(page.locator('[data-viewport-id]')).toHaveCount(3)
  // Each image has red, green and blue bands from left to right; read the decoded RGB pixels.
  const bands: Record<string, number[]> = { 'Palette colour': [6, 18, 30], 'RGB planar': [8, 24, 40], 'YBR full': [8, 24, 40] }
  for (const [description, columns] of Object.entries(bands)) {
    const id = (await page.locator('[data-viewport-id]').filter({ hasText: description }).getAttribute('data-viewport-id'))!
    await expect(page.getByText('Loading images…')).toHaveCount(0)
    const colours = await page.evaluate(
      ({ id, columns }) => {
        const engine = (window as unknown as { __dicomlensEngine: () => { getViewport(id: string): unknown } }).__dicomlensEngine()
        const image = (engine.getViewport(id) as { getCornerstoneImage(): { getPixelData(): ArrayLike<number>; width: number; height: number } }).getCornerstoneImage()
        const data = image.getPixelData()
        const components = data.length / (image.width * image.height)
        const row = Math.floor(image.height / 2)
        return columns.map((x) => {
          const i = (row * image.width + x) * components
          return [data[i], data[i + 1], data[i + 2]]
        })
      },
      { id, columns },
    )
    // The strongest channel of each band: red, green, blue.
    const dominant = colours.map((rgb) => rgb.indexOf(Math.max(...rgb)))
    expect(dominant, description).toEqual([0, 1, 2])
    expect(Math.max(...colours.flat()), description).toBeGreaterThan(200)
  }
})

test('a completely blank image shows without errors', async ({ page }) => {
  await openFiles(page, sample('edge', 'blank.dcm'))
  await expect(viewport(page, 'viewport-0')).toContainText('Blank frame')
  await expect(viewport(page, 'viewport-0')).toContainText(/W: [1-9]/)
})

test('the same image opened twice is shown once', async ({ page }, info) => {
  const copy = info.outputPath('copy-of-dx.dcm')
  mkdirSync(dirname(copy), { recursive: true })
  copyFileSync(sample('basic', 'dx_no_spacing.dcm'), copy)
  await openFiles(page, [sample('basic', 'dx_no_spacing.dcm'), copy])
  await expect(viewport(page, 'viewport-0')).toContainText('1 / 1')
  await expect(page.locator('[data-viewport-id]')).toHaveCount(1)
  // A duplicate is not a failure, so no warning appears.
  await expect(page.getByRole('status')).toHaveCount(0)
})
