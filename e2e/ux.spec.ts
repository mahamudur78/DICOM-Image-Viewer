import type { Page } from '@playwright/test'
import { expect, test, viewport, viewportProperties } from './fixtures'

const PROD = !!process.env.E2E_PROD

/** Opens the app and the synthetic sample study (made in the browser). */
async function openSample(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: /Try a sample study/ }).click()
  await expect(viewport(page, 'viewport-0')).toContainText('/ 40', { timeout: 60_000 })
}

const settings = (page: Page) => page.getByRole('dialog', { name: 'Settings' })

async function openSettings(page: Page, tab?: string) {
  await page.getByRole('button', { name: 'Settings' }).click()
  if (tab) await settings(page).getByRole('tab', { name: tab }).click()
}

const cameraOf = (page: Page, id: string) =>
  page.evaluate((id) => {
    const vp = (window as unknown as { __dicomlensEngine: () => { getViewport(id: string): { getZoom(): number; getPan(): number[] } } }).__dicomlensEngine().getViewport(id)
    return { zoom: vp.getZoom(), pan: vp.getPan() }
  }, id)

test('first visit: the guide, the notices and a sample study', async ({ page }) => {
  await page.goto('/')
  const guide = page.getByTestId('onboarding')
  await expect(guide).toContainText('Step 1 of 4')
  await guide.getByRole('button', { name: 'Next' }).click()
  await expect(guide).toContainText('Step 2 of 4')
  await guide.getByRole('button', { name: 'Skip' }).click()
  await expect(guide).toHaveCount(0)
  await expect(page.getByTestId('diagnostic-notice')).toContainText('Not for diagnostic use')
  await page.reload()
  await expect(page.getByTestId('onboarding')).toHaveCount(0)
  await page.getByRole('button', { name: /Try a sample study/ }).click()
  await expect(viewport(page, 'viewport-0')).toContainText('Sample chest', { timeout: 60_000 })
  await expect(viewport(page, 'viewport-0')).toContainText('/ 40')
})

test('languages: Bengali text and digits, Arabic right to left', async ({ page }) => {
  await openSample(page)
  await openSettings(page)
  await settings(page).getByLabel('Language').selectOption('bn')
  await expect(page.locator('header')).toContainText('ডাইকম ভিউয়ার')
  await expect(page.locator('html')).toHaveAttribute('lang', 'bn')
  // Numbers on the image use Bengali digits.
  await expect(viewport(page, 'viewport-0')).toContainText('/ ৪০')
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'সেটিংস' }).click()
  await page.getByRole('dialog').getByLabel('ভাষা').selectOption('ar')
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
  await page.getByRole('dialog').getByRole('combobox').first().selectOption('en')
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr')
  await expect(page.locator('header')).toContainText('DICOM Viewer')
})

test('themes: light and high contrast', async ({ page }) => {
  await page.goto('/')
  const background = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor)
  const dark = await background()
  await openSettings(page)
  await settings(page).getByLabel('Theme').selectOption('light')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  expect(await background()).not.toBe(dark)
  await settings(page).getByLabel('Theme').selectOption('contrast')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'contrast')
  await settings(page).getByLabel('Theme').selectOption('dark')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
})

test('shortcuts: the ? list, changing a key, and conflicts', async ({ page }) => {
  await openSample(page)
  await viewport(page, 'viewport-0').click()
  await page.keyboard.press('?')
  const list = page.getByRole('dialog', { name: 'Keyboard shortcuts' })
  await expect(list.getByTestId('shortcut-list')).toContainText('Invert')
  await list.getByLabel('Search commands').fill('invert')
  await expect(list.getByTestId('shortcut-list').locator('tr')).toHaveCount(1)
  await list.getByRole('button', { name: 'Change shortcuts…' }).click()
  const editor = settings(page).getByTestId('shortcut-editor')
  await settings(page).getByRole('button', { name: /Change the shortcut of Invert/ }).click()
  await page.keyboard.press('r')
  await expect(settings(page).getByRole('alert')).toContainText('Reset')
  await settings(page).getByRole('button', { name: /Change the shortcut of Invert/ }).click()
  await page.keyboard.press(';')
  await expect(editor).toContainText(';')
  await page.keyboard.press('Escape')
  await viewport(page, 'viewport-0').click()
  await page.keyboard.press(';')
  await expect.poll(async () => (await viewportProperties(page, 'viewport-0')).invert).toBe(true)
  await page.keyboard.press('i')
  await expect.poll(async () => (await viewportProperties(page, 'viewport-0')).invert).toBe(true)
})

test('mouse buttons: the right button pans instead of zooming', async ({ page }) => {
  await openSample(page)
  await openSettings(page, 'Mouse & touch')
  await settings(page).getByLabel('Right button').selectOption('pan')
  await page.keyboard.press('Escape')
  const before = await cameraOf(page, 'viewport-0')
  const box = (await viewport(page, 'viewport-0').boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down({ button: 'right' })
  await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 30, { steps: 6 })
  await page.mouse.up({ button: 'right' })
  const after = await cameraOf(page, 'viewport-0')
  expect(after.zoom).toBeCloseTo(before.zoom, 3)
  expect(Math.hypot(after.pan[0] - before.pan[0], after.pan[1] - before.pan[1])).toBeGreaterThan(10)
})

test('settings backup: save and load', async ({ page }) => {
  await page.goto('/')
  await openSettings(page)
  await settings(page).getByLabel('Theme').selectOption('light')
  await settings(page).getByRole('tab', { name: 'Backup' }).click()
  const download = page.waitForEvent('download')
  await settings(page).getByRole('button', { name: 'Save settings…' }).click()
  const path = await (await download).path()
  await settings(page).getByRole('tab', { name: 'General' }).click()
  await settings(page).getByLabel('Theme').selectOption('dark')
  await settings(page).getByRole('tab', { name: 'Backup' }).click()
  await settings(page).getByLabel('Load settings…').setInputFiles(path!)
  await expect(settings(page).getByRole('status')).toHaveText('Settings loaded.')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
})

test('archive: save, search, status and keywords, reopen after reload, delete', async ({ page }) => {
  await openSample(page)
  await page.getByRole('button', { name: 'Key images and saved reports' }).click()
  await page.getByRole('menuitem', { name: 'Save this study to the archive' }).click()
  await expect(page.getByText('saved in the archive')).toBeVisible({ timeout: 20_000 })
  await page.reload()
  await page.getByRole('button', { name: 'Archive' }).click()
  const archive = page.getByTestId('archive')
  const item = archive.getByRole('listitem', { name: 'Sample Patient' })
  await expect(item).toContainText('40 files')
  await expect(archive.getByTestId('archive-usage')).toContainText('1 study')
  await item.getByLabel('Status').selectOption('urgent')
  await item.getByLabel('Keywords (comma separated)').fill('teaching, chest')
  await archive.getByLabel('Search patient, ID, description or keyword').fill('teaching')
  await expect(archive.getByRole('listitem')).toHaveCount(1)
  await archive.getByLabel('Status', { exact: true }).first().selectOption('reviewed')
  await expect(archive.getByRole('listitem')).toHaveCount(0)
  await archive.getByLabel('Status', { exact: true }).first().selectOption('all')
  const download = page.waitForEvent('download')
  await archive.getByRole('button', { name: 'List as CSV' }).click()
  expect((await download).suggestedFilename()).toBe('dicomlens-archive.csv')
  await archive.getByRole('listitem', { name: 'Sample Patient' }).getByRole('button', { name: 'Open' }).click()
  await expect(viewport(page, 'viewport-0')).toContainText('/ 40', { timeout: 60_000 })
  await page.getByRole('button', { name: 'Archive' }).click()
  page.once('dialog', (dialog) => void dialog.accept())
  await page.getByTestId('archive').getByRole('button', { name: 'Delete' }).click()
  await expect(page.getByTestId('archive').getByText('No studies saved yet')).toBeVisible()
})

test('offline: the installed app opens without a network', async ({ page, context }) => {
  test.skip(!PROD, 'The service worker exists only in the production build.')
  await page.goto('/')
  await expect(page.locator('link[rel=manifest]')).toHaveAttribute('href', '/manifest.webmanifest')
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined))
  // The worker precaches every file of the build before it activates.
  await expect.poll(() => page.evaluate(async () => (await caches.keys()).some((k) => k.startsWith('dicomlens-'))), { timeout: 30_000 }).toBe(true)
  await context.setOffline(true)
  await page.reload()
  await page.getByRole('button', { name: /Try a sample study/ }).click()
  await expect(viewport(page, 'viewport-0')).toContainText('/ 40', { timeout: 60_000 })
  await context.setOffline(false)
})

test('phone: toolbar at the bottom, panels as a sheet, long press and pinch @mobile', async ({ page }) => {
  test.skip(!test.info().project.use.isMobile, 'Phone layout and touch')
  await openSample(page)
  const screen = page.viewportSize()!
  await expect.poll(async () => (await page.getByTestId('toolbar').boundingBox())!.y).toBeGreaterThan(screen.height / 2)
  await page.getByRole('button', { name: 'Measurements (X)' }).click()
  const sheet = (await page.getByRole('complementary', { name: 'Measurements' }).boundingBox())!
  expect(sheet.y).toBeGreaterThan(screen.height * 0.25)
  await page.getByRole('button', { name: 'Close Measurements' }).click()

  // A long press opens the viewport menu.
  const box = (await viewport(page, 'viewport-0').boundingBox())!
  const [x, y] = [box.x + box.width / 2, box.y + box.height / 2]
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
  await page.waitForTimeout(900)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await expect(page.getByRole('menu')).toBeVisible()
  await page.keyboard.press('Escape')

  // Two fingers moving apart zoom in.
  const before = await cameraOf(page, 'viewport-0')
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x - 20, y, id: 1 }, { x: x + 20, y, id: 2 }] })
  for (let step = 1; step <= 8; step++)
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - 20 - step * 8, y, id: 1 }, { x: x + 20 + step * 8, y, id: 2 }] })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await expect.poll(async () => (await cameraOf(page, 'viewport-0')).zoom).toBeGreaterThan(before.zoom * 1.2)
})
