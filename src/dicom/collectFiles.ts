/** A file with the path it was picked or dropped from (folder-relative), used for DICOMDIR and sorting. */
export interface SourceFile {
  file: File
  path: string
}

/** Ignores hidden files and files that are certainly not DICOM, ZIP or an image. */
function isCandidate(path: string) {
  const name = path.split('/').pop()!.toLowerCase()
  if (name.startsWith('.') || name === 'thumbs.db' || name === 'desktop.ini') return false
  return !/\.(txt|pdf|htm|html|xml|exe|dll|ini|inf|js|css|json|ico|lnk|sys|msi|bat|cmd|sh|app|plist|md|rtf|doc|docx)$/.test(name)
}

const source = (file: File, path: string): SourceFile => ({ file, path: path.replace(/^\/+/, '') || file.name })

function readEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => reader.readEntries(resolve, reject))
}

async function walk(entry: FileSystemEntry, out: SourceFile[]) {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject))
    out.push(source(file, entry.fullPath))
    return
  }
  if (entry.isDirectory) {
    const reader = (entry as FileSystemDirectoryEntry).createReader()
    // readEntries returns results in batches; keep reading until empty.
    for (let batch = await readEntries(reader); batch.length > 0; batch = await readEntries(reader)) {
      for (const child of batch) await walk(child, out)
    }
  }
}

/** Collects files from a drop event, descending into dropped folders. */
export async function collectDroppedFiles(dataTransfer: DataTransfer): Promise<SourceFile[]> {
  const entries = [...dataTransfer.items]
    .map((item) => item.webkitGetAsEntry?.())
    .filter((entry): entry is FileSystemEntry => !!entry)

  if (entries.length === 0) return filterCandidates(dataTransfer.files)

  const files: SourceFile[] = []
  for (const entry of entries) await walk(entry, files)
  return files.filter((f) => isCandidate(f.path))
}

/** Files from a file input; folder inputs provide `webkitRelativePath`. */
export function filterCandidates(files: FileList | File[]): SourceFile[] {
  return [...files].map((file) => source(file, file.webkitRelativePath || file.name)).filter((f) => isCandidate(f.path))
}
