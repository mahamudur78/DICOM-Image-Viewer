import { join } from 'node:path'
import type { Page } from '@playwright/test'
import { SAMPLES_DIR, expect, filesIn, openInput, test, viewport, viewportProperties } from './fixtures'

const sample = (...parts: string[]) => join(SAMPLES_DIR, ...parts)
const series = (page: Page, name: string) => page.getByRole('navigation').getByRole('button', { name: new RegExp(name) }).first()

/** Coloured pixels drawn by the object layers of a viewport. */
const objectPixels = (page: Page, viewportId: string) =>
  page.evaluate((id) => {
    let count = 0
    for (const canvas of document.querySelectorAll<HTMLCanvasElement>(`[data-viewport-id="${id}"] [data-testid="object-layer"]`)) {
      if (!canvas.width) continue
      const { data } = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height)
      for (let i = 3; i < data.length; i += 4) if (data[i] > 0) count++
    }
    return count
  }, viewportId)

/** Shows slice `index` (0-based) of a stack viewport. */
async function goToSlice(page: Page, id: string, index: number) {
  await viewport(page, id).click()
  await page.evaluate(
    ({ id, index }) => {
      const engine = (window as unknown as { __dicomlensEngine: () => { getViewport(id: string): { setImageIdIndex(i: number): Promise<unknown> } } }).__dicomlensEngine()
      return engine.getViewport(id).setImageIdIndex(index)
    },
    { id, index },
  )
  await expect.poll(async () => (await viewportProperties(page, id)).index).toBe(index)
}

async function reportsMenu(page: Page, name: string | RegExp) {
  await page.getByRole('button', { name: 'Key images and saved reports' }).click()
  const menu = page.getByRole('menu')
  await menu.getByRole('menuitem', { name }).or(menu.getByRole('menuitemcheckbox', { name })).click()
}

const openObjects = (page: Page) => openInput(page, filesIn(sample('objects')))
const panel = (page: Page) => page.getByRole('complementary', { name: 'Fusion and overlays' })

test('objects are listed with icons and an AI badge, and stay out of the grid', async ({ page }) => {
  await openObjects(page)
  const nav = page.getByRole('navigation')
  for (const name of ['CT planning', 'Tumor segmentation', 'Structures', 'Dose', 'Plan', 'ADC map', 'Measurements', 'Key images', 'Tumor view']) await expect(nav.getByText(name).first()).toBeVisible()
  await expect(series(page, 'Tumor segmentation').getByText('AI', { exact: true })).toBeVisible()
  // Only the CT, the plan and the report (their own viewers) get cells.
  await expect(page.locator('[data-viewport-id]')).toHaveCount(3)
})

test('SEG: segments over the CT, listed with volume, hidden one by one', async ({ page }) => {
  await openObjects(page)
  await series(page, 'Tumor segmentation').click()
  await expect(viewport(page, 'viewport-0')).toContainText('CT planning')
  await goToSlice(page, 'viewport-0', 10)
  await expect.poll(() => objectPixels(page, 'viewport-0'), { timeout: 20_000 }).toBeGreaterThan(200)
  const list = panel(page).getByTestId('segment-list')
  await expect(list).toContainText('Tumor')
  await expect(list).toContainText('Organ')
  await expect(list.getByText('AI', { exact: true })).toBeVisible()
  await expect(list).toContainText('cm³')
  const both = await objectPixels(page, 'viewport-0')
  await list.getByLabel('Show Tumor').uncheck()
  await expect.poll(() => objectPixels(page, 'viewport-0')).toBeLessThan(both)
})

test('RTSTRUCT and RTDOSE: structures, isodose lines and a DVH', async ({ page }) => {
  await openObjects(page)
  await series(page, 'Structures').click()
  await expect(panel(page).getByTestId('segment-list')).toContainText('PTV')
  await series(page, 'Dose').click()
  await goToSlice(page, 'viewport-0', 10)
  await expect(panel(page).getByTestId('isodose-legend')).toContainText('100%')
  await expect.poll(() => objectPixels(page, 'viewport-0'), { timeout: 20_000 }).toBeGreaterThan(200)
  await panel(page).getByRole('button', { name: /Dose-volume histogram: Structures/ }).click()
  const table = panel(page).getByTestId('dvh-table')
  await expect(table).toContainText('PTV')
  await expect(table).toContainText('Organ')
})

test('RT plan: prescription, fractions and beams', async ({ page }) => {
  await openObjects(page)
  await series(page, 'Plan').click()
  const plan = viewport(page, 'viewport-0').getByTestId('rtplan-viewer')
  await expect(plan.getByTestId('rtplan-prescription')).toContainText('60 Gy')
  await expect(plan.getByTestId('rtplan-fractions')).toHaveText('30')
  await expect(plan.getByTestId('rtplan-beams')).toContainText('RLAT')
  await expect(plan.getByTestId('rtplan-beams')).toContainText('6 MV')
})

test('parametric map: an ADC overlay', async ({ page }) => {
  await openObjects(page)
  await series(page, 'ADC map').click()
  await goToSlice(page, 'viewport-0', 10)
  await expect.poll(() => objectPixels(page, 'viewport-0'), { timeout: 20_000 }).toBeGreaterThan(200)
  await expect(panel(page)).toContainText('Parametric map')
})

test('measurement SR: shown on the images, and saved as a new SR', async ({ page }) => {
  await openObjects(page)
  await series(page, 'Measurements').click()
  await viewport(page, 'viewport-0').getByRole('button', { name: 'Show its 3 measurements on the images' }).click()
  await page.getByRole('button', { name: 'Measurements (X)' }).click()
  const measurements = page.getByRole('complementary', { name: 'Measurements' })
  await expect(measurements.getByRole('listitem', { name: 'Length' })).toContainText('30 mm')
  await expect(measurements.getByRole('listitem')).toHaveCount(3)
  const download = page.waitForEvent('download')
  await reportsMenu(page, 'Save measurements (DICOM SR)')
  expect((await download).suggestedFilename()).toMatch(/_SR\.dcm$/)
  await expect(page.getByRole('navigation').getByText('Measurements')).toHaveCount(2)
})

test('key images: a KO shows its images, marking and saving', async ({ page }) => {
  await openObjects(page)
  await series(page, 'Key images').click()
  await expect(viewport(page, 'viewport-0')).toContainText('/ 2')
  await expect(viewport(page, 'viewport-0').getByTestId('key-image')).toBeVisible()
  // Back to all images; mark another one.
  await reportsMenu(page, 'Show only key images')
  await expect(viewport(page, 'viewport-0')).toContainText('/ 20')
  await goToSlice(page, 'viewport-0', 3)
  await expect(viewport(page, 'viewport-0').getByTestId('key-image')).toHaveCount(0)
  await page.keyboard.press('*')
  await expect(viewport(page, 'viewport-0').getByTestId('key-image')).toBeVisible()
  await reportsMenu(page, 'Show only key images')
  await expect(viewport(page, 'viewport-0')).toContainText('/ 3')
  const download = page.waitForEvent('download')
  await reportsMenu(page, /Save key images/)
  expect((await download).suggestedFilename()).toMatch(/_KO\.dcm$/)
})

test('presentation state: window, rotation, zoom, annotations and shutter; saving the view', async ({ page }) => {
  await openObjects(page)
  await series(page, 'Tumor view').click()
  await expect(viewport(page, 'viewport-0')).toContainText('W: 120 L: 60', { timeout: 20_000 })
  const presentation = await page.evaluate(() => {
    const engine = (window as unknown as { __dicomlensEngine: () => { getViewport(id: string): { getViewPresentation(): { rotation: number; flipHorizontal: boolean }; getZoom(): number } } }).__dicomlensEngine()
    const vp = engine.getViewport('viewport-0')
    return { ...vp.getViewPresentation(), zoom: vp.getZoom() }
  })
  expect(presentation).toMatchObject({ rotation: 90, flipHorizontal: true })
  expect(presentation.zoom).toBeGreaterThan(1.5)
  const layer = viewport(page, 'viewport-0').getByTestId('presentation-layer')
  await expect(layer.getByTestId('presentation-shutter')).toHaveCount(1)
  await expect(layer).toContainText('Tumor')
  const download = page.waitForEvent('download')
  await reportsMenu(page, /Save this view/)
  expect((await download).suggestedFilename()).toMatch(/_PR\.dcm$/)
  await expect(page.getByRole('navigation').getByText('Saved view')).toBeVisible()
})

test('ECG: 12 leads with a caliper; audio plays', async ({ page }) => {
  await openInput(page, filesIn(sample('waveform')))
  const ecg = page.getByTestId('waveform-viewer').filter({ hasText: '12 channels' })
  await expect(ecg.getByTestId('waveform-traces')).toContainText('aVF')
  await expect(ecg).toContainText('500 Hz · 12 channels · 10 s')
  const box = (await ecg.getByTestId('waveform-traces').boundingBox())!
  await page.mouse.click(box.x + 40, box.y + 30)
  await page.mouse.click(box.x + 120, box.y + 30)
  await expect(ecg.getByTestId('caliper')).toContainText('ms')
  await ecg.getByLabel('Speed').selectOption('50')
  await series(page, 'Dictation').click()
  const audio = page.getByTestId('audio-player').first()
  await audio.getByRole('button', { name: 'Play' }).click()
  await expect(audio.getByTestId('audio-state')).toContainText('playing')
})

test('whole-slide microscopy: levels, zoom and a measurement', async ({ page }) => {
  await openInput(page, filesIn(sample('slide')))
  const slide = page.getByTestId('slide-viewer')
  await expect(slide.getByTestId('slide-level')).toContainText('Level 1 of 2')
  // Below half the full resolution, the half-size level is drawn.
  for (let i = 0; i < 4; i++) await slide.getByRole('button', { name: 'Zoom out' }).click()
  await expect(slide.getByTestId('slide-level')).toContainText('Level 2 of 2')
  await slide.getByRole('button', { name: 'Fit' }).click()
  await slide.getByRole('button', { name: 'Measure' }).click()
  const box = (await slide.getByTestId('slide-canvas').boundingBox())!
  await page.mouse.move(box.x + box.width / 2 - 50, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 50, box.y + box.height / 2, { steps: 5 })
  await page.mouse.up()
  await expect(slide.getByTestId('slide-length')).toContainText('µm')
})

test('mammography hangs mirrored; tomosynthesis, ophthalmic and dental images open', async ({ page }) => {
  const files = filesIn(sample('special'))
  await openInput(page, files.filter((f) => /(mg|dbt)_/.test(f)))
  for (const [cell, name] of ['R CC', 'L CC', 'R MLO', 'L MLO'].entries()) await expect(viewport(page, `viewport-${cell}`)).toContainText(name)
  const flips = await page.evaluate(() => {
    const engine = (window as unknown as { __dicomlensEngine: () => { getViewport(id: string): { getViewPresentation(): { flipHorizontal: boolean } } } }).__dicomlensEngine()
    return [0, 1, 2, 3].map((cell) => engine.getViewport(`viewport-${cell}`).getViewPresentation().flipHorizontal)
  })
  expect(flips).toEqual([true, false, true, false])
  const nav = page.getByRole('navigation')
  await viewport(page, 'viewport-0').click()
  await nav.getByText('R CC tomosynthesis').click()
  await expect(viewport(page, 'viewport-0')).toContainText('/ 10')

  await openInput(page, files.filter((f) => !/(mg|dbt)_/.test(f)))
  for (const name of ['Fundus photo', 'Macula OCT', 'Bitewing', 'Panoramic']) {
    await viewport(page, 'viewport-0').click()
    await nav.getByText(name).click()
    await expect(viewport(page, 'viewport-0')).toContainText(name)
  }
})

test('phone: a segmentation over its CT @mobile', async ({ page }) => {
  await openObjects(page)
  await series(page, 'Tumor segmentation').click()
  await expect(viewport(page, 'viewport-0')).toContainText('CT planning')
  await expect(page.getByRole('complementary', { name: 'Fusion and overlays' }).getByTestId('segment-list')).toBeVisible()
})
