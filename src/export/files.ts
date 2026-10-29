// Saving export results: one file directly, several as a ZIP.

export interface OutputFile {
  name: string
  data: Blob
}

export function downloadBlob(blob: Blob, name: string) {
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(link.href), 10_000)
}

/** File-name-safe text. */
export const safeName = (text: string) => text.replace(/[\\/:*?"<>|\s]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80) || 'image'

export async function zipFiles(files: OutputFile[]): Promise<Blob> {
  const { ZipWriter, BlobWriter, BlobReader, configure } = await import('@zip.js/zip.js')
  configure({ useWebWorkers: false })
  const writer = new ZipWriter(new BlobWriter('application/zip'))
  const used = new Set<string>()
  for (const file of files) {
    // Two files of the same name keep both: "a.png", "a_2.png".
    let name = file.name
    for (let n = 2; used.has(name); n++) name = file.name.replace(/(\.[^.]*)?$/, `_${n}$1`)
    used.add(name)
    // Already compressed formats are stored; the rest (BMP, TIFF, DICOM, text) deflated.
    await writer.add(name, new BlobReader(file.data), { level: /\.(png|jpe?g|webp|gif|mp4|webm|avi|pdf)$/i.test(name) ? 0 : 5 })
  }
  return writer.close()
}

/** Downloads one file as it is, several as a ZIP named after the job. */
export async function saveFiles(files: OutputFile[], zipName: string) {
  if (files.length === 0) return
  if (files.length === 1) return downloadBlob(files[0].data, files[0].name)
  downloadBlob(await zipFiles(files), zipName)
}

export const stamp = () => new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')
