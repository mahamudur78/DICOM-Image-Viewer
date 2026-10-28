import { join } from 'node:path'
import type { Page } from '@playwright/test'
import { SAMPLES_DIR, expect, openInput, test, viewport } from './fixtures'

const sample = (...parts: string[]) => join(SAMPLES_DIR, ...parts)

/** The viewport's window as width/center, rounded like the overlay. */
const windowOf = (page: Page, id = 'viewport-0') =>
  page.evaluate((viewportId) => {
    const engine = (window as unknown as { __dicomlensEngine: () => { getViewport(id: string): { getProperties(): { voiRange: { lower: number; upper: number } } } } }).__dicomlensEngine()
    const { lower, upper } = engine.getViewport(viewportId).getProperties().voiRange
    return { width: Math.round(upper - lower), center: Math.round((upper + lower) / 2) }
  }, id)

test('window dropdown: header windows with explanations, number keys, auto, full range, custom', async ({ page }) => {
  await openInput(page, sample('window', 'mr_windows.dcm'))
  const select = page.getByLabel('Window preset')
  await expect(select.locator('option:checked')).toHaveText('1. SOFT (600/300)')
  await expect(select.locator('option', { hasText: '2. WIDE (1200/600)' })).toHaveCount(1)

  await viewport(page, 'viewport-0').click()
  await page.keyboard.press('2')
  await expect.poll(() => windowOf(page)).toEqual({ width: 1200, center: 600 })
  await expect(select.locator('option:checked')).toHaveText('2. WIDE (1200/600)')
  await page.keyboard.press('0')
  await expect.poll(() => windowOf(page)).toEqual({ width: 600, center: 300 })

  // The ramp runs 0..992 left to right.
  await select.selectOption('fullRange')
  await expect.poll(() => windowOf(page)).toEqual({ width: 992, center: 496 })

  await select.selectOption('custom')
  const dialog = page.getByRole('dialog', { name: 'Custom window…' })
  await dialog.getByLabel('Window width').fill('100')
  await dialog.getByLabel('Window level (center)').fill('50')
  await dialog.getByRole('button', { name: 'Apply' }).click()
  await expect.poll(() => windowOf(page)).toEqual({ width: 100, center: 50 })
  await expect(select.locator('option:checked')).toHaveText('W/L 100/50')
})

test('my presets: add the current window, rename, use with a number key, delete', async ({ page }) => {
  await openInput(page, sample('window', 'mr_windows.dcm'))
  const select = page.getByLabel('Window preset')
  await select.selectOption('custom')
  const custom = page.getByRole('dialog', { name: 'Custom window…' })
  await custom.getByLabel('Window width').fill('250')
  await custom.getByLabel('Window level (center)').fill('125')
  await custom.getByRole('button', { name: 'Apply' }).click()

  await select.selectOption('manage')
  const dialog = page.getByRole('dialog', { name: 'My window presets (MR)' })
  await expect(dialog).toContainText('No presets yet')
  await dialog.getByPlaceholder('Preset name').fill('Spine')
  await dialog.getByRole('button', { name: 'Add' }).click()
  await dialog.getByRole('textbox', { name: 'Preset name' }).first().fill('Spine T2')
  await dialog.getByRole('button', { name: 'Close' }).click()

  await expect(select.locator('option', { hasText: '3. Spine T2 (250/125)' })).toHaveCount(1)
  await page.keyboard.press('1')
  await viewport(page, 'viewport-0').click()
  await page.keyboard.press('3')
  await expect.poll(() => windowOf(page)).toEqual({ width: 250, center: 125 })

  // Presets survive a reload.
  await openInput(page, sample('window', 'mr_windows.dcm'))
  await expect(page.getByLabel('Window preset').locator('option', { hasText: 'Spine T2' })).toHaveCount(1)
  await page.getByLabel('Window preset').selectOption('manage')
  await page.getByRole('button', { name: 'Delete Spine T2' }).click()
  await expect(page.getByRole('dialog')).toContainText('No presets yet')
})

test('auto window ignores the extremes that full range includes', async ({ page }) => {
  await openInput(page, sample('window', 'outliers.dcm'))
  const select = page.getByLabel('Window preset')
  await select.selectOption('fullRange')
  await expect.poll(() => windowOf(page)).toEqual({ width: 59998, center: 30001 })
  await select.selectOption('auto')
  // Values 2..1023 without the two 60000 pixels: the 1st to 99th percentile.
  const auto = await windowOf(page)
  expect(auto.width).toBeGreaterThan(950)
  expect(auto.width).toBeLessThan(1022)
})

test('ROI window: dragging a box over the dark part narrows the window to it', async ({ page }) => {
  await openInput(page, sample('window', 'mr_windows.dcm'))
  const cell = viewport(page, 'viewport-0')
  await cell.click()
  await page.keyboard.press('g')
  await expect(page.getByRole('button', { name: /Window from a region/ })).toHaveAttribute('aria-pressed', 'true')
  // The image is centred; drag over its left fifth (values about 0..200).
  const box = (await cell.boundingBox())!
  const side = Math.min(box.width, box.height)
  const left = box.x + (box.width - side) / 2
  const top = box.y + (box.height - side) / 2
  await page.mouse.move(left + side * 0.03, top + side * 0.3)
  await page.mouse.down()
  await page.mouse.move(left + side * 0.18, top + side * 0.7, { steps: 6 })
  await page.mouse.up()
  await expect.poll(async () => (await windowOf(page)).center).toBeLessThan(200)
})

/** Red value of the rendered image at a fraction of the canvas width, on the middle row. */
const brightness = (page: Page, id: string, fx: number) =>
  page.evaluate(
    ([viewportId, x]) => {
      const vp = (window as unknown as { __dicomlensEngine: () => { getViewport(id: string): { getCanvas(): HTMLCanvasElement } } }).__dicomlensEngine().getViewport(viewportId)
      const source = vp.getCanvas()
      const copy = document.createElement('canvas')
      copy.width = source.width
      copy.height = source.height
      const context = copy.getContext('2d')!
      context.drawImage(source, 0, 0)
      return context.getImageData(Math.floor(source.width * x), Math.floor(source.height / 2), 1, 1).data[0]
    },
    [id, fx] as const,
  )

test('VOI LUT, Presentation LUT INVERSE and the sigmoid VOI function are honoured', async ({ page }) => {
  // Each image is a ramp, dark on the left; the VOI LUT and INVERSE both turn it around.
  for (const [file, leftBrighter] of [['mr_windows.dcm', false], ['voi_lut.dcm', true], ['inverse.dcm', true]] as const) {
    await openInput(page, sample('window', file))
    await expect.poll(async () => (await brightness(page, 'viewport-0', 0.36)) > (await brightness(page, 'viewport-0', 0.64)), { message: file }).toBe(leftBrighter)
  }
  // The VOI LUT is listed and selected; picking a window replaces it.
  const select = page.getByLabel('Window preset')
  await openInput(page, sample('window', 'voi_lut.dcm'))
  await expect(select.locator('option:checked')).toHaveText('VOI LUT from the image: INVERTING LUT')
  await select.selectOption('fullRange')
  await expect.poll(async () => (await brightness(page, 'viewport-0', 0.36)) < (await brightness(page, 'viewport-0', 0.64))).toBe(true)

  await openInput(page, sample('window', 'sigmoid.dcm'))
  await page.getByRole('button', { name: 'View options' }).click()
  await expect(page.getByRole('menuitemcheckbox', { name: 'Sigmoid window curve' })).toHaveAttribute('aria-checked', 'true')
  await page.keyboard.press('Escape')
})
