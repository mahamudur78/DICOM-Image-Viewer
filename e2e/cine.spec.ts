import { SAMPLES_DIR, expect, openInput, openPhantom, test, viewport, viewportProperties } from './fixtures'

const index = (page: import('@playwright/test').Page, id: string) =>
  viewportProperties(page, id).then((p) => p.index)

test('space plays and pauses cine; speed and mode controls', async ({ page }) => {
  await openPhantom(page)
  const target = viewport(page, 'viewport-1')
  await target.click()

  const play = target.getByRole('button', { name: 'Play' })
  await expect(play).toBeVisible()
  await expect(target).toContainText('10 fps')

  await page.keyboard.press(' ')
  await expect(target.getByRole('button', { name: 'Pause' })).toBeVisible()
  const start = await index(page, 'viewport-1')
  await expect.poll(() => index(page, 'viewport-1')).not.toBe(start)

  await page.keyboard.press(' ')
  await expect(target.getByRole('button', { name: 'Play' })).toBeVisible()
  // Stopping takes effect after React's commit; then the index stays put.
  await expect
    .poll(async () => {
      const before = await index(page, 'viewport-1')
      await page.waitForTimeout(300)
      return (await index(page, 'viewport-1')) - before
    })
    .toBe(0)

  await page.keyboard.press(']')
  await page.keyboard.press(']')
  await expect(target).toContainText('12 fps')
  await target.getByRole('button', { name: 'Slower' }).click()
  await expect(target).toContainText('11 fps')
  await target.getByRole('button', { name: 'Loop' }).click()
  await expect(target.getByRole('button', { name: 'Back and forth' })).toBeVisible()
})

test('play all starts every visible cine and a layout change stops them', async ({ page }) => {
  await openPhantom(page)
  await viewport(page, 'viewport-1').click({ button: 'right' })
  await page.getByRole('menuitem', { name: /Play all viewports/ }).click()
  for (const id of ['viewport-1', 'viewport-2', 'viewport-3']) {
    await expect(viewport(page, id).getByRole('button', { name: 'Pause' })).toBeVisible()
  }
  // The scout has a single image and no cine controls.
  await expect(viewport(page, 'viewport-0').getByRole('button', { name: /Play|Pause/ })).toHaveCount(0)

  await page.getByLabel('Layout 1×1').click()
  await page.getByLabel('Layout 2×2').click()
  await expect(viewport(page, 'viewport-1').getByRole('button', { name: 'Play' })).toBeVisible()
})

test('ultrasound cine uses the frame time from the header', async ({ page }) => {
  await openInput(page, `${SAMPLES_DIR}/basic/us_cine.dcm`)
  const target = viewport(page, 'viewport-0')
  await expect(target).toContainText('/ 24')
  await expect(target).toContainText('20 fps') // frame time 50 ms
})
