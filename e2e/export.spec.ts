import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Download, Page } from '@playwright/test'
import { BlobReader, BlobWriter, ZipReader, configure } from '@zip.js/zip.js'
import { SAMPLES_DIR, expect, openInput, openPhantom, test, viewport } from './fixtures'

configure({ useWebWorkers: false })

const sample = (...parts: string[]) => join(SAMPLES_DIR, ...parts)

async function exportMenu(page: Page, name: string | RegExp) {
  await page.getByRole('button', { name: 'Export, print and anonymize' }).click()
  await page.getByRole('menu').getByRole('menuitem', { name }).click()
}

const bytesOf = async (download: Download) => readFileSync((await download.path())!)

async function zipEntries(download: Download) {
  const reader = new ZipReader(new BlobReader(new Blob([await bytesOf(download)])))
  const entries = await reader.getEntries()
  const files = await Promise.all(
    entries.filter((e) => !e.directory).map(async (e) => ({ name: e.filename, data: new Uint8Array(await (await e.getData!(new BlobWriter())).arrayBuffer()) })),
  )
  await reader.close()
  return files
}

/** Runs a dialog's main button and returns the download it starts. */
async function save(page: Page, dialog: string | RegExp, button: string | RegExp = 'Save') {
  const download = page.waitForEvent('download')
  await page.getByRole('dialog', { name: dialog }).getByRole('button', { name: button }).click()
  return download
}

const ascii = (bytes: Uint8Array, start: number, end: number) => String.fromCharCode(...bytes.slice(start, end))

test('images: PNG, JPEG, BMP and TIFF of the current image; a series range as ZIP; original pixel size', async ({ page }) => {
  await openPhantom(page)
  await viewport(page, 'viewport-1').click()
  const dialog = page.getByRole('dialog', { name: 'Export images' })

  await exportMenu(page, 'Export images…')
  const png = await bytesOf(await save(page, 'Export images'))
  expect(ascii(png, 1, 4)).toBe('PNG')

  for (const [format, check] of [
    ['JPEG', (b: Uint8Array) => expect([b[0], b[1]]).toEqual([0xff, 0xd8])],
    ['BMP', (b: Uint8Array) => expect(ascii(b, 0, 2)).toBe('BM')],
    ['TIFF', (b: Uint8Array) => expect(ascii(b, 0, 2)).toBe('II')],
  ] as const) {
    await exportMenu(page, 'Export images…')
    await dialog.getByRole('combobox', { name: 'Format' }).selectOption(format.toLowerCase())
    check(await bytesOf(await save(page, 'Export images')))
  }

  // Images 3–6 of the series, at their own 128 × 128 pixels.
  await exportMenu(page, 'Export images…')
  await dialog.getByRole('combobox', { name: 'Format' }).selectOption('png')
  await dialog.getByRole('combobox', { name: 'Images' }).selectOption('series')
  await dialog.getByRole('spinbutton', { name: 'From image' }).fill('3')
  await dialog.getByRole('spinbutton', { name: 'To image' }).fill('6')
  await dialog.getByRole('combobox', { name: 'Size' }).selectOption('native')
  const files = await zipEntries(await save(page, 'Export images'))
  expect(files.map((f) => f.name)).toEqual(['Native_03.png', 'Native_04.png', 'Native_05.png', 'Native_06.png'])
  const view = new DataView(files[0].data.buffer)
  expect([view.getUint32(16), view.getUint32(20)]).toEqual([128, 128])
})

test('movies: GIF, AVI and WebM of a series', async ({ page }) => {
  await openPhantom(page)
  await viewport(page, 'viewport-3').click()
  const dialog = page.getByRole('dialog', { name: 'Export movie' })
  const make = async (format: string) => {
    await exportMenu(page, 'Export movie…')
    await dialog.getByRole('combobox', { name: 'Format' }).selectOption(format)
    await dialog.getByRole('spinbutton', { name: 'To image' }).fill('5')
    return bytesOf(await save(page, 'Export movie'))
  }
  const gif = await make('gif')
  expect(ascii(gif, 0, 6)).toBe('GIF89a')
  // The browser decodes it: the encoder's LZW is right.
  const size = await page.evaluate(async (data) => {
    const image = new Image()
    image.src = `data:image/gif;base64,${data}`
    await image.decode()
    return [image.width, image.height]
  }, Buffer.from(gif).toString('base64'))
  expect(size[0]).toBeGreaterThan(0)

  const avi = await make('avi')
  expect(ascii(avi, 0, 4)).toBe('RIFF')
  expect(ascii(avi, 8, 12)).toBe('AVI ')

  const webm = await make('webm')
  expect([...webm.slice(0, 4)]).toEqual([0x1a, 0x45, 0xdf, 0xa3])
})

test('MP4 movie (H.264) @chrome', async ({ page }) => {
  await openPhantom(page)
  await viewport(page, 'viewport-3').click()
  await exportMenu(page, 'Export movie…')
  const mp4 = await bytesOf(await save(page, 'Export movie'))
  expect(ascii(mp4, 4, 8)).toBe('ftyp')
})

test('clipboard and region capture', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await openPhantom(page)
  await viewport(page, 'viewport-1').click()
  const clipboardImage = () =>
    page.evaluate(async () => {
      const [item] = await navigator.clipboard.read()
      const blob = await item.getType('image/png')
      const bitmap = await createImageBitmap(blob)
      return [bitmap.width, bitmap.height]
    })
  await page.keyboard.press('Control+c')
  await expect(page.getByText('Image copied to the clipboard.')).toBeVisible()
  const [width] = await clipboardImage()

  await exportMenu(page, 'Capture a region…')
  const area = page.getByRole('application', { name: /Drag a rectangle/ })
  const box = (await area.boundingBox())!
  await page.mouse.move(box.x + 20, box.y + 20)
  await page.mouse.down()
  await page.mouse.move(box.x + 120, box.y + 80, { steps: 5 })
  await page.mouse.up()
  await expect(page.getByText('Region copied to the clipboard.')).toBeVisible()
  const [regionWidth] = await clipboardImage()
  expect(regionWidth).toBeLessThan(width)
})

test('original DICOM files and uncompressed copies', async ({ page }) => {
  await openPhantom(page)
  await viewport(page, 'viewport-1').click()
  const download = page.waitForEvent('download')
  await exportMenu(page, 'Save DICOM files of this series')
  const files = await zipEntries(await download)
  expect(files).toHaveLength(40)
  expect(ascii(files[0].data, 128, 132)).toBe('DICM')

  await openInput(page, sample('compressed', 'rle_ct.dcm'))
  const decompressed = page.waitForEvent('download')
  await exportMenu(page, 'Save series uncompressed (DICOM)')
  const dcm = await bytesOf(await decompressed)
  expect(new TextDecoder('latin1').decode(dcm.slice(0, 400))).toContain('1.2.840.10008.1.2.1')
  // The uncompressed copy shows the same picture.
  await page.locator('input[type=file][multiple]').first().setInputFiles({ name: 'plain.dcm', mimeType: 'application/dicom', buffer: dcm })
  await expect(viewport(page, 'viewport-0')).toContainText('RLE lossless')
})

test('print pages and PDF', async ({ page }) => {
  // Renders six images twice: slow when the suite runs in parallel.
  test.slow()
  await page.addInitScript(() => Object.assign(window, { print: () => {} }))
  await openPhantom(page)
  await viewport(page, 'viewport-1').click()
  await exportMenu(page, 'Print or save as PDF…')
  const dialog = page.getByRole('dialog', { name: 'Print' })
  await dialog.getByRole('combobox', { name: 'Images', exact: true }).selectOption('series')
  await dialog.getByRole('spinbutton', { name: 'To image' }).fill('6')
  await dialog.getByRole('combobox', { name: 'Images per page' }).selectOption('4')
  await dialog.getByRole('button', { name: 'Print', exact: true }).click()
  // Six images, four per page: two pages, each with its header and footer.
  await expect(page.locator('#print-root .page')).toHaveCount(2, { timeout: 45_000 })
  await expect(page.locator('#print-root .page').first().locator('img')).toHaveCount(6)

  await exportMenu(page, 'Print or save as PDF…')
  // The range starts as the whole series again; the other choices are remembered.
  await dialog.getByRole('spinbutton', { name: 'To image' }).fill('6')
  const pdf = new TextDecoder('latin1').decode(await bytesOf(await save(page, 'Print', 'Save PDF')))
  expect(pdf.startsWith('%PDF-1.4')).toBe(true)
  expect(pdf).toContain('/Count 2')
})

test('tags: export, pin, compare and edit', async ({ page }) => {
  await openPhantom(page)
  await viewport(page, 'viewport-1').click()
  await page.getByRole('button', { name: 'DICOM tags (T)' }).click()
  const panel = page.getByRole('complementary', { name: 'DICOM tags' })

  const txt = page.waitForEvent('download')
  await panel.getByRole('button', { name: 'TXT' }).click()
  expect(new TextDecoder().decode(await bytesOf(await txt))).toContain('PatientName = Phantom^Demo')

  await panel.getByRole('button', { name: 'Pin PatientName to the top' }).click()
  await expect(panel.getByTestId('tag-row').first()).toContainText('PatientName')

  await panel.getByRole('button', { name: 'Compare…' }).click()
  await panel.getByRole('combobox', { name: 'Series to compare with' }).selectOption({ label: '2026-01-01 #4 Recon 2' })
  await expect(panel.getByTestId('tag-diff')).toContainText('SeriesDescription')
  await panel.getByRole('button', { name: 'Compare…' }).click()

  await panel.getByRole('button', { name: 'Edit…' }).click()
  const edit = page.getByRole('dialog', { name: 'Edit tags' })
  await edit.getByRole('textbox', { name: 'Value of PatientName' }).fill('Edited^Name')
  const saved = await bytesOf(await save(page, 'Edit tags', 'Save copy'))
  await page.locator('input[type=file][multiple]').first().setInputFiles({ name: 'edited.dcm', mimeType: 'application/dicom', buffer: saved })
  await expect(viewport(page, 'viewport-0')).toContainText('Edited Name')
})

test('anonymize a series: new name, report, and it opens again', async ({ page }) => {
  await openPhantom(page)
  await viewport(page, 'viewport-3').click()
  await exportMenu(page, 'Anonymize…')
  const dialog = page.getByRole('dialog', { name: /^Anonymize/ })
  await dialog.getByRole('textbox', { name: 'New patient name' }).fill('Case^001')
  await dialog.getByRole('textbox', { name: 'New patient ID' }).fill('C001')
  const zip = await save(page, /^Anonymize/, 'Anonymize and save')
  await expect(page.getByTestId('anonymize-report')).toContainText('Saved 20 anonymized files.')
  await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click()
  const files = await zipEntries(zip)
  expect(files.map((f) => f.name)).toContain('anonymized/report.csv')
  const report = new TextDecoder().decode(files.find((f) => f.name.endsWith('report.csv'))!.data)
  expect(report).toContain('00100010,replaced,Case^001')
  expect(report).not.toContain('Phantom^Demo')

  await openInput(page, files.filter((f) => f.name.endsWith('.dcm')).map((f) => ({ name: f.name.split('/').pop()!, mimeType: 'application/dicom', buffer: Buffer.from(f.data) })) as never)
  await expect(viewport(page, 'viewport-0')).toContainText('Case 001')
  await expect(viewport(page, 'viewport-0')).toContainText('C001')
  await expect(viewport(page, 'viewport-0')).toContainText('1 / 20')
})

test('anonymizing burns redaction boxes into compressed pixels', async ({ page }) => {
  await openInput(page, sample('compressed', 'rle_ct.dcm'))
  await expect(page.getByText('Loading images…')).toHaveCount(0)
  // A redaction box over the middle of the image.
  await page.getByRole('button', { name: 'Measurement tools' }).click()
  await page.getByRole('menuitemradio', { name: /^Redaction/ }).click()
  const box = (await viewport(page, 'viewport-0').boundingBox())!
  await page.mouse.move(box.x + box.width * 0.45, box.y + box.height * 0.45)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.55, { steps: 5 })
  await page.mouse.up()

  await exportMenu(page, 'Anonymize…')
  const dialog = page.getByRole('dialog', { name: /^Anonymize/ })
  await expect(dialog.getByRole('alert')).toContainText('1 redaction box')
  const zip = await save(page, /^Anonymize/, 'Anonymize and save')
  await expect(page.getByTestId('anonymize-report')).toContainText('Redaction burned into 1 file.')
  const [dcm] = (await zipEntries(zip)).filter((f) => f.name.endsWith('.dcm'))
  // Uncompressed now; the centre pixel (value 200 in the original) is black.
  const text = new TextDecoder('latin1').decode(dcm.data)
  expect(text).toContain('1.2.840.10008.1.2.1')
  const pixels = dcm.data.slice(dcm.data.length - 64 * 64)
  expect(pixels[32 * 64 + 32]).toBe(0)
  expect(pixels[5 * 64 + 60]).toBe(120)
})

test('convert a PNG and a PDF to DICOM', async ({ page }) => {
  await openPhantom(page)
  await exportMenu(page, 'Convert images or PDF to DICOM…')
  const dialog = page.getByRole('dialog', { name: 'Convert to DICOM' })
  await dialog.getByLabel('Files to convert').setInputFiles([
    { name: 'diagram.png', mimeType: 'image/png', buffer: readFileSync(sample('images', 'diagram.png')) },
    { name: 'note.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n') },
  ])
  await dialog.getByRole('textbox', { name: 'New patient name' }).fill('Converted^Patient')
  const files = await zipEntries(await save(page, 'Convert to DICOM', 'Convert and save'))
  expect(files).toHaveLength(2)
  for (const file of files) expect(ascii(file.data, 128, 132)).toBe('DICM')
  await openInput(page, files.map((f) => ({ name: f.name, mimeType: 'application/dicom', buffer: Buffer.from(f.data) })) as never)
  await expect(page.getByText('Converted Patient').first()).toBeVisible()
})

test('phone: export the current image @mobile', async ({ page }) => {
  await openInput(page, sample('measure', 'dx_ermf.dcm'))
  await exportMenu(page, 'Export images…')
  const png = await bytesOf(await save(page, 'Export images'))
  expect(ascii(png, 1, 4)).toBe('PNG')
})
