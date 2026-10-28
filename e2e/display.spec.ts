import { join } from 'node:path'
import type { Page } from '@playwright/test'
import { SAMPLES_DIR, expect, filesIn, openInput, openPhantom, test, viewport } from './fixtures'

const sample = (...parts: string[]) => join(SAMPLES_DIR, ...parts)

/** Reads values from a Cornerstone viewport through the dev test hook. */
function inViewport<T>(page: Page, id: string, read: string): Promise<T> {
  return page.evaluate(
    ([viewportId, body]) => {
      const vp = (window as unknown as { __dicomlensEngine: () => { getViewport(id: string): unknown } }).__dicomlensEngine().getViewport(viewportId)
      return new Function('vp', `return (${body})`)(vp)
    },
    [id, read],
  ) as Promise<T>
}

/** Opens a toolbar menu and picks an item (plain, radio or checkbox). */
async function menu(page: Page, button: string, item: string) {
  await page.getByRole('button', { name: button }).click()
  const list = page.getByRole('menu')
  await list
    .getByRole('menuitem', { name: item, exact: true })
    .or(list.getByRole('menuitemradio', { name: item, exact: true }))
    .or(list.getByRole('menuitemcheckbox', { name: item, exact: true }))
    .click()
}

test('rotation: left, right, 180 and an exact angle', async ({ page }) => {
  await openPhantom(page)
  await viewport(page, 'viewport-1').click()
  const rotation = () => inViewport<number>(page, 'viewport-1', 'vp.getViewPresentation().rotation')
  await page.getByRole('button', { name: 'Rotate left 90°' }).click()
  await expect.poll(rotation).toBe(270)
  await menu(page, 'View options', 'Rotate 180°')
  await expect.poll(rotation).toBe(90)
  await menu(page, 'View options', 'Rotate by angle…')
  const dialog = page.getByRole('dialog', { name: 'Rotate by angle…' })
  await dialog.getByLabel('Angle (degrees, clockwise)').fill('30')
  await dialog.getByRole('button', { name: 'Apply' }).click()
  await expect.poll(rotation).toBeCloseTo(30, 5)
})

test('zoom: 1:1, 200 %, actual size and fit', async ({ page }) => {
  await openPhantom(page)
  await viewport(page, 'viewport-1').click()
  // Screen pixels per image pixel, measured along an image row.
  const scale = () =>
    inViewport<number>(page, 'viewport-1', `(() => { const d = vp.getImageData(); const o = d.origin; const r = [d.direction[0], d.direction[1], d.direction[2]]; const a = vp.worldToCanvas(o); const b = vp.worldToCanvas([o[0] + r[0] * d.spacing[0], o[1] + r[1] * d.spacing[0], o[2] + r[2] * d.spacing[0]]); return Math.hypot(b[0] - a[0], b[1] - a[1]) })()`)
  await menu(page, 'View options', '1:1 (100%)')
  await expect.poll(scale).toBeCloseTo(1, 1)
  await menu(page, 'View options', '200%')
  await expect.poll(scale).toBeCloseTo(2, 1)
  // The phantom has 1 mm pixels; at 96 DPI one millimetre is 96 / 25.4 screen pixels.
  await menu(page, 'View options', 'Actual size (mm)')
  await expect.poll(scale).toBeCloseTo(96 / 25.4, 1)
  await menu(page, 'View options', 'Fit to window')
  await expect.poll(() => inViewport<number>(page, 'viewport-1', 'vp.getZoom()')).toBeCloseTo(1, 2)
})

test('pixel smoothing, colormap and image filter; reset clears them', async ({ page }) => {
  await openPhantom(page)
  const cell = viewport(page, 'viewport-1')
  await cell.click()
  await menu(page, 'View options', 'Smooth pixels')
  await expect.poll(() => inViewport<number>(page, 'viewport-1', 'vp.getProperties().interpolationType')).toBe(0) // NEAREST

  await menu(page, 'Colormap and filters', 'Hot (PET)')
  await expect.poll(() => inViewport<string>(page, 'viewport-1', 'vp.getProperties().colormap?.name')).toBe('2hot')

  await menu(page, 'Colormap and filters', 'Sharpen')
  const filter = () => cell.locator('canvas').first().evaluate((c: HTMLCanvasElement) => c.style.filter)
  await expect.poll(filter).toContain('dicomlens-filter-sharpen-2')
  await expect(cell).toContainText('Sharpen')
  await menu(page, 'Colormap and filters', 'Strength 3')
  await expect.poll(filter).toContain('dicomlens-filter-sharpen-3')

  await page.keyboard.press('r')
  await expect.poll(filter).toBe('')
  await expect.poll(() => inViewport<string | undefined>(page, 'viewport-1', 'vp.getProperties().colormap?.name')).not.toBe('2hot')
})

test('colour images offer no colormap or window presets', async ({ page }) => {
  await openInput(page, sample('color', 'rgb_planar.dcm'))
  await viewport(page, 'viewport-0').click()
  await expect(page.getByLabel('Window preset')).toHaveCount(0)
  await page.getByRole('button', { name: 'Colormap and filters' }).click()
  await expect(page.getByRole('menu')).not.toContainText('Hot (PET)')
  await expect(page.getByRole('menu')).toContainText('Sharpen')
})

/** Opaque pixels drawn on the DICOM overlay layer. */
const overlayPixels = (page: Page, id: string) =>
  page.locator(`[data-viewport-id="${id}"] [data-testid="dicom-overlay"]`).evaluate((canvas: HTMLCanvasElement) => {
    const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data
    let count = 0
    for (let i = 3; i < data.length; i += 4) if (data[i] > 0) count++
    return count
  })

test('DICOM overlay planes are drawn, per frame, and can be hidden', async ({ page }) => {
  await openInput(page, filesIn(sample('overlay')))
  const single = page.locator('[data-viewport-id]').filter({ hasText: 'Overlay box' })
  const id = (await single.getAttribute('data-viewport-id'))!
  await expect.poll(() => overlayPixels(page, id)).toBeGreaterThan(100)

  const multi = page.locator('[data-viewport-id]').filter({ hasText: 'Overlay per frame' })
  const multiId = (await multi.getAttribute('data-viewport-id'))!
  await multi.click()
  await page.keyboard.press('End')
  await expect(multi).toContainText('2 / 2')
  await expect.poll(() => overlayPixels(page, multiId)).toBeGreaterThan(100)
  const frame2 = await overlayPixels(page, multiId)
  await page.keyboard.press('Home')
  await expect(multi).toContainText('1 / 2')
  // The first frame's box is larger (inset 4 instead of 20).
  await expect.poll(() => overlayPixels(page, multiId)).toBeGreaterThan(frame2)

  await page.keyboard.press('v')
  await expect(page.locator('[data-testid="dicom-overlay"]')).toHaveCount(0)
  await page.keyboard.press('v')
})

test('privacy hides the patient; corner text can be switched off', async ({ page }) => {
  await openPhantom(page)
  const cell = viewport(page, 'viewport-1')
  await expect(cell).toContainText('Phantom Demo')
  await page.keyboard.press('h')
  await expect(cell).toContainText('Patient hidden')
  await expect(cell).not.toContainText('DEMO-001')
  await page.keyboard.press('h')
  await menu(page, 'View options', 'Text in the corners')
  await expect(cell.getByTestId('overlay-text')).toHaveCount(0)
  await menu(page, 'View options', 'Text in the corners')
  // Single items can be hidden too.
  await expect(cell).toContainText('/ 40')
  await menu(page, 'View options', 'Image number')
  await expect(cell).not.toContainText('/ 40')
  await expect(cell).toContainText('Phantom Demo')
  await menu(page, 'View options', 'Image number')
})

test('full screen with F', async ({ page }) => {
  await openPhantom(page)
  await viewport(page, 'viewport-1').click()
  await page.keyboard.press('f')
  await expect.poll(() => page.evaluate(() => document.fullscreenElement !== null)).toBe(true)
  await page.keyboard.press('f')
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true)
})

test('value under the mouse: HU for CT', async ({ page }) => {
  await openPhantom(page)
  const cell = viewport(page, 'viewport-1')
  const box = (await cell.boundingBox())!
  // Centre of the phantom: soft tissue around the aorta (40–45 HU).
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await expect(cell.getByTestId('pixel-value')).toContainText(/\(\d+, \d+\) -?\d+ HU/)
})

test('PET: SUV values, inverted 0–5 SUV window by default', async ({ page }) => {
  await openInput(page, filesIn(sample('basic', 'pet')))
  const cell = viewport(page, 'viewport-0')
  await expect(cell).toContainText('PET WB AC')
  await expect.poll(() => inViewport<boolean>(page, 'viewport-0', 'vp.getProperties().invert')).toBe(true)
  await expect.poll(() => inViewport<{ lower: number; upper: number }>(page, 'viewport-0', 'vp.getProperties().voiRange')).toEqual({ lower: 0, upper: 5 })
  const box = (await cell.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await expect(cell.getByTestId('pixel-value')).toContainText('SUVbw')
  await expect(cell.getByTestId('pixel-value')).toContainText('SUVlbm')
  await expect(cell.getByTestId('pixel-value')).toContainText('SUVbsa')
})

test('scale bar can be switched on', async ({ page }) => {
  await openPhantom(page)
  const cell = viewport(page, 'viewport-1')
  const lines = () => cell.locator('svg [data-annotation-uid], svg g').count()
  const before = await lines()
  await menu(page, 'View options', 'Scale bar')
  await expect.poll(lines).toBeGreaterThan(before)
})

test('layout picker: presets and a free rows × columns grid', async ({ page }) => {
  await openPhantom(page)
  await page.getByRole('button', { name: 'More layouts' }).click()
  await page.getByRole('dialog', { name: 'More layouts' }).getByRole('button', { name: 'Layout 3×3' }).click()
  await expect(page.locator('[data-viewport-id]')).toHaveCount(4) // four series, nine cells
  await expect(page.getByText('Drag a series here')).toHaveCount(5)
  await page.getByRole('button', { name: 'More layouts' }).click()
  await page.getByRole('group', { name: 'Rows and columns' }).getByRole('button', { name: '4 rows × 4 columns' }).click()
  await expect(page.getByText('Drag a series here')).toHaveCount(12)
})

test('images-only mode hides the toolbars until Escape', async ({ page }) => {
  await openPhantom(page)
  await page.keyboard.press('d')
  await expect(page.getByRole('button', { name: 'Window / Level (W)' })).toHaveCount(0)
  await expect(page.getByRole('navigation')).toHaveCount(0)
  await expect(page.locator('[data-viewport-id]')).toHaveCount(4)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'Window / Level (W)' })).toBeVisible()
})

test('PNG export includes the image filter', async ({ page }) => {
  await openPhantom(page)
  await viewport(page, 'viewport-1').click()
  const exportPixels = async () => {
    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Download PNG' }).click()
    const path = await (await download).path()
    const { readFileSync } = await import('node:fs')
    return readFileSync(path!).toString('base64')
  }
  const plain = await exportPixels()
  await menu(page, 'Colormap and filters', 'Edges')
  const edges = await exportPixels()
  expect(edges).not.toBe(plain)
})
