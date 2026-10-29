import type { SourceFile } from './collectFiles'
import { sniffFile } from './fileType'
import type { LoadIssue } from './types'

/** Asks the user for a ZIP password; resolves to null when they cancel. */
export type AskPassword = (zipName: string, retry: boolean) => Promise<string | null>

// Protection against "zip bombs" and archives too large for browser memory.
const MAX_ENTRIES = 20_000
const MAX_TOTAL_BYTES = 2 * 1024 ** 3
const MAX_NESTING = 2

export const isZipPath = (path: string) => /\.zip$/i.test(path)

interface ZipResult {
  files: SourceFile[]
  issues: LoadIssue[]
}

/**
 * Extracts every file of a ZIP archive into memory (ZIPs inside it too, up
 * to MAX_NESTING levels). Paths become "archive.zip/folder/file".
 */
export async function extractZip(zip: SourceFile, askPassword: AskPassword, depth = 1): Promise<ZipResult> {
  const { ZipReader, BlobReader, BlobWriter, configure } = await import('@zip.js/zip.js')
  // zip.js's worker pool stalls after a few entries in Chromium (seen with 8+ entries).
  // Without workers, inflating still runs off the main thread in the browser's
  // native DecompressionStream, and AES decryption in WebCrypto.
  configure({ useWebWorkers: false })
  const reader = new ZipReader(new BlobReader(zip.file))
  const files: SourceFile[] = []
  const issues: LoadIssue[] = []

  try {
    const entries = (await reader.getEntries()).filter((entry) => !entry.directory)
    const total = entries.reduce((sum, entry) => sum + entry.uncompressedSize, 0)
    if (entries.length > MAX_ENTRIES || total > MAX_TOTAL_BYTES) {
      return { files, issues: [{ path: zip.path, reason: 'zipLimit' }] }
    }

    let password: string | undefined
    for (const entry of entries) {
      const path = `${zip.path}/${entry.filename}`
      if (/(^|\/)(__MACOSX\/|\.)/.test(entry.filename)) continue // macOS metadata and hidden files

      let blob: Blob | null = null
      while (!blob) {
        if (entry.encrypted && password === undefined) {
          const answer = await askPassword(zip.path, false)
          if (answer === null) return { files, issues: [...issues, { path: zip.path, reason: 'wrongPassword' }] }
          password = answer
        }
        try {
          blob = await entry.getData!(new BlobWriter(), { password })
        } catch (error) {
          if (!entry.encrypted || !/password/i.test(String(error))) {
            issues.push({ path, reason: 'zipFailed', detail: String(error) })
            break
          }
          const answer = await askPassword(zip.path, true)
          if (answer === null) return { files, issues: [...issues, { path: zip.path, reason: 'wrongPassword' }] }
          password = answer
        }
      }
      if (!blob) continue

      const file = new File([blob], entry.filename.split('/').pop()!, { lastModified: entry.lastModDate?.getTime() })
      const isZip = isZipPath(path) || (await sniffFile(file)).type === 'zip'
      if (isZip && depth < MAX_NESTING) {
        const nested = await extractZip({ file, path }, askPassword, depth + 1)
        files.push(...nested.files)
        issues.push(...nested.issues)
      } else if (!isZip) {
        files.push({ file, path })
      }
    }
  } catch (error) {
    issues.push({ path: zip.path, reason: 'zipFailed', detail: String(error) })
  } finally {
    await reader.close()
  }
  return { files, issues }
}
