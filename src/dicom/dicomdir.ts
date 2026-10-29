import type dicomParser from 'dicom-parser'
import type { SourceFile } from './collectFiles'
import type { LoadIssue } from './types'

const DIRECTORY_RECORD_SEQUENCE = 'x00041220'
const REFERENCED_FILE_ID = 'x00041500'

/** File paths (relative to the DICOMDIR's folder) that a DICOMDIR references. */
export function referencedFiles(dataSet: dicomParser.DataSet): string[] {
  const records = dataSet.elements[DIRECTORY_RECORD_SEQUENCE]?.items ?? []
  return records
    .map((item) => item.dataSet?.string(REFERENCED_FILE_ID))
    .filter((id): id is string => !!id)
    .map((id) => id.split('\\').map((part) => part.trim()).join('/'))
}

/** Normalizes CD paths: case-insensitive, "\" or "/", ISO 9660 ";1" version and trailing dots. */
export const normalizePath = (path: string) =>
  path
    .replace(/\\/g, '/')
    .split('/')
    .map((part) => part.replace(/;\d+$/, '').replace(/\.$/, '').toLowerCase())
    .join('/')

const folderOf = (path: string) => path.slice(0, path.lastIndexOf('/') + 1)

/**
 * Splits files into those a DICOMDIR references and the rest, and reports
 * referenced files that are missing. Files outside the DICOMDIR's folder
 * (e.g. dropped alongside the CD) are kept.
 */
export function applyDicomdir(dicomdirPath: string, references: string[], files: SourceFile[]) {
  const base = normalizePath(folderOf(dicomdirPath))
  const wanted = new Set(references.map((ref) => base + normalizePath(ref)))
  const kept: SourceFile[] = []
  const found = new Set<string>()

  for (const file of files) {
    const path = normalizePath(file.path)
    if (wanted.has(path)) {
      kept.push(file)
      found.add(path)
    } else if (!path.startsWith(base)) {
      kept.push(file) // not part of this CD
    }
  }

  const issues: LoadIssue[] = references
    .filter((ref) => !found.has(base + normalizePath(ref)))
    .map((ref) => ({ path: folderOf(dicomdirPath) + ref, reason: 'missingFromDicomdir' }))
  return { kept, issues }
}
