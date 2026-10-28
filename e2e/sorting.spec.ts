import { join } from 'node:path'
import type { Page } from '@playwright/test'
import { SAMPLES_DIR, expect, filesIn, openInput, test, viewport } from './fixtures'

/** Labels (pixel values) of the slices in the order the viewport shows them. */
async function order(page: Page) {
  return page.evaluate(async () => {
    const engine = (window as unknown as { __dicomlensEngine: () => { getViewport(id: string): unknown } }).__dicomlensEngine()
    const vp = engine.getViewport('viewport-0') as {
      getImageIds(): string[]
      setImageIdIndex(i: number): Promise<unknown>
      getCornerstoneImage(): { getPixelData(): ArrayLike<number> }
    }
    const labels: number[] = []
    for (let i = 0; i < vp.getImageIds().length; i++) {
      await vp.setImageIdIndex(i)
      labels.push(vp.getCornerstoneImage().getPixelData()[0])
    }
    return labels
  })
}

test('images can be sorted by instance, position, time or file name', async ({ page }) => {
  await openInput(page, filesIn(join(SAMPLES_DIR, 'sort')))
  const cell = viewport(page, 'viewport-0')
  await expect(cell).toContainText('/ 5')
  expect(await order(page)).toEqual([500, 400, 300, 200, 100]) // instance 1..5

  const sortBy = async (name: string) => {
    await cell.click({ button: 'right' })
    await page.getByRole('menuitemradio', { name }).click()
    await cell.click({ button: 'right' })
    await expect(page.getByRole('menuitemradio', { name })).toHaveAttribute('aria-checked', 'true')
    await page.keyboard.press('Escape')
  }

  await sortBy('Slice position')
  expect(await order(page)).toEqual([100, 200, 300, 400, 500]) // z 0..40 along the normal
  await sortBy('Acquisition time')
  expect(await order(page)).toEqual([200, 400, 100, 500, 300])
  await sortBy('File name')
  expect(await order(page)).toEqual([300, 500, 100, 200, 400]) // img_1, img_2, img_3, img_10, img_20
})
