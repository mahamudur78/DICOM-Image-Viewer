/** Ignores hidden and obvious non-DICOM files picked up from folders. */
function isCandidate(file: File) {
  const name = file.name.toLowerCase()
  if (name.startsWith('.')) return false
  return !/\.(txt|pdf|htm|html|xml|exe|dll|ini|inf|jpg|jpeg|png|gif|js|css|json|zip)$/.test(name)
}

function readEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => reader.readEntries(resolve, reject))
}

async function walk(entry: FileSystemEntry, out: File[]) {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject))
    out.push(file)
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
export async function collectDroppedFiles(dataTransfer: DataTransfer): Promise<File[]> {
  const entries = [...dataTransfer.items]
    .map((item) => item.webkitGetAsEntry?.())
    .filter((entry): entry is FileSystemEntry => !!entry)

  if (entries.length === 0) return [...dataTransfer.files].filter(isCandidate)

  const files: File[] = []
  for (const entry of entries) await walk(entry, files)
  return files.filter(isCandidate)
}

export function filterCandidates(files: FileList | File[]) {
  return [...files].filter(isCandidate)
}
