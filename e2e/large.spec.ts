import { LARGE_COUNT, LARGE_DIR, OPEN_TIMEOUT, expect, test, viewport } from './fixtures'

test(`opening ${LARGE_COUNT} files shows progress and finishes`, async ({ page }) => {
  test.setTimeout(180_000)
  await page.goto('/')
  // Warm up the viewer runtime first, so the timing below measures reading files.
  await page.waitForFunction(() => 'dicomlensEngine' in window || '__dicomlensEngine' in window, null, { timeout: OPEN_TIMEOUT })

  const started = Date.now()
  await page.locator('input[type=file][webkitdirectory]').first().setInputFiles(LARGE_DIR)

  // The page keeps rendering while reading: the counter is seen at several values.
  const seen = new Set<string>()
  const progress = page.getByText(/Reading files… \d+ \/ \d+/)
  while (Date.now() - started < 120_000) {
    const text = await progress.textContent({ timeout: 1000 }).catch(() => null)
    if (text === null) break
    seen.add(text)
    await page.waitForTimeout(100)
  }
  await expect(viewport(page, 'viewport-0')).toContainText(`/ ${LARGE_COUNT}`, { timeout: 60_000 })
  const seconds = (Date.now() - started) / 1000
  console.log(`opened ${LARGE_COUNT} files in ${seconds.toFixed(1)} s; progress updates seen: ${seen.size}`)
  expect(seen.size).toBeGreaterThan(3)
  expect(seconds).toBeLessThan(60)

  // Scrolling still works across the whole series.
  await viewport(page, 'viewport-0').click()
  await page.keyboard.press('ArrowDown')
  await expect(viewport(page, 'viewport-0')).toContainText(`${LARGE_COUNT / 2 + 2} / ${LARGE_COUNT}`)
})
