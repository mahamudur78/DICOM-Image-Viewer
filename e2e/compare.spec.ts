import { join } from 'node:path'
import type { Page } from '@playwright/test'
import { SAMPLES_DIR, expect, openInput, openPhantom, test, viewport, viewportProperties } from './fixtures'

const prior = (...parts: string[]) => join(SAMPLES_DIR, 'prior', ...parts)

async function compareMenu(page: Page, name: string | RegExp, role: 'menuitem' | 'menuitemcheckbox' | 'menuitemradio' = 'menuitem') {
  await page.getByRole('button', { name: 'Compare and sync' }).click()
  await page.getByRole('menu').getByRole(role, { name }).click()
}

const index = async (page: Page, id: string) => (await viewportProperties(page, id)).index
const lines = (page: Page, id: string) => viewport(page, id).getByTestId('reference-line')

test('reference lines: the active viewport, every viewport, first and last slice', async ({ page }) => {
  await openPhantom(page)
  await viewport(page, 'viewport-1').click()
  // The scout shows where the active axial slice is; the axial images show the scout.
  await expect(lines(page, 'viewport-0')).toHaveCount(1)
  await expect(lines(page, 'viewport-2')).toHaveCount(0)

  await compareMenu(page, 'Lines of every viewport', 'menuitemcheckbox')
  await expect(lines(page, 'viewport-0')).toHaveCount(3)
  await expect(lines(page, 'viewport-2')).toHaveCount(1)

  await compareMenu(page, 'First and last slice of the active series', 'menuitemcheckbox')
  await expect(viewport(page, 'viewport-0').locator('[data-testid=reference-line][data-source=first]')).toHaveCount(1)
  await expect(viewport(page, 'viewport-0').locator('[data-testid=reference-line][data-source=last]')).toHaveCount(1)

  await compareMenu(page, 'Reference lines', 'menuitemcheckbox')
  await expect(page.getByTestId('reference-line')).toHaveCount(0)
})

test('3D cursor: Shift+click on the scout brings the axial series to that point', async ({ page }) => {
  await openPhantom(page)
  const before = await index(page, 'viewport-1')
  const box = (await viewport(page, 'viewport-0').boundingBox())!
  await page.keyboard.down('Shift')
  await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.3)
  await page.keyboard.up('Shift')
  await expect.poll(() => index(page, 'viewport-1')).not.toBe(before)
  await expect(viewport(page, 'viewport-0').getByTestId('cursor-3d')).toHaveCount(1)
  await expect(viewport(page, 'viewport-1').getByTestId('cursor-3d')).toHaveCount(1)
  // Native and +C (2.5 mm) land on the same slice; Recon (5 mm) on about half of it.
  expect(await index(page, 'viewport-2')).toBe(await index(page, 'viewport-1'))

  await compareMenu(page, 'Remove 3D cursor')
  await expect(page.getByTestId('cursor-3d')).toHaveCount(0)
})

test('3D cursor in MPR + 3D: the planes move to the point and 3D marks it', async ({ page }) => {
  await openPhantom(page)
  await viewport(page, 'viewport-1').click()
  await page.getByRole('button', { name: /^MPR/ }).click()
  await expect(page.getByText('20 / 40')).toBeVisible({ timeout: 60_000 })
  await page.getByRole('button', { name: /MPR \+ 3D/ }).click()
  await expect(viewport(page, 'vr-mpr')).toBeVisible()
  const box = (await viewport(page, 'mpr-sagittal').boundingBox())!
  await page.keyboard.down('Shift')
  await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.35)
  await page.keyboard.up('Shift')
  await expect(viewport(page, 'mpr-axial')).not.toContainText('20 / 40')
  await expect(viewport(page, 'vr-mpr').getByTestId('mpr-center')).toBeVisible()
})

test('zoom/pan sync, cine sync and per-viewport links', async ({ page }) => {
  await openPhantom(page)
  await viewport(page, 'viewport-1').click()

  await page.getByRole('button', { name: 'Sync zoom and pan' }).click()
  await page.getByRole('button', { name: 'View options' }).click()
  await page.getByRole('menuitem', { name: '200%' }).click()
  await expect(viewport(page, 'viewport-1')).not.toContainText('Z: 1.00')
  // The same zoom relative to the image size, so the same "Z:" in cells of the same size.
  const zoom = (await viewport(page, 'viewport-1').innerText()).match(/Z: [\d.]+/)![0]
  await expect(viewport(page, 'viewport-2')).toContainText(zoom)
  await page.getByRole('button', { name: 'Sync zoom and pan' }).click()

  // Cine sync follows by frame fraction: the last of 40 images is the last of 20.
  await page.getByRole('button', { name: 'Sync cine frames' }).click()
  await page.keyboard.press('End')
  await expect.poll(() => index(page, 'viewport-3')).toBe(19)

  // An unlinked viewport stays put.
  await page.getByRole('button', { name: 'Sync cine frames' }).click()
  await page.getByRole('button', { name: 'Sync scroll (same plane, by position)' }).click()
  await viewport(page, 'viewport-2').click()
  await compareMenu(page, 'This viewport is linked', 'menuitemcheckbox')
  await expect(viewport(page, 'viewport-2')).toContainText('UNLINKED')
  const kept = await index(page, 'viewport-2')
  await viewport(page, 'viewport-1').click()
  await page.keyboard.press('Home')
  await expect.poll(() => index(page, 'viewport-3')).toBe(0)
  expect(await index(page, 'viewport-2')).toBe(kept)
})

test('add a prior study, compare and scroll locked together; the PRIOR badge', async ({ page }) => {
  await openInput(page, prior('current'), { folder: true })
  await expect(page.locator('[data-viewport-id]')).toHaveCount(1)

  const chooser = page.waitForEvent('filechooser')
  await compareMenu(page, /^Add folder/)
  await (await chooser).setFiles(prior('prior'))
  await expect(page.getByText('PRIOR', { exact: true })).toBeVisible()

  await compareMenu(page, 'Compare with prior study')
  await expect(page.locator('[data-viewport-id]')).toHaveCount(2)
  await expect(page.getByRole('button', { name: 'Lock sync at the current positions (other study)' })).toHaveAttribute('aria-pressed', 'true')
  await expect(viewport(page, 'viewport-1')).toContainText('2025-01-10')

  // Positions are 1000 mm apart in another frame of reference; locked, they move together.
  await expect.poll(() => index(page, 'viewport-1')).toBe(await index(page, 'viewport-0'))
  await viewport(page, 'viewport-0').click()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  await expect.poll(() => index(page, 'viewport-0')).toBe(13)
  await expect.poll(() => index(page, 'viewport-1')).toBe(13)
})

test('hanging protocols: a prior opens side by side; save and delete your own', async ({ page }) => {
  await openInput(page, prior(), { folder: true })
  // The built-in "CT with prior" protocol: current left, prior right, locked.
  await expect(page.locator('[data-viewport-id]')).toHaveCount(2)
  await expect(viewport(page, 'viewport-0')).toContainText('2026-01-10')
  await expect(viewport(page, 'viewport-1')).toContainText('2025-01-10')
  await expect(page.getByRole('button', { name: 'Lock sync at the current positions (other study)' })).toHaveAttribute('aria-pressed', 'true')

  await compareMenu(page, /^Save this layout/)
  const dialog = page.getByRole('dialog', { name: 'Save hanging protocol' })
  await dialog.getByRole('textbox').fill('My chest')
  await dialog.getByRole('button', { name: 'Apply' }).click()
  await compareMenu(page, /^Hanging protocols/)
  const manage = page.getByRole('dialog', { name: 'Hanging protocols' })
  await expect(manage).toContainText('My chest')
  await manage.getByRole('button', { name: 'Delete My chest' }).click()
  await expect(manage).not.toContainText('My chest')
})

test('a series comes back with its zoom, window and invert', async ({ page }) => {
  await openPhantom(page)
  await viewport(page, 'viewport-1').click()
  await page.getByRole('button', { name: 'View options' }).click()
  await page.getByRole('menuitem', { name: '200%' }).click()
  await page.keyboard.press('i')
  await expect(viewport(page, 'viewport-1')).not.toContainText('Z: 1.00')
  const zoom = (await viewport(page, 'viewport-1').innerText()).match(/Z: [\d.]+/)![0]

  await page.getByRole('button', { name: /CT 4\/20 Recon 2/ }).click()
  await expect(viewport(page, 'viewport-1')).toContainText('Recon 2')
  await expect(viewport(page, 'viewport-1')).toContainText('Z: 1.00')
  await page.getByRole('button', { name: /CT 2\/40 Native/ }).click()
  await expect(viewport(page, 'viewport-1')).toContainText(zoom)
  expect((await viewportProperties(page, 'viewport-1')).invert).toBe(true)
})

test('a series in its own window follows the main window', async ({ page, context }) => {
  await openPhantom(page)
  await viewport(page, 'viewport-1').click()
  await page.getByRole('button', { name: 'Sync scroll (same plane, by position)' }).click()
  const opened = context.waitForEvent('page')
  await compareMenu(page, 'Open series in a new window')
  const child = await opened
  await expect(child.locator('[data-viewport-id]')).toHaveCount(1, { timeout: 60_000 })
  await expect(child.locator('[data-viewport-id="viewport-0"]')).toContainText('Native')
  await expect(child.locator('[data-viewport-id="viewport-0"]')).toContainText(' / 40')

  await page.bringToFront()
  await viewport(page, 'viewport-1').click()
  await page.keyboard.press('Home')
  await expect(child.locator('[data-viewport-id="viewport-0"]')).toContainText('1 / 40')
})

test('phone: a study with its prior opens side by side @mobile', async ({ page }) => {
  await openInput(page, prior(), { folder: true })
  await expect(page.locator('[data-viewport-id]')).toHaveCount(2)
  await expect(viewport(page, 'viewport-1')).toContainText('2025-01-10')
})
