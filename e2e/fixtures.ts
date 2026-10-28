import { test as base, expect, type Page } from '@playwright/test'
import { readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

export const PHANTOM_DIR = resolve('e2e/.data/phantom')
export const SAMPLES_DIR = resolve('e2e/.data/samples')

export const phantomFiles = () =>
  readdirSync(PHANTOM_DIR)
    .filter((name) => name.endsWith('.dcm'))
    .sort()
    .map((name) => join(PHANTOM_DIR, name))

/** Fails the test on any console error or uncaught exception. */
export const test = base.extend<{ consoleErrors: string[] }>({
  consoleErrors: [
    async ({ page }, use) => {
      const errors: string[] = []
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text())
      })
      page.on('pageerror', (error) => errors.push(error.message))
      await use(errors)
      expect(errors, 'console errors').toEqual([])
    },
    { auto: true },
  ],
})

export { expect }

/** Opens the app and loads the phantom study through the "Open files" input. */
export async function openPhantom(page: Page) {
  await page.goto('/')
  await page.locator('input[type=file][multiple]').first().setInputFiles(phantomFiles())
  await expect(page.locator('[data-viewport-id]')).toHaveCount(4)
  await expect(page.getByText('Loading images…')).toHaveCount(0)
}

export const viewport = (page: Page, id: string) => page.locator(`[data-viewport-id="${id}"]`)

/** Reads a stack viewport's properties through the dev-only test hook. */
export function viewportProperties(page: Page, id: string) {
  return page.evaluate((viewportId) => {
    const engine = (window as unknown as { __dicomlensEngine: () => { getViewport(id: string): unknown } })
      .__dicomlensEngine()
    const vp = engine.getViewport(viewportId) as {
      getProperties(): { invert?: boolean; voiRange?: { lower: number; upper: number } }
      getCurrentImageIdIndex(): number
    }
    const { invert, voiRange } = vp.getProperties()
    return { invert: !!invert, voiRange, index: vp.getCurrentImageIdIndex() }
  }, id)
}
