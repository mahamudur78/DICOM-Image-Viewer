import { join } from 'node:path'
import type { Page } from '@playwright/test'
import { SAMPLES_DIR, expect, filesIn, openInput, test, viewport } from './fixtures'

const sample = (...parts: string[]) => join(SAMPLES_DIR, ...parts)
const panel = (page: Page) => page.getByRole('complementary', { name: 'Segmentation' })

/** Coloured pixels of the object layers (segmentations) of a viewport. */
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

/** Page position of a world point in a viewport. */
const pageOf = (page: Page, id: string, world: number[]) =>
  page.evaluate(
    ({ id, world }) => {
      type Vp = { element: HTMLElement; worldToCanvas(p: number[]): [number, number] }
      const vp = (window as unknown as { __dicomlensEngine: () => { getViewport(id: string): Vp } }).__dicomlensEngine().getViewport(id)
      const [x, y] = vp.worldToCanvas(world)
      const rect = vp.element.getBoundingClientRect()
      return [rect.left + x, rect.top + y] as [number, number]
    },
    { id, world },
  )

async function showSlice(page: Page, id: string, index: number) {
  await page.evaluate(
    ({ id, index }) => (window as unknown as { __dicomlensEngine: () => { getViewport(id: string): { setImageIdIndex(i: number): Promise<unknown> } } }).__dicomlensEngine().getViewport(id).setImageIdIndex(index),
    { id, index },
  )
  await page.waitForTimeout(300)
}

async function drag(page: Page, from: [number, number], to: [number, number]) {
  await page.mouse.move(...from)
  await page.mouse.down()
  await page.mouse.move(...to, { steps: 8 })
  await page.mouse.up()
  await page.waitForTimeout(300)
}

/** Opens the planning CT with the segmentation panel and a new segmentation. */
async function start(page: Page) {
  await openInput(page, filesIn(sample('objects')))
  await viewport(page, 'viewport-0').click()
  await page.getByRole('button', { name: /^Segmentation \(draw/ }).click()
  await panel(page).getByRole('button', { name: 'New segmentation' }).click()
  await expect(panel(page).getByTestId('segment-editor-list')).toBeVisible({ timeout: 30_000 })
}

const volumeOf = (page: Page, row = 0) => panel(page).getByTestId('segment-stats').locator('tbody tr').nth(row).locator('td').nth(1)

test('brush, eraser, undo and redo', async ({ page }) => {
  await start(page)
  await panel(page).getByRole('button', { name: 'Brush', exact: true }).click()
  await panel(page).getByLabel('Brush radius', { exact: true }).fill('6')
  await showSlice(page, 'viewport-0', 10)
  const a = await pageOf(page, 'viewport-0', [-20, 0, -25])
  const b = await pageOf(page, 'viewport-0', [20, 0, -25])
  await drag(page, a, b)
  await expect.poll(() => objectPixels(page, 'viewport-0')).toBeGreaterThan(300)
  await expect(volumeOf(page)).not.toHaveText('0 cm³')
  const painted = await objectPixels(page, 'viewport-0')

  await panel(page).getByRole('button', { name: 'Eraser' }).click()
  await page.mouse.click(...(await pageOf(page, 'viewport-0', [0, 0, -25])))
  await expect.poll(() => objectPixels(page, 'viewport-0')).toBeLessThan(painted)
  await panel(page).getByRole('button', { name: 'Undo' }).click()
  await expect.poll(() => objectPixels(page, 'viewport-0')).toBe(painted)
  await panel(page).getByRole('button', { name: 'Undo' }).click()
  await expect.poll(() => objectPixels(page, 'viewport-0')).toBe(0)
  await page.keyboard.press('Control+Shift+Z')
  await expect.poll(() => objectPixels(page, 'viewport-0')).toBe(painted)
})

test('threshold the volume, grow a region and read the results', async ({ page }) => {
  await start(page)
  // The tumour is 80 HU, the organ 20 HU, the body 40 HU.
  await panel(page).getByLabel('Lowest value').fill('70')
  await panel(page).getByLabel('Highest value').fill('100')
  await panel(page).getByRole('button', { name: 'Threshold whole volume' }).click()
  // A 10 mm ball is 4.2 cm³ (here on 2 × 2 × 2.5 mm voxels).
  await expect.poll(async () => parseFloat((await volumeOf(page).textContent()) ?? '0'), { timeout: 30_000 }).toBeGreaterThan(3.3)
  expect(parseFloat((await volumeOf(page).textContent())!)).toBeLessThan(5.2)
  await expect(panel(page).getByTestId('segment-stats').locator('tbody tr').first()).toContainText('80 ± 0')

  await panel(page).getByLabel('New segment name').fill('Organ')
  await panel(page).getByRole('button', { name: 'Add segment' }).click()
  await panel(page).getByLabel('Lowest value').fill('15')
  await panel(page).getByLabel('Highest value').fill('25')
  await panel(page).getByRole('button', { name: 'Region grow' }).click()
  await showSlice(page, 'viewport-0', 8)
  await page.mouse.click(...(await pageOf(page, 'viewport-0', [-22, 8, -20])))
  await expect.poll(async () => parseFloat((await volumeOf(page, 1).textContent()) ?? '0'), { timeout: 20_000 }).toBeGreaterThan(1.5)
  await expect(panel(page).getByTestId('segment-stats').locator('tbody tr').nth(1)).toContainText('20 ± 0')
  await expect(panel(page).getByTestId('segment-stats').locator('tbody tr').nth(1)).toContainText('mm')
})

test('scissors through the depth, contours and interpolation', async ({ page }) => {
  await start(page)
  await panel(page).getByRole('button', { name: 'Rectangle' }).click()
  await panel(page).getByLabel('Depth').selectOption('volume')
  await showSlice(page, 'viewport-0', 5)
  await drag(page, await pageOf(page, 'viewport-0', [-10, -10, -12.5]), await pageOf(page, 'viewport-0', [10, 10, -12.5]))
  // 10 × 10 voxels through all 20 slices: 2 × 2 × 2.5 mm each, 20 cm³.
  await expect.poll(async () => parseFloat((await volumeOf(page).textContent()) ?? '0'), { timeout: 20_000 }).toBeGreaterThan(18)
  await panel(page).getByRole('button', { name: 'Clear segment' }).click()
  await expect.poll(async () => (await volumeOf(page).textContent()) ?? '').toBe('0 cm³')

  await panel(page).getByRole('button', { name: 'Contour' }).click()
  for (const [index, r] of [
    [2, 6],
    [8, 14],
  ]) {
    await showSlice(page, 'viewport-0', index)
    const z = -index * 2.5
    const points = await Promise.all(Array.from({ length: 12 }, (_, s) => pageOf(page, 'viewport-0', [r * Math.cos((s / 12) * 2 * Math.PI), r * Math.sin((s / 12) * 2 * Math.PI), z])))
    await page.mouse.move(...points[0])
    await page.mouse.down()
    for (const p of points.slice(1)) await page.mouse.move(...p, { steps: 3 })
    await page.mouse.up()
    await page.waitForTimeout(300)
  }
  const before = parseFloat((await volumeOf(page).textContent()) ?? '0')
  await panel(page).getByRole('button', { name: 'Fill between slices' }).click()
  await expect(page.getByText('Filled 5 slices.')).toBeVisible()
  await expect.poll(async () => parseFloat((await volumeOf(page).textContent()) ?? '0')).toBeGreaterThan(before * 2)
})

test('saving as DICOM SEG and RTSTRUCT adds them to the study', async ({ page }) => {
  await start(page)
  await panel(page).getByLabel('Lowest value').fill('70')
  await panel(page).getByLabel('Highest value').fill('100')
  await panel(page).getByRole('button', { name: 'Threshold whole volume' }).click()
  await expect.poll(async () => parseFloat((await volumeOf(page).textContent()) ?? '0'), { timeout: 30_000 }).toBeGreaterThan(3)
  let download = page.waitForEvent('download')
  await panel(page).getByRole('button', { name: 'Save as DICOM SEG' }).click()
  expect((await download).suggestedFilename()).toMatch(/_SEG\.dcm$/)
  download = page.waitForEvent('download')
  await panel(page).getByRole('button', { name: 'Save as RTSTRUCT' }).click()
  expect((await download).suggestedFilename()).toMatch(/_RTSTRUCT\.dcm$/)
  const nav = page.getByRole('navigation')
  await expect(nav.getByText('Segmentation 1')).toHaveCount(2)
  // The saved SEG opens over the CT like any other.
  await nav.getByRole('button', { name: /SEG.*Segmentation 1/ }).click()
  await expect(viewport(page, 'viewport-0')).toContainText('CT planning')
  await page.waitForTimeout(500)
  await showSlice(page, 'viewport-0', 10)
  await expect.poll(() => objectPixels(page, 'viewport-0'), { timeout: 20_000 }).toBeGreaterThan(100)
})

test('MPR brush and 3D surfaces', async ({ page }) => {
  test.slow()
  await start(page)
  await page.getByRole('button', { name: /^MPR/ }).click()
  await expect(viewport(page, 'mpr-axial')).toBeVisible({ timeout: 60_000 })
  await page.waitForTimeout(1000)
  await panel(page).getByRole('button', { name: 'Brush', exact: true }).click()
  await panel(page).getByLabel('Brush radius', { exact: true }).fill('8')
  const center = await pageOf(page, 'mpr-axial', [0, 0, -25])
  await drag(page, center, [center[0] + 40, center[1]])
  await expect.poll(() => objectPixels(page, 'mpr-axial'), { timeout: 20_000 }).toBeGreaterThan(100)
  // The same voxels show in the sagittal view through them.
  await expect.poll(() => objectPixels(page, 'mpr-sagittal'), { timeout: 20_000 }).toBeGreaterThan(0)

  await page.getByRole('button', { name: /MPR \+ 3D layout/ }).click()
  await expect(viewport(page, 'vr-mpr')).toBeVisible({ timeout: 60_000 })
  await panel(page).getByRole('button', { name: 'Show surfaces in 3D' }).click()
  const surfaces = await page.evaluate(() => {
    type Vp = { getActors(): { uid: string }[] }
    const vp = (window as unknown as { __dicomlensEngine: () => { getViewport(id: string): Vp } }).__dicomlensEngine().getViewport('vr-mpr')
    return vp.getActors().filter((a) => a.uid.startsWith('segment-surface-')).length
  })
  expect(surfaces).toBe(1)
  const download = page.waitForEvent('download')
  await panel(page).getByRole('button', { name: 'Active segment as STL' }).click()
  expect((await download).suggestedFilename()).toBe('Segment_1.stl')
})

test('TMTV on PET', async ({ page }) => {
  await openInput(page, filesIn(sample('fusion')))
  await page.getByRole('navigation').getByText('PET AC').first().click()
  await page.getByRole('button', { name: /^Segmentation \(draw/ }).click()
  await panel(page).getByRole('button', { name: 'New segmentation' }).click()
  await panel(page).getByLabel('Threshold', { exact: true }).selectOption('percent')
  await panel(page).getByLabel('Threshold value').fill('41')
  await panel(page).getByRole('button', { name: 'Find lesions' }).click()
  const result = panel(page).getByTestId('tmtv-result')
  await expect(result).toContainText('1 lesion', { timeout: 30_000 })
  await expect(result).toContainText('SUVmax')
  await expect(panel(page).getByTestId('segment-editor-list').getByLabel('Segment name', { exact: true }).nth(1)).toHaveValue('TMTV')
})

test('phone: a new segmentation from the panel @mobile', async ({ page }) => {
  await openInput(page, filesIn(sample('objects')))
  await page.getByRole('button', { name: /^Segmentation \(draw/ }).click()
  await panel(page).getByRole('button', { name: 'New segmentation' }).click()
  await expect(panel(page).getByTestId('segment-editor-list')).toContainText('', { timeout: 30_000 })
  await expect(panel(page).getByLabel('Segment name', { exact: true })).toHaveValue('Segment 1')
})
