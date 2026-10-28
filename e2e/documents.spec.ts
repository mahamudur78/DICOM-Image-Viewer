import { join } from 'node:path'
import { SAMPLES_DIR, expect, filesIn, openInput, test, viewport, viewportProperties } from './fixtures'

const sample = (...parts: string[]) => join(SAMPLES_DIR, ...parts)

test('encapsulated PDF: pages, zoom and download', async ({ page }) => {
  await openInput(page, sample('docs', 'report_pdf.dcm'))
  const cell = viewport(page, 'viewport-0')
  await expect(cell).toHaveAttribute('data-viewport-kind', 'pdf')
  await expect(cell).toContainText('Radiology report')
  await expect(cell).toContainText('1 page')
  await expect(cell.getByLabel('Page 1 of 1')).toBeVisible()
  await cell.getByRole('button', { name: 'Zoom in' }).click()
  await expect(cell).toContainText('125%')
  const download = page.waitForEvent('download')
  await cell.getByRole('button', { name: 'Download PDF' }).click()
  expect((await download).suggestedFilename()).toBe('Radiology_report.pdf')
  // The sidebar thumbnail is the first page.
  await expect(page.locator('nav img')).toHaveAttribute('src', /^data:image\/jpeg/)
  // Image-only buttons are hidden for a PDF.
  await expect(page.getByRole('button', { name: /Invert/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Download PNG' })).toHaveCount(0)
})

test('structured report: UTF-8 text, values and a link to the image', async ({ page }) => {
  await openInput(page, [sample('docs', 'report_sr.dcm'), ...filesIn(sample('basic', 'pet'))])
  const report = page.locator('[data-viewport-kind="sr"]')
  await expect(report).toContainText('Diagnostic Imaging Report')
  await expect(report).toContainText('রহিম করিম') // Bengali patient name (ISO_IR 192)
  await expect(report).toContainText('যকৃতে ২ সেমি ক্ষত')
  await expect(report).toContainText('Length: 20 mm')
  await expect(report).toContainText('Finding: Mass')
  await expect(report).toContainText('Not verified')
  await expect(report.getByRole('heading', { name: 'Conclusion' })).toBeVisible()

  await page.getByLabel('Layout 1×1').click()
  await page.locator('nav').getByText('Structured report').click()
  await report.getByRole('button', { name: 'Show image' }).click()
  await expect(page.getByLabel('Layout 1×2')).toHaveAttribute('aria-pressed', 'true')
  const pet = page.locator('[data-viewport-id]').filter({ hasText: 'PET WB AC' })
  await expect(pet).toContainText('3 / 8')
  const id = (await pet.getAttribute('data-viewport-id'))!
  expect((await viewportProperties(page, id)).index).toBe(2)
})

test('MPEG-2 video cannot play in a browser and is offered for download', async ({ page }) => {
  await openInput(page, sample('video', 'mpeg2.dcm'))
  const cell = viewport(page, 'viewport-0')
  await expect(cell).toContainText('cannot play MPEG2 video')
  const download = page.waitForEvent('download')
  await cell.getByRole('button', { name: 'Download video' }).click()
  expect((await download).suggestedFilename()).toBe('Video_mpeg2.mpg')
})

test('H.264 video either plays or falls back to a download (no H.264 in Chromium)', async ({ page }) => {
  await openInput(page, sample('video', 'h264_annexb.dcm'))
  const cell = viewport(page, 'viewport-0')
  await expect(cell.locator('video').or(cell.getByText('cannot play H264 video'))).toBeVisible()
})

for (const name of ['h264_annexb', 'h264_mp4']) {
  test(`H.264 video plays, steps frames and changes speed (${name}) @chrome`, async ({ page }) => {
    await openInput(page, sample('video', `${name}.dcm`))
    const cell = viewport(page, 'viewport-0')
    const video = cell.locator('video')
    await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.duration)).toBeCloseTo(2, 0)
    expect(await video.evaluate((v: HTMLVideoElement) => [v.videoWidth, v.videoHeight])).toEqual([160, 120])

    // The only cell is already active; clicking the video itself would play/pause it.
    await page.keyboard.press(' ')
    await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime)).toBeGreaterThan(0.3)
    await page.keyboard.press(' ')
    await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true)

    const before = await video.evaluate((v: HTMLVideoElement) => v.currentTime)
    await page.keyboard.press('ArrowRight')
    await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime)).toBeCloseTo(before + 0.04, 2)

    await page.keyboard.press(']')
    await expect(cell.getByLabel('Speed')).toHaveValue('1.5')
    // The sidebar thumbnail is a frame of the video.
    await expect(page.locator('nav img')).toHaveAttribute('src', /^data:image\/jpeg/)
  })
}
