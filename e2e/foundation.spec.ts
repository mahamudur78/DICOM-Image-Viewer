import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { PHANTOM_DIR, expect, openInput, openPhantom, test, viewport, viewportProperties } from './fixtures'

test('right click opens the viewport menu; right drag still zooms', async ({ page }) => {
  await openPhantom(page)
  const target = viewport(page, 'viewport-1')
  await target.click({ button: 'right' })
  const menu = page.getByRole('menu', { name: 'Viewport actions' })
  await expect(menu).toBeVisible()
  await expect(menu.getByRole('menuitem')).toHaveCount(13)
  await expect(menu.getByRole('menuitemradio')).toHaveCount(4)
  await expect(menu.getByRole('menuitemradio', { name: 'Instance number' })).toHaveAttribute('aria-checked', 'true')

  await menu.getByRole('menuitem', { name: /Invert/ }).click()
  await expect(menu).toHaveCount(0)
  expect((await viewportProperties(page, 'viewport-1')).invert).toBe(true)

  // Escape closes the menu.
  await target.click({ button: 'right' })
  await expect(menu).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(menu).toHaveCount(0)

  // A right-button drag zooms without opening the menu. Cornerstone treats two
  // presses within 400 ms as a double click and would not start the drag.
  await page.waitForTimeout(500)
  const box = (await target.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down({ button: 'right' })
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 60, { steps: 5 })
  await page.mouse.up({ button: 'right' })
  await expect(menu).toHaveCount(0)
  await expect(target).not.toContainText('Z: 1.00')
})

test('link settings survive a reload', async ({ page }) => {
  await openPhantom(page)
  const sync = page.getByRole('button', { name: 'Sync scroll (same plane, by position)' })
  await expect(sync).toHaveAttribute('aria-pressed', 'false')
  await sync.click()
  await expect(sync).toHaveAttribute('aria-pressed', 'true')

  await openPhantom(page) // navigates again
  await expect(page.getByRole('button', { name: 'Sync scroll (same plane, by position)' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
})

test('non-DICOM files are reported in a toast', async ({ page }) => {
  const notDicom = join(PHANTOM_DIR, '..', 'not-dicom.bin')
  writeFileSync(notDicom, 'hello')
  await openInput(page, [notDicom])
  const toast = page.getByRole('alert')
  await expect(toast).toContainText('No DICOM images were found')
  await toast.getByRole('button', { name: 'Dismiss' }).click()
  await expect(toast).toHaveCount(0)
})

test('the stored language is applied, with English fallback', async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem('dicomlens-settings', JSON.stringify({ state: { language: 'bn' }, version: 1 })),
  )
  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('lang', 'bn')
  await expect(page.getByRole('button', { name: 'ফাইল খুলুন' })).toBeVisible()
  // Not translated yet: falls back to English.
  await expect(page.getByRole('heading', { name: 'Free Online DICOM Viewer' })).toBeVisible()
})
