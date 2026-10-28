import { test as base, expect, type Page } from '@playwright/test'
import { readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

export const PHANTOM_DIR = resolve('e2e/.data/phantom')
export const SAMPLES_DIR = resolve('e2e/.data/samples')
export const LARGE_DIR = resolve('e2e/.data/large')
export const LARGE_COUNT = 2000

/**
 * The first files opened after the dev server starts wait for the large
 * viewer runtime to be compiled, which takes longer while tests run in parallel.
 */
export const OPEN_TIMEOUT = 60_000

/** Every file below a folder (the order a folder picker would give). */
export function filesIn(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((entry) => (entry.isDirectory() ? filesIn(join(dir, entry.name)) : [join(dir, entry.name)]))
}

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
      if (process.env.E2E_DEBUG) {
        page.on('requestfailed', (request) => console.log('REQFAIL', request.url(), request.failure()?.errorText))
        page.on('response', (response) => response.status() >= 400 && console.log('HTTP', response.status(), response.url()))
        page.on('console', (message) => console.log('CONSOLE', message.type(), message.text().slice(0, 200)))
      }
      await use(errors)
      expect(errors, 'console errors').toEqual([])
    },
    { auto: true },
  ],
})

export { expect }

/** Waits until opening finished: the viewer, a message or a dialog appears. */
export const settled = (page: Page) =>
  page.locator('[data-viewport-id], [role=alert], [role=dialog]').first().waitFor({ timeout: OPEN_TIMEOUT })

/** Opens the app and picks files ("Open files") or a folder ("Open folder"). */
export async function openInput(page: Page, files: string | string[], { folder = false } = {}) {
  await page.goto('/')
  await page.locator(folder ? 'input[type=file][webkitdirectory]' : 'input[type=file][multiple]').first().setInputFiles(files)
  await settled(page)
}

/** Opens the app and loads the phantom study through the "Open files" input. */
export async function openPhantom(page: Page) {
  await page.goto('/')
  await page.locator('input[type=file][multiple]').first().setInputFiles(phantomFiles())
  await expect(page.locator('[data-viewport-id]')).toHaveCount(4, { timeout: OPEN_TIMEOUT })
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
