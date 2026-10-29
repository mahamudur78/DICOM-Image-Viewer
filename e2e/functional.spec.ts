import { join } from 'node:path'
import type { Page } from '@playwright/test'
import { SAMPLES_DIR, expect, filesIn, openInput, test, viewport } from './fixtures'

const sample = (...parts: string[]) => join(SAMPLES_DIR, ...parts)

async function functionalMenu(page: Page, name: string | RegExp) {
  await page.getByRole('button', { name: 'Fusion, PET/CT, curves and DSA' }).click()
  const menu = page.getByRole('menu')
  await menu.getByRole('menuitem', { name }).or(menu.getByRole('menuitemcheckbox', { name })).or(menu.getByRole('menuitemradio', { name })).click()
}

/** Page position of an image pixel (column, row) in a stack viewport. */
function toPage(page: Page, [x, y]: [number, number]) {
  return page.evaluate(
    ({ x, y }) => {
      type Vp = { type: string; element: HTMLElement; getImageData(): { origin: number[]; direction: number[]; spacing: number[] }; worldToCanvas(p: number[]): [number, number] }
      const engine = (window as unknown as { __dicomlensEngine: () => { getViewports(): Vp[] } }).__dicomlensEngine()
      const vp = engine.getViewports().find((v) => v.type === 'stack')!
      const { origin, direction, spacing } = vp.getImageData()
      const world = [0, 1, 2].map((i) => origin[i] + x * spacing[0] * direction[i] + y * spacing[1] * direction[3 + i])
      const [cx, cy] = vp.worldToCanvas(world)
      const rect = vp.element.getBoundingClientRect()
      return [rect.left + cx, rect.top + cy] as [number, number]
    },
    { x, y },
  )
}

async function drag(page: Page, from: [number, number], to: [number, number]) {
  await page.mouse.move(...(await toPage(page, from)), { steps: 3 })
  await page.mouse.down()
  await page.mouse.move(...(await toPage(page, to)), { steps: 6 })
  await page.mouse.up()
  await page.waitForTimeout(450)
}

async function chooseTool(page: Page, name: string | RegExp) {
  await page.getByRole('button', { name: 'Measurement tools' }).click()
  await page.getByRole('menuitemradio', { name }).click()
}

/** Coloured (non-transparent) pixels drawn by the fusion layer of a viewport. */
const fusionPixels = (page: Page, viewportId: string) =>
  page.evaluate((id) => {
    const canvas = document.querySelector<HTMLCanvasElement>(`[data-viewport-id="${id}"] [data-testid="fusion-layer"]`)
    if (!canvas?.width) return 0
    const { data } = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height)
    let count = 0
    for (let i = 3; i < data.length; i += 4) if (data[i] > 0) count++
    return count
  }, viewportId)

const showSeries = (page: Page, name: string) => page.getByRole('navigation').getByText(name, { exact: false }).first().click()

test('fusion: PET over CT in a cell, with registration', async ({ page }) => {
  await openInput(page, filesIn(sample('fusion')))
  await showSeries(page, 'CT for fusion')
  await expect(viewport(page, 'viewport-0')).toContainText('CT for fusion')
  await functionalMenu(page, /^Fusion \(lay another/)
  const panel = page.getByRole('complementary', { name: 'Fusion' })
  const overlay = panel.getByLabel('Lay over')
  await overlay.selectOption((await overlay.locator('option', { hasText: 'PET AC' }).getAttribute('value'))!)
  await panel.getByRole('button', { name: 'Fuse' }).click()
  await expect(panel.getByTestId('fusion-controls')).toBeVisible()
  await expect(viewport(page, 'viewport-0').getByTestId('fusion-layer')).toBeVisible()
  await expect.poll(() => fusionPixels(page, 'viewport-0'), { timeout: 30_000 }).toBeGreaterThan(100)

  // Same frame of reference: no shift. Moving it is shown in the registration text.
  await expect(panel.getByTestId('registration')).toHaveText('Moved 0, 0, 0 mm · turned 0, 0, 0°')
  await panel.getByLabel('Move x (mm)').fill('20')
  await panel.getByLabel('Turn z (°)').fill('10')
  await expect(panel.getByTestId('registration')).toHaveText('Moved 20, 0, 0 mm · turned 0, 0, 10°')
  await panel.getByRole('button', { name: 'Reset registration' }).click()
  await expect(panel.getByTestId('registration')).toHaveText('Moved 0, 0, 0 mm · turned 0, 0, 0°')

  // Hiding the overlay clears the layer.
  await panel.getByLabel('Show the overlay').uncheck()
  await expect.poll(() => fusionPixels(page, 'viewport-0')).toBe(0)
  await panel.getByRole('button', { name: 'Remove the overlay' }).click()
  await expect(viewport(page, 'viewport-0').getByTestId('fusion-layer')).toHaveCount(0)
})

test('PET/CT layout: CT, PET and fused rows with a rotating MIP', async ({ page }) => {
  test.slow()
  await openInput(page, filesIn(sample('fusion')))
  await showSeries(page, 'CT for fusion')
  await functionalMenu(page, 'PET/CT layout')
  await expect(page.getByTestId('petct-layout')).toBeVisible({ timeout: 60_000 })
  for (const id of ['mpr-axial', 'petct-pet-axial', 'petct-fused-axial', 'petct-mip']) await expect(viewport(page, id)).toBeVisible()
  await expect.poll(() => fusionPixels(page, 'petct-fused-axial'), { timeout: 60_000 }).toBeGreaterThan(100)
  // The plain CT row has no overlay.
  await expect(viewport(page, 'mpr-axial').getByTestId('fusion-layer')).toHaveCount(0)
})

test('sphere ROI on PET: SUV max, mean and peak', async ({ page }) => {
  await openInput(page, filesIn(sample('fusion')))
  await showSeries(page, 'PET AC')
  await expect(viewport(page, 'viewport-0')).toContainText('PET AC')
  await chooseTool(page, 'Sphere ROI (SUV peak)')
  await drag(page, [16, 16], [16, 26])
  await page.getByRole('button', { name: 'Measurements (X)' }).click()
  const values = page.getByRole('complementary', { name: 'Measurements' }).getByRole('listitem', { name: 'Sphere' }).getByTestId('measurement-values')
  await expect(values).toContainText('Max')
  await expect(values).toContainText('Ball mean')
  await expect(values).toContainText('Peak')
})

test('time-intensity curves: persistent, plateau and washout', async ({ page }) => {
  await openInput(page, filesIn(sample('dynamic')))
  await expect(viewport(page, 'viewport-0')).toContainText('DCE dynamic')
  await chooseTool(page, 'Circle ROI')
  for (const x of [12, 24, 36]) await drag(page, [x, 24], [x + 2.5, 24])
  await functionalMenu(page, /^Time-intensity curves/)
  const panel = page.getByRole('complementary', { name: 'Time-intensity curves' })
  await expect(panel).toContainText('6 phases of 3 slices')
  await expect(panel.getByTestId('tic-chart')).toBeVisible({ timeout: 30_000 })
  await expect(panel.getByTestId('tic-type')).toHaveText([/^I[ab] persistent$/, 'II plateau', 'III washout'])
  const download = page.waitForEvent('download')
  await panel.getByRole('button', { name: 'Save curves (CSV)' }).click()
  expect((await download).suggestedFilename()).toBe('time-intensity.csv')
})

test('DSA: mask, motion shift and a new series', async ({ page }) => {
  await openInput(page, sample('dsa', 'angio.dcm'))
  await viewport(page, 'viewport-0').click()
  await page.keyboard.press('Home')
  await functionalMenu(page, /^Digital subtraction/)
  const panel = page.getByRole('complementary', { name: 'Digital subtraction' })
  await expect(panel.getByTestId('dsa-status')).toContainText('Frame 1 of 10 · mask 1 · shift 0, 0 px', { timeout: 30_000 })
  // Frame 8: the patient moved 2 px; the found shift follows.
  await viewport(page, 'viewport-0').click()
  for (let i = 0; i < 7; i++) await page.keyboard.press('ArrowDown')
  await expect(panel.getByTestId('dsa-status')).toContainText('Frame 8 of 10')
  await panel.getByLabel('Pixel shift found for each frame (motion)').check()
  await expect(panel.getByTestId('dsa-status')).toContainText('shift 2, 0 px')
  await panel.getByRole('button', { name: 'New mask from this frame' }).click()
  await expect(panel).toContainText('From frame 8: mask 8')
  await panel.getByRole('button', { name: 'Add the DSA series' }).click()
  await expect(page.getByRole('navigation').getByText('DSA Run 1').first()).toBeVisible({ timeout: 30_000 })
  await expect(viewport(page, 'viewport-0')).toContainText('DSA Run 1')
})

test('4D: MPR of a dynamic series steps through its phases', async ({ page }) => {
  test.slow()
  await openInput(page, filesIn(sample('4d')))
  await viewport(page, 'viewport-0').click()
  await functionalMenu(page, /^4D/)
  const controls = page.getByTestId('phase-controls')
  await expect(controls).toBeVisible({ timeout: 60_000 })
  await expect(controls.getByTestId('phase-label')).toHaveText('Phase 1 / 4')
  await controls.getByRole('slider', { name: 'Phase' }).fill('2')
  await expect(controls.getByTestId('phase-label')).toHaveText('Phase 3 / 4')
  await expect(viewport(page, 'mpr-axial')).toBeVisible()
  await controls.getByRole('button', { name: 'Play the phases' }).click()
  await expect(controls.getByTestId('phase-label')).not.toHaveText('Phase 3 / 4', { timeout: 10_000 })
  await controls.getByRole('button', { name: 'Stop the phases' }).click()
})

test('phone: the fusion panel opens @mobile', async ({ page }) => {
  await openInput(page, filesIn(sample('fusion')))
  await functionalMenu(page, /^Fusion \(lay another/)
  await expect(page.getByRole('complementary', { name: 'Fusion' }).getByLabel('Lay over')).toBeVisible()
})
