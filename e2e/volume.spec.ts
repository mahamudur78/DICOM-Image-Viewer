import { readFileSync } from 'node:fs'
import type { Download, Page } from '@playwright/test'
import { expect, openPhantom, test, viewport } from './fixtures'

const bytesOf = async (download: Download) => readFileSync((await download.path())!)

/** Average colour (RGB) around a fraction of a viewport's canvas. */
function canvasPixel(page: Page, id: string, fx = 0.5, fy = 0.5) {
  return page.evaluate(
    ({ id, fx, fy }) => {
      type Vp = { getCanvas(): HTMLCanvasElement; render(): void }
      const engine = (window as unknown as { __dicomlensEngine: () => { getViewport(id: string): Vp } }).__dicomlensEngine()
      const source = engine.getViewport(id).getCanvas()
      const copy = document.createElement('canvas')
      copy.width = source.width
      copy.height = source.height
      const context = copy.getContext('2d')!
      context.drawImage(source, 0, 0)
      // The average of a 21 × 21 patch: single pixels of volume rendering are speckled.
      const { data } = context.getImageData(Math.floor(source.width * fx) - 10, Math.floor(source.height * fy) - 10, 21, 21)
      const sum = [0, 0, 0]
      for (let i = 0; i < data.length; i += 4) for (let c = 0; c < 3; c++) sum[c] += data[i + c]
      return sum.map((v) => Math.round(v / (data.length / 4)))
    },
    { id, fx, fy },
  )
}

const brightness = (rgb: number[]) => rgb[0] + rgb[1] + rgb[2]
// A 3D re-render in SwiftShader on CI can take far longer than the default 15 s.
const RENDER = { timeout: 90_000 }

async function open3d(page: Page) {
  // 3D in a software renderer (SwiftShader) is slow, more so with two workers sharing a CI runner.
  test.setTimeout(480_000)
  await openPhantom(page)
  await viewport(page, 'viewport-1').click()
  await page.getByRole('button', { name: '3D volume rendering' }).click()
  await expect(viewport(page, 'vr-main')).toBeVisible()
  await page.getByRole('button', { name: /^3D settings/ }).click()
  const panel = page.getByRole('complementary', { name: '3D settings' })
  await expect(panel.getByTestId('tf-editor')).toBeVisible({ timeout: 60_000 })
  await page.waitForTimeout(500)
  return panel
}

async function openMpr(page: Page) {
  await openPhantom(page)
  await viewport(page, 'viewport-1').click()
  await page.getByRole('button', { name: /^MPR/ }).click()
  await expect(page.getByText('20 / 40')).toBeVisible({ timeout: 60_000 })
  await page.waitForTimeout(500)
}

async function reformatMenu(page: Page, name: string | RegExp) {
  await page.getByRole('button', { name: /^Reformat/ }).click()
  const menu = page.getByRole('menu')
  await menu.getByRole('menuitem', { name }).or(menu.getByRole('menuitemcheckbox', { name })).click()
}

test('MPR: rotating a plane (oblique) and resetting the planes', async ({ page }) => {
  await openMpr(page)
  const camera = () =>
    page.evaluate(() => {
      const engine = (window as unknown as { __dicomlensEngine: () => { getViewport(id: string): { getCamera(): { viewPlaneNormal: number[] } } } }).__dicomlensEngine()
      return engine.getViewport('mpr-sagittal').getCamera().viewPlaneNormal.map((v) => Math.round(v * 100) / 100)
    })
  const straight = await camera()
  // The rotation handles (circles on the crosshair lines) appear while the mouse is near a line.
  const box = (await viewport(page, 'mpr-axial').boundingBox())!
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.3)
  const handle = await expect
    .poll(() =>
      page.evaluate(() => {
        const svg = document.querySelector('[data-viewport-id="mpr-axial"] svg.svg-layer')
        const circle = svg?.querySelector('circle')
        return circle ? [Number(circle.getAttribute('cx')), Number(circle.getAttribute('cy'))] : null
      }),
    )
    .not.toBeNull()
    .then(() =>
      page.evaluate(() => {
        const circle = document.querySelector('[data-viewport-id="mpr-axial"] svg.svg-layer circle')!
        return [Number(circle.getAttribute('cx')), Number(circle.getAttribute('cy'))]
      }),
    )
  await page.mouse.move(box.x + handle[0], box.y + handle[1], { steps: 3 })
  await page.mouse.down()
  await page.mouse.move(box.x + handle[0] + box.width * 0.25, box.y + handle[1] + 10, { steps: 8 })
  await page.mouse.up()
  await expect.poll(camera).not.toEqual(straight)

  await reformatMenu(page, /^Reset planes/)
  await expect.poll(camera).toEqual(straight)
})

test('MPR: slab handles, window preset, invert and PNG export', async ({ page }) => {
  await openMpr(page)
  const slab = () =>
    page.evaluate(() => {
      const engine = (window as unknown as { __dicomlensEngine: () => { getViewport(id: string): { getSlabThickness(): number } } }).__dicomlensEngine()
      return engine.getViewport('mpr-sagittal').getSlabThickness()
    })
  const thin = await slab()
  // The square slab handles on a crosshair line appear near it; dragging one away thickens the slab.
  const box = (await viewport(page, 'mpr-axial').boundingBox())!
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.3)
  await expect.poll(() => page.locator('[data-viewport-id="mpr-axial"] svg.svg-layer rect').count()).toBeGreaterThan(0)
  const handle = await page.evaluate(() => {
    const rect = document.querySelector('[data-viewport-id="mpr-axial"] svg.svg-layer rect')!
    return [Number(rect.getAttribute('x')) + Number(rect.getAttribute('width')) / 2, Number(rect.getAttribute('y')) + Number(rect.getAttribute('height')) / 2]
  })
  await page.mouse.move(box.x + handle[0], box.y + handle[1], { steps: 3 })
  await page.mouse.down()
  await page.mouse.move(box.x + handle[0] + 40, box.y + handle[1], { steps: 8 })
  await page.mouse.up()
  await expect.poll(slab).toBeGreaterThan(thin + 1)

  // Window presets and invert work on MPR too.
  await page.locator('[data-viewport-id="mpr-axial"]').click({ position: { x: 10, y: 10 } })
  const windows = page.getByRole('combobox', { name: 'Window preset' })
  const lung = (await windows.locator('option').allInnerTexts()).find((o) => o.includes('Lung'))!
  await windows.selectOption({ label: lung })
  await expect(viewport(page, 'mpr-axial')).toContainText('W: 1500 L: -600')
  await page.keyboard.press('i')
  const inverted = await page.evaluate(() => {
    const engine = (window as unknown as { __dicomlensEngine: () => { getViewport(id: string): { getProperties(): { invert?: boolean } } } }).__dicomlensEngine()
    return engine.getViewport('mpr-axial').getProperties().invert
  })
  expect(inverted).toBe(true)
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download PNG' }).click()
  expect(String.fromCharCode(...(await bytesOf(await download)).slice(1, 4))).toBe('PNG')
})

test('MPR: a new series along the view, added to the study', async ({ page }) => {
  await openMpr(page)
  await page.locator('[data-viewport-id="mpr-coronal"]').click({ position: { x: 10, y: 10 } })
  await reformatMenu(page, /^New series from this view/)
  const dialog = page.getByRole('dialog', { name: 'New series along this view' })
  await dialog.getByRole('spinbutton').fill('4')
  await dialog.getByRole('button', { name: 'Apply' }).click()
  await expect(page.getByText(/Added a series of \d+ slices/)).toBeVisible({ timeout: 60_000 })
  await expect(page.getByRole('button', { name: /MPR coronal 4 mm/ })).toBeVisible()
  // It opens like any series, with the reformatted geometry.
  await page.getByRole('button', { name: 'MPR: axial, sagittal and coronal views' }).click()
  await page.getByRole('button', { name: /MPR coronal 4 mm/ }).click()
  await expect(viewport(page, 'viewport-1')).toContainText('MPR coronal 4 mm')
})

test('MPR: curved reformat along a drawn path', async ({ page }) => {
  await openMpr(page)
  await reformatMenu(page, /^Draw a path/)
  const box = (await viewport(page, 'mpr-axial').boundingBox())!
  for (const [fx, fy] of [[0.3, 0.4], [0.5, 0.3], [0.7, 0.4]]) {
    await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy)
  }
  await expect(viewport(page, 'mpr-axial').getByTestId('cpr-overlay').locator('circle')).toHaveCount(3)
  await reformatMenu(page, /^Make curved reformat/)
  const dialog = page.getByRole('dialog', { name: 'Curved reformat' })
  await expect(dialog.getByRole('img', { name: 'Straightened curved reformat' })).toBeVisible()
  await expect(dialog.getByTestId('cpr-size')).toContainText(/Path \d+ mm/)
  const download = page.waitForEvent('download')
  await dialog.getByRole('button', { name: 'Save PNG' }).click()
  expect(String.fromCharCode(...(await bytesOf(await download)).slice(1, 4))).toBe('PNG')
  await dialog.getByRole('button', { name: 'Add to the study' }).click()
  await expect(page.getByText('Curved reformat added to the study.')).toBeVisible()
})

test('3D: transfer function, MIP, crop and clipping change the picture', async ({ page }) => {
  const panel = await open3d(page)
  const before = await canvasPixel(page, 'vr-main')

  // Dragging an opacity point to the top makes more of the volume opaque.
  const points = panel.getByTestId('tf-point')
  const count = await points.count()
  const point = (await points.nth(Math.max(1, count - 2)).boundingBox())!
  await page.mouse.move(point.x + point.width / 2, point.y + point.height / 2)
  await page.mouse.down()
  const editor = (await panel.getByTestId('tf-editor').boundingBox())!
  await page.mouse.move(editor.x + editor.width * 0.3, editor.y + 2, { steps: 5 })
  await page.mouse.up()
  await expect.poll(() => canvasPixel(page, 'vr-main'), RENDER).not.toEqual(before)

  await panel.getByRole('combobox', { name: 'Mode' }).selectOption('mip')
  const mip = await canvasPixel(page, 'vr-main')
  await panel.getByRole('combobox', { name: 'Mode' }).selectOption('composite')

  // Cropping the top half away leaves the top of the view empty.
  await panel.getByRole('slider', { name: 'Top to' }).fill('0.5')
  await expect.poll(async () => brightness(await canvasPixel(page, 'vr-main', 0.5, 0.15)), RENDER).toBeLessThan(30)
  await panel.getByRole('button', { name: 'Show everything' }).click()
  await panel.getByRole('combobox', { name: 'Clipping plane' }).selectOption('coronal')
  await expect(panel.getByRole('slider', { name: 'Position (mm)' })).toBeVisible()
  expect(mip).toBeDefined()
})

test('3D: surface, STL export, snapshots, measuring and the scalpel', async ({ page }) => {
  const panel = await open3d(page)
  await panel.getByRole('spinbutton', { name: 'Threshold' }).fill('300')
  await panel.getByRole('button', { name: 'Show surface' }).click()
  await expect(panel.getByTestId('surface-stats')).toContainText(/\d+ triangles/, { timeout: 60_000 })
  const download = page.waitForEvent('download')
  await panel.getByRole('button', { name: 'STL' }).click()
  const stl = await bytesOf(await download)
  const triangles = new DataView(stl.buffer, stl.byteOffset).getUint32(80, true)
  expect(stl.length).toBe(84 + triangles * 50)
  expect(triangles).toBeGreaterThan(100)
  await panel.getByRole('button', { name: 'Back to volume' }).click()

  await panel.getByRole('button', { name: 'Save snapshot' }).click()
  await panel.getByRole('button', { name: 'Save snapshot' }).click()
  await expect(panel.getByText('Snapshot 2')).toBeVisible()

  // Measuring: two clicks on the surface.
  await panel.getByRole('button', { name: 'Measure distance' }).click()
  const box = (await viewport(page, 'vr-main').boundingBox())!
  await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.5)
  await page.mouse.click(box.x + box.width * 0.6, box.y + box.height * 0.5)
  await expect(viewport(page, 'vr-main').getByTestId('vr-distance')).toHaveText(/^\d+(\.\d)? mm$/)
  await panel.getByRole('button', { name: 'Measure distance' }).click()

  // Scalpel: cut away a box in the middle; undo brings it back.
  const centre = await canvasPixel(page, 'vr-main')
  await panel.getByRole('button', { name: 'Cut away inside' }).click()
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.3)
  await page.mouse.down()
  for (const [fx, fy] of [[0.7, 0.3], [0.7, 0.7], [0.3, 0.7], [0.3, 0.31]]) await page.mouse.move(box.x + box.width * fx, box.y + box.height * fy, { steps: 4 })
  await page.mouse.up()
  await expect(page.getByText(/Cut away \d+ voxels/)).toBeVisible({ timeout: 60_000 })
  await expect.poll(() => canvasPixel(page, 'vr-main'), RENDER).not.toEqual(centre)
  await panel.getByRole('button', { name: /^Undo cut/ }).click()
  // Back to (about) the picture before the cut.
  await expect.poll(async () => Math.abs(brightness(await canvasPixel(page, 'vr-main')) - brightness(centre)), RENDER).toBeLessThan(25)
})

test('3D: rotation movie, high-resolution PNG and endoscopy', async ({ page }) => {
  const panel = await open3d(page)
  await panel.getByRole('spinbutton', { name: 'Frames' }).fill('8')
  await panel.getByRole('combobox', { name: 'Format' }).selectOption('gif')
  const movie = page.waitForEvent('download')
  await panel.getByRole('button', { name: 'Rotation movie' }).click()
  const gif = await bytesOf(await movie)
  expect(String.fromCharCode(...gif.slice(0, 6))).toBe('GIF89a')

  const size = (await viewport(page, 'vr-main').boundingBox())!
  const png = page.waitForEvent('download')
  await panel.getByRole('button', { name: 'PNG ×2' }).click()
  const image = await bytesOf(await png)
  const width = new DataView(image.buffer, image.byteOffset).getUint32(16)
  expect(width).toBeGreaterThan(size.width * 1.5)

  await panel.getByRole('button', { name: 'Look from the volume centre' }).click()
  await expect(panel.getByTestId('endoscopy-state')).toBeVisible()
  const perspective = await page.evaluate(() => {
    const engine = (window as unknown as { __dicomlensEngine: () => { getViewport(id: string): { getCamera(): { parallelProjection?: boolean } } } }).__dicomlensEngine()
    return engine.getViewport('vr-main').getCamera().parallelProjection
  })
  expect(perspective).toBe(false)
  await panel.getByRole('button', { name: 'Leave endoscopy' }).click()
})

test('phone: the 3D settings panel opens @mobile', async ({ page }) => {
  await openPhantom(page)
  await viewport(page, 'viewport-1').click()
  await page.getByRole('button', { name: '3D volume rendering' }).click()
  await page.getByRole('button', { name: /^3D settings/ }).click()
  await expect(page.getByRole('complementary', { name: '3D settings' }).getByTestId('tf-editor')).toBeVisible({ timeout: 60_000 })
})
