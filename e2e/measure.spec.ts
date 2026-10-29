import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Page } from '@playwright/test'
import { SAMPLES_DIR, expect, openInput, openPhantom, test, viewport } from './fixtures'

const sample = (...parts: string[]) => join(SAMPLES_DIR, ...parts)

/** Page position of an image pixel (column, row) in a stack viewport. */
function toPage(page: Page, [x, y]: [number, number], viewportId?: string) {
  return page.evaluate(
    ({ x, y, viewportId }) => {
      type Vp = {
        id: string
        type: string
        element: HTMLElement
        getImageData(): { origin: number[]; direction: number[]; spacing: number[] }
        worldToCanvas(p: number[]): [number, number]
      }
      const engine = (window as unknown as { __dicomlensEngine: () => { getViewports(): Vp[] } }).__dicomlensEngine()
      const vp = engine.getViewports().find((v) => (viewportId ? v.id === viewportId : v.type === 'stack'))!
      const { origin, direction, spacing } = vp.getImageData()
      const world = [0, 1, 2].map((i) => origin[i] + x * spacing[0] * direction[i] + y * spacing[1] * direction[3 + i])
      const [cx, cy] = vp.worldToCanvas(world)
      const rect = vp.element.getBoundingClientRect()
      return [rect.left + cx, rect.top + cy] as [number, number]
    },
    { x, y, viewportId },
  )
}

// Clicks are spaced out: Cornerstone takes two quick clicks for a double-click.
async function drag(page: Page, from: [number, number], to: [number, number], viewportId?: string) {
  await page.mouse.move(...(await toPage(page, from, viewportId)), { steps: 3 })
  await page.mouse.down()
  await page.mouse.move(...(await toPage(page, to, viewportId)), { steps: 6 })
  await page.mouse.up()
  await page.waitForTimeout(450)
}

async function click(page: Page, point: [number, number]) {
  const at = await toPage(page, point)
  await page.mouse.move(...at, { steps: 3 })
  await page.mouse.click(...at)
  await page.waitForTimeout(450)
}

async function chooseTool(page: Page, name: string | RegExp) {
  await page.getByRole('button', { name: 'Measurement tools' }).click()
  await page.getByRole('menuitemradio', { name }).click()
}

async function measureMenu(page: Page, name: string) {
  await page.getByRole('button', { name: 'Measurement tools' }).click()
  await page.getByRole('menuitem', { name }).click()
}

const panel = (page: Page) => page.getByRole('complementary', { name: 'Measurements' })
const item = (page: Page, name: string) => panel(page).getByRole('listitem', { name })
const values = (page: Page, name: string) => item(page, name).getByTestId('measurement-values')

async function openMeasure(page: Page, file: string) {
  await openInput(page, sample('measure', file))
  await expect(page.getByText('Loading images…')).toHaveCount(0)
  await page.getByRole('button', { name: 'Measurements (X)' }).click()
  await expect(panel(page)).toBeVisible()
  // The viewport shrinks for the panel; let it settle before drawing.
  await page.waitForTimeout(500)
}

test('lengths and region statistics use the magnification-corrected detector spacing', async ({ page }) => {
  await openMeasure(page, 'dx_ermf.dcm')
  // 0.2 mm ÷ 1.25 = 0.16 mm per pixel.
  await page.keyboard.press('l')
  await drag(page, [30, 50], [70, 50])
  await expect(values(page, 'Length')).toHaveText(/^6\.4\d? mm \(ERMF\)$/)

  // A 30 × 30 pixel rectangle inside the square of 1000s.
  await page.keyboard.press('q')
  await drag(page, [35, 35], [65, 65])
  const rect = values(page, 'Rectangle')
  await expect(rect).toContainText(/Area 2[23]\.\d+ mm² \(ERMF\)/)
  await expect(rect).toContainText('Mean 1000 ± 0')
  await expect(rect).toContainText('Min 1000 / Max 1000')
  await expect(rect).toContainText('Median 1000')
  await expect(rect).toContainText(/9\d\d pixels/)
  await expect(panel(page).getByRole('figure', { name: 'Histogram of the region' })).toBeVisible()

  // Units: centimetres.
  await panel(page).getByRole('combobox', { name: 'Unit' }).selectOption('cm')
  await expect(values(page, 'Length')).toHaveText(/^0\.64\d? cm \(ERMF\)$/)
})

test('ultrasound regions calibrate lengths', async ({ page }) => {
  await openMeasure(page, 'us_region.dcm')
  await page.keyboard.press('l')
  await drag(page, [30, 50], [70, 50])
  // 0.05 cm per pixel: 40 pixels are 20 mm.
  await expect(values(page, 'Length')).toHaveText(/^(19\.\d+|20(\.\d+)?) mm \(US region\)$/)
})

test('manual calibration turns pixels into millimetres', async ({ page }) => {
  await openInput(page, sample('basic', 'dx_no_spacing.dcm'))
  await expect(page.getByText('Loading images…')).toHaveCount(0)
  await page.getByRole('button', { name: 'Measurements (X)' }).click()
  await page.waitForTimeout(500)
  await page.keyboard.press('l')
  await drag(page, [10, 40], [30, 40])
  await expect(values(page, 'Length')).toHaveText(/^(19\.\d+|20(\.\d+)?) px$/)

  await chooseTool(page, /^Calibrate/)
  await drag(page, [10, 20], [50, 20])
  const dialog = page.getByRole('dialog', { name: 'Calibrate' })
  await dialog.getByRole('spinbutton').fill('20')
  await dialog.getByRole('button', { name: 'Apply' }).click()
  // 40 pixels are 20 mm, so the 20 pixel line is 10 mm; the calibration line itself is gone.
  await expect(values(page, 'Length')).toHaveText(/^(9\.\d+|10(\.\d+)?) mm \(calibrated\)$/)
  await expect(panel(page).getByRole('listitem')).toHaveCount(1)

  await measureMenu(page, 'Remove calibration')
  await expect(values(page, 'Length')).toHaveText(/ px$/)
})

test('every tool draws and reports its values', async ({ page, consoleErrors }) => {
  // Twelve tools drawn with spaced-out clicks: slow when the suite runs in parallel.
  test.slow()
  await openMeasure(page, 'dx_ermf.dcm')

  await chooseTool(page, /^Polygon/)
  for (const point of [[10, 10], [25, 10], [25, 25], [10, 25], [10, 10]] as const) await click(page, [...point])
  await expect(values(page, 'Polygon')).toContainText(/Area 5\.\d+ mm²/)
  await expect(values(page, 'Polygon')).toContainText('225 pixels')

  await chooseTool(page, /^Polyline/)
  await click(page, [10, 80])
  await click(page, [30, 80])
  const end = await toPage(page, [30, 95])
  await page.mouse.move(...end, { steps: 3 })
  await page.mouse.dblclick(...end)
  await expect(values(page, 'Polyline')).toHaveText(/^5\.\d+ mm \(ERMF\)$/)

  await chooseTool(page, 'Circle ROI')
  await drag(page, [50, 50], [55, 50])
  await expect(values(page, 'Circle')).toContainText('Mean 1000 ± 0')

  await chooseTool(page, /^Bidirectional/)
  await drag(page, [5, 40], [25, 40])
  await expect(values(page, 'Bidirectional')).toContainText(/L 3\.\d+ mm/)

  await chooseTool(page, 'Cobb angle')
  await drag(page, [75, 5], [95, 5])
  await drag(page, [75, 10], [95, 20])
  await expect(values(page, 'Cobb angle')).toHaveText(/^2\d\.\d+°$/)

  await chooseTool(page, /^Deviation/)
  await drag(page, [40, 92], [60, 92])
  await click(page, [50, 85])
  await expect(values(page, 'Deviation')).toHaveText(/^1\.1\d* mm \(ERMF\)$/)

  await chooseTool(page, /^Length ratio/)
  await drag(page, [2, 60], [22, 60])
  await drag(page, [2, 65], [12, 65])
  await expect(values(page, 'Length ratio').last()).toContainText(/Ratio (1\.9|2\.0|2\.1)/)

  await chooseTool(page, /^Ellipsoid/)
  await drag(page, [75, 70], [95, 70])
  await drag(page, [75, 75], [85, 75])
  await drag(page, [75, 80], [80, 80])
  await expect(values(page, 'Ellipsoid diameter').last()).toContainText(/Volume 2\.\d+ mm³/)

  await chooseTool(page, /^Spine labels/)
  await click(page, [85, 30])
  await click(page, [85, 45])
  await expect(item(page, 'C1')).toBeVisible()
  await expect(item(page, 'C2')).toBeVisible()

  await chooseTool(page, 'Arrow with text')
  await drag(page, [45, 10], [55, 20])
  const dialog = page.getByRole('dialog', { name: 'Annotation text' })
  await dialog.getByRole('textbox').fill('Lesion')
  await dialog.getByRole('button', { name: 'Apply' }).click()
  await expect(item(page, 'Lesion')).toBeVisible()

  await chooseTool(page, /^Freehand/)
  await page.mouse.move(...(await toPage(page, [60, 80])))
  await page.mouse.down()
  for (const point of [[70, 80], [70, 90], [60, 90], [60, 80]] as const) await page.mouse.move(...(await toPage(page, [...point])), { steps: 8 })
  await page.mouse.up()
  await expect(values(page, 'Freehand')).toContainText('Mean 100 ± 0')
  expect(consoleErrors).toEqual([])
})

test('delete, undo, redo and hide', async ({ page }) => {
  await openMeasure(page, 'dx_ermf.dcm')
  await page.keyboard.press('l')
  await drag(page, [30, 50], [70, 50])
  const rows = panel(page).getByRole('listitem')
  await expect(rows).toHaveCount(1)

  await item(page, 'Length').getByRole('button', { name: /^Length/ }).click()
  await page.keyboard.press('Delete')
  await expect(rows).toHaveCount(0)
  await page.keyboard.press('Control+z')
  await expect(rows).toHaveCount(1)
  await page.keyboard.press('Control+Shift+z')
  await expect(rows).toHaveCount(0)
  await page.keyboard.press('Control+z')
  await expect(rows).toHaveCount(1)

  await item(page, 'Length').getByRole('button', { name: 'Hide Length' }).click()
  await expect(item(page, 'Length').getByRole('button', { name: 'Show Length' })).toHaveAttribute('aria-pressed', 'true')

  await item(page, 'Length').getByRole('button', { name: 'Rename Length' }).click()
  const dialog = page.getByRole('dialog', { name: 'Measurement label' })
  await dialog.getByRole('textbox').fill('Width')
  await dialog.getByRole('button', { name: 'Apply' }).click()
  await expect(item(page, 'Width')).toBeVisible()
})

test('copy to the next slice, save, delete and load again; CSV', async ({ page }) => {
  await openPhantom(page)
  await viewport(page, 'viewport-1').click()
  await page.getByRole('button', { name: 'Measurements (X)' }).click()
  await page.waitForTimeout(500)
  await page.keyboard.press('l')
  await drag(page, [10, 20], [40, 20], 'viewport-1')
  await expect(panel(page).getByRole('listitem')).toHaveCount(1)

  await measureMenu(page, 'Copy measurements')
  await page.keyboard.press('ArrowDown')
  await measureMenu(page, 'Paste onto this image')
  await expect(panel(page).getByRole('listitem')).toHaveCount(2)
  const [first, second] = await values(page, 'Length').allInnerTexts()
  expect(first).toBe(second)

  const csv = page.waitForEvent('download')
  await panel(page).getByRole('button', { name: 'CSV' }).click()
  const csvText = readFileSync((await (await csv).path())!, 'utf8')
  expect(csvText).toContain('Series,Image,Tool,Label,Values')
  expect(csvText.trim().split('\n')).toHaveLength(3)

  const saved = page.waitForEvent('download')
  await panel(page).getByRole('button', { name: 'Save' }).click()
  const file = (await (await saved).path())!
  expect(JSON.parse(readFileSync(file, 'utf8')).measurements).toHaveLength(2)

  await panel(page).getByRole('button', { name: 'Delete all' }).click()
  await expect(panel(page).getByRole('listitem')).toHaveCount(0)

  const chooser = page.waitForEvent('filechooser')
  await panel(page).getByRole('button', { name: 'Load' }).click()
  await (await chooser).setFiles(file)
  await expect(panel(page).getByRole('listitem')).toHaveCount(2)
  expect(await values(page, 'Length').allInnerTexts()).toEqual([first, second])
})

test('redaction boxes are black in the PNG export', async ({ page }) => {
  await openMeasure(page, 'dx_ermf.dcm')
  const centrePixel = async () => {
    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Download PNG' }).click()
    const png = readFileSync((await (await download).path())!).toString('base64')
    return page.evaluate(async (data) => {
      const image = new Image()
      image.src = `data:image/png;base64,${data}`
      await image.decode()
      const canvas = document.createElement('canvas')
      canvas.width = image.width
      canvas.height = image.height
      const context = canvas.getContext('2d')!
      context.drawImage(image, 0, 0)
      return [...context.getImageData(image.width / 2, image.height / 2, 1, 1).data.slice(0, 3)]
    }, png)
  }
  expect((await centrePixel())[0]).toBeGreaterThan(150)
  await chooseTool(page, /^Redaction/)
  await drag(page, [40, 40], [60, 60])
  expect(await centrePixel()).toEqual([0, 0, 0])
})

test('measurements in MPR are listed', async ({ page }) => {
  await openPhantom(page)
  await viewport(page, 'viewport-1').click()
  await page.getByRole('button', { name: 'MPR' }).click()
  const first = page.locator('[data-viewport-id]').first()
  await expect(page.getByText('20 / 40')).toBeVisible({ timeout: 60_000 })
  await page.getByRole('button', { name: 'Measurements (X)' }).click()
  await page.waitForTimeout(1000)
  await page.keyboard.press('l')
  const box = (await first.boundingBox())!
  // Away from the crosshair lines through the centre, which would take the drag.
  await page.mouse.move(box.x + box.width * 0.15, box.y + box.height * 0.4, { steps: 3 })
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.4, { steps: 6 })
  await page.mouse.up()
  // An axial MPR slice lies on a CT image, so it is listed under that series.
  await expect(values(page, 'Length')).toHaveText(/^\d+(\.\d+)? mm$/)
})

test('phone: measure from the menu and read the panel @mobile', async ({ page }) => {
  await openInput(page, sample('measure', 'dx_ermf.dcm'))
  await chooseTool(page, 'Rectangle ROI')
  await drag(page, [35, 35], [65, 65])
  await page.getByRole('button', { name: 'Measurements (X)' }).click()
  await expect(values(page, 'Rectangle')).toContainText('Mean 1000 ± 0')
})
